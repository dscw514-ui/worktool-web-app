# 設備保養作業管理系統

GitHub Pages + Supabase Auth/Database + Supabase Edge Function + Resend Email。

## 目前功能
- Email/密碼登入與帳號建立入口
- 多人跨裝置共用 Supabase 資料
- 自訂表單樣板、欄位類型：數字量測、單選、勾選、文字備註、日期時間
- 保養作業暫存、完成、歷史紀錄搜尋
- 單筆 Excel 與搜尋結果清單匯出
- 完成後先成功寫入資料庫，再匯出 Excel，並呼叫 Edge Function 寄信
- RLS：僅已登入使用者可讀寫；第一版所有已登入使用者權限相同
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
5. 等待 GitHub 顯示網址，開啟網址測試登入。
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
1. 登入網站。
2. 建立表單樣板。
3. 建立作業、填寫欄位並儲存。
4. 按「結束作業」。
5. 只有資料庫成功寫入完成狀態後才會匯出 Excel 與呼叫寄信函式。
6. 若郵件服務失敗，畫面會顯示「作業已完成並存檔，但 Email 通知失敗」；不會把已存檔的作業誤報成儲存失敗。

## E. 權限與安全注意事項
- RLS 只允許 `authenticated` 角色讀寫資料；未登入的 `anon` 不能讀取或修改資料。
- 第一版所有已登入使用者都可讀寫、修改及刪除所有作業與樣板，尚未區分管理者/保養人員/主管。若資料需要限制部門或人員，應在上線前增加角色與資料列政策。
- 如果啟用公開註冊，任何人都可能建立帳號。若只供公司內部使用，建議關閉公開註冊，由管理者在 Supabase Auth 建立帳號。
- GitHub Pages 上的網址與前端程式是公開的；anon/publishable key 本身不是服務端密鑰，安全性仰賴 RLS。
- 不要把 `service_role` key、Resend API key 寫入 `app.js` 或提交到 GitHub。
- 作業完成後仍允許編輯，是第一版簡化設計；若需要稽核，可再加「完成後鎖定」與主管簽核。
- 初版採用 JSONB 保存表單欄位與結果，適合快速上線；後續若需要大量統計分析，可再正規化欄位資料。
