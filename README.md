# 設備保養作業管理系統

GitHub Pages + Supabase Database + Supabase Auth（僅管理功能登入）+ Supabase Edge Function + Resend Email。

## 目前功能
- 作業人員免登入：新增／填寫／儲存作業只需輸入保養人員姓名
- 多人跨裝置共用 Supabase 資料
- 管理者登入後可新增／修改／刪除表單樣板；公開作業端只能讀取樣板並填寫
- 保養作業暫存、完成；歷史紀錄查看與管理者登入綁定
- 單筆 Excel 與搜尋結果清單匯出
- 完成後先成功寫入資料庫，再匯出 Excel，並呼叫 Edge Function 寄信
- RLS：anon 可讀樣板與新增／更新作業；只有 authenticated 可管理樣板及讀取歷史紀錄
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
5. 等待 GitHub 顯示網址，測試免登入新增作業；再用管理者帳號登入，測試樣板管理與歷史紀錄。
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
1. 管理者登入網站。
2. 建立表單樣板。
3. 作業人員可不登入，建立作業、填寫欄位並儲存。
4. 免登入作業完成時會匯出 Excel；自動 Email 通知目前只會由已登入的管理者完成作業時呼叫。
5. 只有資料庫成功寫入完成狀態後才會匯出 Excel 與呼叫寄信函式。
6. 若郵件服務失敗，畫面會顯示「作業已完成並存檔，但 Email 通知失敗」；不會把已存檔的作業誤報成儲存失敗。

## E. 權限與安全注意事項
- 表單樣板：所有人可以讀取樣板內容，讓免登入作業人員可以選擇並填寫；新增／修改／刪除僅限 authenticated 管理者。
- 歷史作業紀錄：僅 authenticated 管理者可以查詢、查看及管理。anon 作業人員不會載入歷史清單。
- 免登入作業需要 anon 可新增／更新作業資料。由於未登入人員沒有可靠的身份驗證，資料庫無法確認誰建立了某筆作業；因此 anon 更新權限是公開寫入風險。不要存放機密、敏感個資或高風險營運資料。
- GitHub Pages 上的網址與前端程式是公開的；anon/publishable key 本身不是服務端密鑰，安全性仰賴 RLS。
- 不要把 `service_role` key、Resend API key 寫入 `app.js` 或提交到 GitHub。
- 管理者帳號請在 Supabase Authentication → Users 建立，不要開放網站訪客自行註冊。
- 免登入作業資料儲存後不會顯示歷史紀錄；若要再次開啟或管理既有紀錄，請由管理者登入後操作。
- 初版採用 JSONB 保存表單欄位與結果，適合快速上線；後續若需要稽核、細緻的資料權限或防止公開更新，應改用受保護的 Edge Function/RPC 來寫入作業。

### 免登入版本的 Email 通知注意事項
免登入作業人員沒有登入 JWT，無法安全呼叫預設受 JWT 保護的寄信函式。為避免公開寄信端點被濫用，目前只有管理者登入後結束作業才會呼叫通知函式；免登入作業完成會儲存並匯出 Excel，但不自動寄信。若要讓匿名作業也能自動寄信，建議另加伺服器端驗證／限流流程。
