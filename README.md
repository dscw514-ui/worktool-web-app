# 設備保養作業管理系統（重新設計版）

本專案參考附件 `office-drinks-main.zip` 的**模組化前端**（`index.html`、`css/style.css`、`js/config.js`、`js/backend.js`、`js/logic.js`、`js/app.js`）與 **Supabase RPC 伺服器端寫入**設計，並重新實作為設備保養管理系統。不是把飲料系統改名；不會更動既有 `od_` 資料表。

## 功能

- 一般人員**免帳號密碼**：選樣板、輸入姓名與設備、填寫欄位、儲存草稿、結束作業。
- 表單欄位：數字、文字、勾選、單選、日期時間，支援必填與單位。
- 管理者登入後：新增／修改／刪除樣板，查看／編輯歷史作業，手動匯出 CSV（Excel 可開啟）。
- 結束作業**不自動匯出**。只有資料庫 RPC 回傳成功才顯示成功。
- 匿名作業透過伺服器回傳的隨機編輯權杖更新，避免匿名使用者直接查詢歷史作業；權杖只保留在當前網頁狀態，重整頁面後無法繼續編輯，須由管理者處理。
- 歷史紀錄與編輯由資料庫 RPC 檢查 `em_admins`，**不是只靠隱藏按鈕**。

## 部署

1. 在 Supabase Dashboard 建立專案（或沿用既有專案），到 **SQL Editor** 執行 `supabase/setup.sql` 全文。此 SQL 只建立 `em_` 前綴物件，不會刪除原本飲料系統資料。
2. 在 **Authentication → Users** 建立管理者 Email／密碼，並確認該使用者已建立。
3. 在 SQL Editor **單獨執行**下列 SQL（替換管理者信箱）：

   ```sql
   insert into public.em_admins(user_id)
   select id from auth.users where email='你的管理者信箱@example.com'
   on conflict (user_id) do nothing;
   ```

   **注意：** 只有建立 Auth 使用者還不夠，必須將其加入 `em_admins` 才有管理者權限。
4. 修改 `js/config.js`：填入 **Project URL** 與 **Publishable／anon key**。兩者可以出現在前端；**絕對不要放 `service_role` 或 secret key**。
5. 將 `index.html`、`css/`、`js/` 上傳到 GitHub Repository 根目錄，GitHub → Settings → Pages → Deploy from branch → main / root。
6. 開啟 Pages 網址。先按「管理者登入」，建立樣板並新增欄位、儲存；登出後一般人員即可使用。

## 驗收順序

1. 管理者登入 → 新增空白樣板 → 填名稱 → 新增數字欄位／勾選欄位 → **儲存樣板** → 重新整理確認仍存在。
2. 管理者登出 → 選樣板 → 輸入姓名／設備 → 填寫 → **儲存作業**，畫面顯示作業編號。
3. 同頁繼續填寫 → **結束作業**，畫面顯示「已完成」，且不會下載檔案。
4. 管理者登入 → **歷史紀錄** → 重新整理 → 開啟作業 → 修改並儲存。
5. 未登入時不應看見樣板管理與歷史紀錄；直接呼叫管理者 RPC 也應被拒絕。

## 安全與限制

- RLS 開啟，`em_jobs` 與 `em_admins` 不允許瀏覽器直接讀寫；寫入使用受控的 `SECURITY DEFINER` RPC。
- 樣板內容可公開讀取，否則匿名人員無法填寫；樣板的寫入只給已列入 `em_admins` 的管理者。
- 匿名建立作業仍可能遭到垃圾資料濫用。正式公開使用前建議增加 CAPTCHA、速率限制或公司網路存取限制。
- 匿名編輯權杖不持久化；重新整理後不能取回未完成作業。可在下一階段增加具期限的作業恢復連結。
- 此版本不含 Email 完成通知、照片、PDF 或真正 `.xlsx`；手動匯出使用 Excel 可開啟的 UTF-8 CSV。
- 尚未連接你的實際 Supabase 專案做端對端測試；若發生錯誤，畫面右下角會顯示訊息，瀏覽器 F12 → Console 也會記錄。
