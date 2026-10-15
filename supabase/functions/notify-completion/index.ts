// Supabase Edge Function: securely sends completion email through Resend.
// Secrets must be set with `supabase secrets set`, never in app.js.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return reply({ error: "需要登入" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return reply({ error: "登入驗證失敗" }, 401);

    const body = await req.json().catch(() => ({}));
    const jobId = String(body.job_id || "");
    if (!jobId) return reply({ error: "缺少 job_id" }, 400);

    const { data: job, error: jobError } = await supabase
      .from("maintenance_jobs")
      .select("id,title,equipment,inspector,template_title,status,remarks,results,completed_at,updated_at")
      .eq("id", jobId)
      .single();

    if (jobError || !job) return reply({ error: "找不到作業紀錄" }, 404);
    if (job.status !== "已完成" || !job.completed_at) {
      return reply({ error: "作業尚未完成，拒絕寄送通知" }, 409);
    }

    const apiKey = Deno.env.get("RESEND_API_KEY");
    const to = (Deno.env.get("MAINTENANCE_NOTIFY_TO") || "").split(",").map(s => s.trim()).filter(Boolean);
    const from = Deno.env.get("MAINTENANCE_FROM_EMAIL");
    if (!apiKey || !to.length || !from) {
      return reply({ error: "郵件服務尚未設定 RESEND_API_KEY、MAINTENANCE_NOTIFY_TO、MAINTENANCE_FROM_EMAIL" }, 500);
    }

    const fmt = (v: unknown) => v ? new Date(String(v)).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }) : "—";
    const resultLines = (Array.isArray(job.results) ? job.results : []).map((r: any, i: number) => {
      const value = r.value === true ? "是" : r.value === false ? "否" : String(r.value ?? "未填");
      return `${i + 1}. ${r.label || "檢查項目"}：${value}${r.unit ? " " + r.unit : ""}`;
    }).join("\n");
    const textBody = [
      "設備保養作業已完成。",
      "",
      `作業名稱：${job.title}`,
      `作業編號：${job.id}`,
      `設備／位置：${job.equipment || "未填"}`,
      `保養人員：${job.inspector}`,
      `表單樣板：${job.template_title || "未填"}`,
      `完成時間：${fmt(job.completed_at)}`,
      `備註：${job.remarks || "無"}`,
      "",
      "— 檢查明細 —",
      resultLines || "無檢查項目",
    ].join("\n");

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        subject: `[保養完成通知] ${job.title} - ${job.inspector}`,
        text: textBody,
      }),
    });
    const mailResult = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("Resend error", response.status, mailResult);
      return reply({ error: "郵件供應商寄送失敗", detail: mailResult.message || mailResult.name || response.status }, 502);
    }
    return reply({ ok: true, id: mailResult.id || null, recipients: to.length });
  } catch (error) {
    console.error(error);
    return reply({ error: "伺服器處理失敗" }, 500);
  }
});

function reply(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
