# 設備保養作業管理系統

GitHub Pages + Supabase Database（免帳號密碼）+ Supabase Edge Function + Resend Email。

## 目前功能
- 免登入：新增作業時只需輸入保養人員姓名
- 多人跨裝置共用 Supabase 資料
- 自訂表單樣板、欄位類型：數字量測、單選、勾選、文字備註、日期時間
- 保養作業暫存、完成、歷史紀錄搜尋
- 單筆 Excel 與搜尋結果清單匯出
- 完成後先成功寫入資料庫，再匯出 Excel，並呼叫 Edge Function 寄信
- RLS：開放 anon 角色讀寫，所有網站訪客共用資料
- 未包含照片上傳（第二階段再加）

## A. 建立 Supabase 專案與資料表
1. 建立 Supabase 專案。
2. 打開 SQL Editor → New query。
3. 將 `supabase/schema.sql` 全文貼入並執行。
4. Dashboard → Project Settings → API，複製 Project URL 與 publishable/anon key。
5. Authentication → Users，建立第一個使用者；若不想讓所有人自行註冊，關閉公開註冊。第一版也提供註冊按鈕，公開註冊是否開放由 Supabase Auth 設定控制。

## B. 設定前端
1. 在 `app.js` 頂部修改：
   - `SUPABASE_URL = "https://你的專案代碼.supabase.co"`
   - `SUPABASE_ANON_KEY = "你的 publishable/anon key"`
2. 這裡只能放 publishable/anon key。**不可放 service_role key、Resend API key 或任何服務端密鑰。**
3. 本地測試可用 VS Code Live Server；也可直接部署到 GitHub Pages。

## C. GitHub Pages 部署
1. 建立 GitHub repository，例如 `maintenance-system`。
2. 上傳 `index.html`、`styles.css`、`app.js`，以及 `supabase` 資料夾（資料夾用於後端部署，不會被前端直接執行）。
3. Repository → Settings → Pages。
4. Build and deployment 選 `Deploy from a branch`；Branch 選 `main`、資料夾選 `/ (root)`，按 Save。
5. 等待 GitHub 顯示網址，開啟網址測試新增作業與共用資料。
6. 修改程式後 commit/push，GitHub Pages 會重新部署。

## D. 設定 Email 自動通知
這個版本使用 Supabase Edge Function + Resend，寄信密鑰只存在伺服器端，不會暴露在 GitHub Pages。

### 先準備
- 安裝 Node.js 與 Supabase CLI（依官方文件安裝）。
- 在 Resend 建立帳號、驗證寄件網域，取得 API Key。
- 將 `supabase/config.toml` 的 `project_id` 改成 Supabase 專案 ref。

### 部署指令（在專案根目錄終端機執行）
```bash
supabase login
supabase link --project-ref 你的_PROJECT_REF
supabase secrets set RESEND_API_KEY=re_xxxxxxxxx
supabase secrets set MAINTENANCE_NOTIFY_TO=主管信箱@example.com,保養窗口@example.com
supabase secrets set MAINTENANCE_FROM_EMAIL="設備保養系統 <maintenance@你的已驗證網域>"
supabase functions deploy notify-completion
```
寄件地址必須符合 Resend 的網域驗證規則。收件人可以用逗號分隔多個 Email。

### 測試
1. 開啟網站（不需登入）。
2. 建立表單樣板。
3. 建立作業、填寫欄位並儲存。
4. 按「結束作業」。
5. 只有資料庫成功寫入完成狀態後才會匯出 Excel 與呼叫寄信函式。
6. 若郵件服務失敗，畫面會顯示「作業已完成並存檔，但 Email 通知失敗」；不會把已存檔的作業誤報成儲存失敗。

## E. 權限與安全注意事項
- RLS 允許 `anon` 與 `authenticated` 角色讀寫資料，所有人共用同一套作業與樣板。
- **重要安全取捨：免登入代表任何知道 GitHub Pages 網址的人都可能讀取、建立、修改及刪除全部資料。** 不要存放機密、個資或敏感營運資訊；若資料需保密，應改用登入或其他驗證機制。
- 建議僅在受控的內部使用情境使用此版本；公開網站可能遭外部人員誤改或刪除資料。
- GitHub Pages 上的網址與前端程式是公開的；anon/publishable key 本身不是服務端密鑰，安全性仰賴 RLS。
- 不要把 `service_role` key、Resend API key 寫入 `app.js` 或提交到 GitHub。
- 作業完成後仍允許編輯，是第一版簡化設計；若需要稽核，可再加「完成後鎖定」與主管簽核。
- 初版採用 JSONB 保存表單欄位與結果，適合快速上線；後續若需要大量統計分析，可再正規化欄位資料。


### 免登入版本的 Email 通知注意事項
免登入後，瀏覽器沒有使用者登入 JWT。Supabase Edge Function 預設會驗證 JWT，因此若未另外設計受保護的通知流程，完成作業時的 Email 通知可能無法呼叫成功。**不要只為了讓寄信成功就直接把通知函式改成完全公開**，否則可能被濫用寄送垃圾郵件。若需要穩定自動寄信，建議再加入伺服器端驗證／限流或改用受控的資料庫觸發通知流程。
