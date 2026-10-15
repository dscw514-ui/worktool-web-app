/* 設定：Supabase Dashboard → Project Settings → API。
   只填 Project URL 與 publishable/anon key；絕不可放 service_role key。 */
const SUPABASE_URL = "https://izhpffguksslvdvykelc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_sXbmPS9HYPCmi0xvqs79nA_QVFLTxmm";

const hasConfig = SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("YOUR_PROJECT_ID") &&
  !SUPABASE_ANON_KEY.includes("YOUR_SUPABASE");
const db = hasConfig && window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const DEFAULT_FIELDS = [
  { id: crypto.randomUUID(), label: "外觀清潔與螺絲緊固", type: "choice", options: "合格,異常,不適用", unit: "", required: true },
  { id: crypto.randomUUID(), label: "運轉電流", type: "number", options: "", unit: "A", required: false },
  { id: crypto.randomUUID(), label: "保養日期時間", type: "datetime", options: "", unit: "", required: false },
  { id: crypto.randomUUID(), label: "異常說明／處置", type: "text", options: "", unit: "", required: false }
];
let templates = [];
let jobs = [];
let activeFields = [];
let currentResults = {};
let editingTemplateFields = [];
let activeJobTemplateId = null;

const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const message = (id, text, error=false) => { const el=$(id); el.textContent=text||""; el.classList.toggle("error",error); };
const localDateTime = () => new Date().toISOString();
const shortDate = value => value ? new Date(value).toLocaleString("zh-TW") : "—";

function showTab(tab) {
  document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));
  document.querySelectorAll(".tab-content").forEach(el=>el.classList.add("hidden"));
  $("tab-"+tab).classList.remove("hidden");
}
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>showTab(b.dataset.tab)));

async function loadAll() {
  if(!db) return;
  try {
    const [t,j]=await Promise.all([
      db.from("form_templates").select("*").order("updated_at",{ascending:false}),
      db.from("maintenance_jobs").select("*").order("updated_at",{ascending:false})
    ]);
    if(t.error) throw t.error; if(j.error) throw j.error;
    templates=t.data||[]; jobs=j.data||[];
    renderTemplateSelect(); renderTemplateList(); renderHistory();
  } catch(e) {
    message("jobMessage","讀取資料失敗："+e.message,true);
    message("templateMessage","讀取資料失敗："+e.message,true);
  }
}

function renderTemplateSelect(selected="") {
  const el=$("jobTemplate"), prior=selected||el.value;
  el.innerHTML='<option value="">請選擇樣板</option>'+templates.map(t=>`<option value="${esc(t.id)}">${esc(t.title)}</option>`).join("");
  if(templates.some(t=>t.id===prior)) el.value=prior;
}

function resetJob() {
  $("jobForm").reset(); $("jobId").value=""; $("jobStatus").value="進行中";
  $("dynamicFields").innerHTML='<div class="empty">請先選擇表單樣板，再按「套用／重新載入表單」。</div>';
  activeFields=[]; currentResults={}; activeJobTemplateId=null; message("jobMessage","");
}
$("newJobBtn").addEventListener("click",()=>{resetJob();showTab("jobs");});

$("loadTemplateBtn").addEventListener("click",()=>{
  const t=templates.find(x=>x.id===$("jobTemplate").value);
  if(!t) return message("jobMessage","請先選擇表單樣板。",true);
  if(activeFields.length && !confirm("重新載入樣板會清除目前尚未儲存的欄位輸入，確定繼續？")) return;
  activeFields=Array.isArray(t.fields)?t.fields:[];
  currentResults={}; activeJobTemplateId=t.id;
  renderDynamicFields();
  $("formVersionNote").textContent=`樣板：${t.title}；欄位 ${activeFields.length} 個`;
  message("jobMessage","已套用表單，請填寫檢查結果。");
});

function renderDynamicFields() {
  const root=$("dynamicFields");
  if(!activeFields.length) {root.innerHTML='<div class="empty">此樣板尚無欄位，請至「表單樣板」新增欄位。</div>';return;}
  root.innerHTML=activeFields.map((f,i)=>{
    const val=currentResults[f.id]?.value ?? "";
    const required=f.required?'required':'';
    let input="";
    if(f.type==="number") input=`<input type="number" step="any" data-field="${esc(f.id)}" data-type="number" value="${esc(val)}" ${required} placeholder="請輸入數值">`;
    else if(f.type==="text") input=`<textarea data-field="${esc(f.id)}" data-type="text" rows="2" ${required} placeholder="請輸入內容">${esc(val)}</textarea>`;
    else if(f.type==="datetime") input=`<input type="datetime-local" data-field="${esc(f.id)}" data-type="datetime" value="${esc(val)}" ${required}>`;
    else if(f.type==="checkbox") input=`<label class="choice-row"><input type="checkbox" data-field="${esc(f.id)}" data-type="checkbox" ${val===true?'checked':''}> 是／已完成</label>`;
    else {
      const opts=String(f.options||"合格,異常,不適用").split(",").map(x=>x.trim()).filter(Boolean);
      input=`<div class="choice-row">${opts.map((o,j)=>`<label><input type="radio" name="field_${esc(f.id)}" data-field="${esc(f.id)}" data-type="choice" value="${esc(o)}" ${val===o || (!val&&j===0)?'checked':''}> ${esc(o)}</label>`).join("")}</div>`;
    }
    return `<div class="field-card"><div class="field-top"><div><div class="field-title">${i+1}. ${esc(f.label)} ${f.required?'<span class="small" style="color:#b91c1c">＊必填</span>':''}</div><div class="field-meta">${esc(({number:"數字量測",choice:"單選",checkbox:"勾選",text:"文字備註",datetime:"日期時間"})[f.type]||f.type)}${f.unit?' · 單位：'+esc(f.unit):''}</div></div></div><div class="field-input">${input}</div></div>`;
  }).join("");
  root.querySelectorAll("[data-field]").forEach(el=>{
    el.addEventListener("input",()=>captureField(el));
    el.addEventListener("change",()=>captureField(el));
  });
}
function captureField(el) {
  const id=el.dataset.field, type=el.dataset.type;
  let value;
  if(type==="checkbox") value=el.checked;
  else if(type==="choice") {
    const selected=document.querySelector(`input[name="field_${CSS.escape(id)}"]:checked`);
    value=selected?selected.value:"";
  } else value=el.value;
  currentResults[id]={value};
}

function collectResults(validate=false) {
  const output=[];
  for(const f of activeFields) {
    const raw=currentResults[f.id]?.value;
    const value=raw===undefined ? (f.type==="choice" ? (String(f.options||"合格,異常,不適用").split(",")[0].trim()) : "") : raw;
    if(validate && f.required && (value==="" || value===null || value===undefined)) throw new Error(`請填寫必填欄位：「${f.label}」`);
    output.push({field_id:f.id,label:f.label,type:f.type,unit:f.unit||"",value:value??""});
  }
  return output;
}
function collectJob(status) {
  if(!$("jobTitle").value.trim()) throw new Error("請填寫作業名稱。");
  if(!$("inspector").value.trim()) throw new Error("請填寫保養人員。");
  if(!$("jobTemplate").value) throw new Error("請選擇表單樣板。");
  if(activeJobTemplateId!==$("jobTemplate").value) throw new Error("請按「套用／重新載入表單」載入所選樣板。");
  return {
    id:$("jobId").value||crypto.randomUUID(),
    title:$("jobTitle").value.trim(),
    equipment:$("equipment").value.trim(),
    inspector:$("inspector").value.trim(),
    template_id:$("jobTemplate").value,
    template_title:templates.find(t=>t.id===$("jobTemplate").value)?.title||"",
    scheduled_at:$("scheduledAt").value||null,
    status,
    remarks:$("remarks").value.trim(),
    results:collectResults(status==="已完成"),
    completed_at:status==="已完成"?localDateTime():null
  };
}

async function saveJob(status) {
  const btn=status==="已完成"?$("finishBtn"):$("saveDraftBtn");
  btn.disabled=true; message("jobMessage",status==="已完成"?"正在儲存並結束作業…":"正在儲存…");
  try {
    const data=collectJob(status);
    const now=localDateTime();
    const row={...data,updated_at:now};
    if(status!=="已完成") row.completed_at=null;
    const result=await db.from("maintenance_jobs").upsert(row,{onConflict:"id"}).select().single();
    if(result.error) throw result.error;
    $("jobId").value=result.data.id;
    $("jobStatus").value=result.data.status;
    // 只有資料庫成功儲存後，才顯示已完成並寄送通知。
    await loadAll();
    message("jobMessage",status==="已完成"?"作業已成功儲存並結束。正在寄送通知…":"作業已成功儲存。");
    if(status==="已完成") {
      exportJob(result.data);
      const mail=await db.functions.invoke("notify-completion",{body:{job_id:result.data.id}});
      if(mail.error) {
        message("jobMessage","作業已完成並存檔，但 Email 通知失敗："+mail.error.message+"。可至歷史紀錄重新匯出。",true);
      } else if(mail.data?.ok) message("jobMessage","作業已完成並存檔，Excel 已下載，Email 通知已送出。");
      else message("jobMessage","作業已完成並存檔，Excel 已下載；通知服務回覆："+(mail.data?.error||"未確認寄送結果"),true);
    }
  } catch(e) {
    message("jobMessage","儲存失敗，作業狀態未更新："+(e.message||e),true);
  } finally {btn.disabled=false;}
}
$("saveDraftBtn").addEventListener("click",()=>saveJob("進行中"));
$("finishBtn").addEventListener("click",()=>{
  if(confirm("確定結束此保養作業？系統會先存檔，再匯出 Excel 並寄送通知。")) saveJob("已完成");
});
$("exportCurrentBtn").addEventListener("click",()=>{
  try {const data=collectJob($("jobStatus").value||"進行中");exportJob(data);}
  catch(e){message("jobMessage",e.message,true);}
});

function exportJob(job) {
  if(!window.XLSX) return alert("Excel 套件載入失敗，請檢查網路連線。");
  const template=templates.find(t=>t.id===job.template_id);
  const fields=template?.fields||activeFields;
  const results=Array.isArray(job.results)?job.results:[];
  const rows=[["設備保養作業紀錄"],["作業編號",job.id],["作業名稱",job.title],["設備編號／位置",job.equipment||""],["保養人員",job.inspector],["表單樣板",job.template_title||template?.title||""],["預定日期",job.scheduled_at||""],["狀態",job.status],["完成時間",job.completed_at?shortDate(job.completed_at):""],["更新時間",shortDate(job.updated_at||new Date())],["綜合備註",job.remarks||""],[],["項次","檢查項目","類型","單位","檢查結果"]];
  results.forEach((r,i)=>rows.push([i+1,r.label||fields.find(f=>f.id===r.field_id)?.label||"",r.type||"",r.unit||"",r.value===true?"是":r.value===false?"否":r.value??""]));
  const ws=XLSX.utils.aoa_to_sheet(rows);ws["!cols"]=[{wch:10},{wch:34},{wch:14},{wch:12},{wch:36}];
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"保養紀錄");
  XLSX.writeFile(wb,`${safeFile(job.title)}_${safeFile(job.inspector)}_保養紀錄.xlsx`);
}
function safeFile(v){return String(v||"紀錄").replace(/[\\/:*?"<>|]/g,"_").slice(0,80);}

$("newTemplateBtn").addEventListener("click",()=>{resetTemplate();showTab("templates");});
$("resetTemplateBtn").addEventListener("click",resetTemplate);
$("addFieldBtn").addEventListener("click",()=>{editingTemplateFields.push({id:crypto.randomUUID(),label:"",type:"choice",options:"合格,異常,不適用",unit:"",required:false});renderBuilder();});
function resetTemplate(){ $("templateForm").reset();$("templateId").value="";editingTemplateFields=[];renderBuilder();message("templateMessage","");}
function renderBuilder() {
  const root=$("builderFields");
  if(!editingTemplateFields.length){root.innerHTML='<div class="builder-empty">尚無欄位，請按「新增欄位」。</div>';return;}
  root.innerHTML=editingTemplateFields.map((f,i)=>`<div class="builder-row" data-row="${i}">
    <label class="wide">欄位名稱<input data-prop="label" value="${esc(f.label)}" required placeholder="例如：馬達電流"></label>
    <label>欄位類型<select data-prop="type"><option value="number" ${f.type==="number"?"selected":""}>數字量測</option><option value="choice" ${f.type==="choice"?"selected":""}>單選</option><option value="checkbox" ${f.type==="checkbox"?"selected":""}>勾選</option><option value="text" ${f.type==="text"?"selected":""}>文字備註</option><option value="datetime" ${f.type==="datetime"?"selected":""}>日期時間</option></select></label>
    <label>單位<input data-prop="unit" value="${esc(f.unit||"")}" placeholder="A、°C、V"></label>
    <label class="wide">選項（單選用，逗號分隔）<input data-prop="options" value="${esc(f.options||"")}" placeholder="合格,異常,不適用"></label>
    <label class="check-label"><input data-prop="required" type="checkbox" ${f.required?"checked":""}> 必填</label>
    <button type="button" class="btn btn-outline" data-remove="${i}">移除</button>
  </div>`).join("");
  root.querySelectorAll("[data-prop]").forEach(el=>el.addEventListener("input",()=>{const i=Number(el.closest("[data-row]").dataset.row),prop=el.dataset.prop;editingTemplateFields[i][prop]=prop==="required"?el.checked:el.value;}));
  root.querySelectorAll("[data-prop='type']").forEach(el=>el.addEventListener("change",()=>{const i=Number(el.closest("[data-row]").dataset.row);if(el.value==="choice"&&!editingTemplateFields[i].options)editingTemplateFields[i].options="合格,異常,不適用";}));
  root.querySelectorAll("[data-remove]").forEach(el=>el.addEventListener("click",()=>{editingTemplateFields.splice(Number(el.dataset.remove),1);renderBuilder();}));
}
$("templateForm").addEventListener("submit",async e=>{
  e.preventDefault(); const btn=$('#templateForm button[type="submit"]');btn.disabled=true;
  try{
    const title=$("templateTitle").value.trim();
    if(!title)throw new Error("請輸入樣板名稱。");
    const fields=editingTemplateFields.map(f=>({...f,label:String(f.label||"").trim(),unit:String(f.unit||"").trim(),options:String(f.options||"").trim()}));
    if(!fields.length)throw new Error("請至少新增一個欄位。");
    if(fields.some(f=>!f.label))throw new Error("每個欄位都必須填寫名稱。");
    if(fields.some(f=>f.type==="choice"&&!f.options.split(",").map(s=>s.trim()).filter(Boolean).length))throw new Error("單選欄位至少需要一個選項。");
    const row={title,category:$("templateCategory").value.trim(),fields,updated_at:localDateTime()};
    if($("templateId").value)row.id=$("templateId").value;
    const res=await db.from("form_templates").upsert(row).select().single();if(res.error)throw res.error;
    message("templateMessage","樣板已儲存。");resetTemplate();await loadAll();
  }catch(err){message("templateMessage","儲存樣板失敗："+err.message,true);}
  finally{btn.disabled=false;}
});
function editTemplate(t){
  $("templateId").value=t.id;$("templateTitle").value=t.title;$("templateCategory").value=t.category||"";
  editingTemplateFields=(t.fields||[]).map(f=>({...f}));renderBuilder();showTab("templates");window.scrollTo({top:0,behavior:"smooth"});
}
async function deleteTemplate(t){
  if(!confirm(`確定刪除樣板「${t.title}」？已建立的作業紀錄不會刪除。`))return;
  const res=await db.from("form_templates").delete().eq("id",t.id);
  if(res.error)message("templateMessage","刪除失敗："+res.error.message,true);else await loadAll();
}
function renderTemplateList(){
  const root=$("templateList");
  if(!templates.length){root.innerHTML='<div class="empty">尚無樣板，請新增第一張保養表單。</div>';return;}
  root.innerHTML=templates.map(t=>`<div class="record"><div class="record-main"><div class="record-title">${esc(t.title)}</div><div class="record-meta">${esc(t.category||"未分類")} · ${(t.fields||[]).length} 個欄位 · 更新於 ${esc(shortDate(t.updated_at))}</div></div><div class="record-actions"><button class="btn btn-outline" data-edit="${esc(t.id)}">編輯</button><button class="btn btn-outline" data-delete="${esc(t.id)}">刪除</button></div></div>`).join("");
  root.querySelectorAll("[data-edit]").forEach(b=>b.addEventListener("click",()=>{const t=templates.find(x=>x.id===b.dataset.edit);if(t)editTemplate(t);}));
  root.querySelectorAll("[data-delete]").forEach(b=>b.addEventListener("click",()=>{const t=templates.find(x=>x.id===b.dataset.delete);if(t)deleteTemplate(t);}));
}

function renderHistory(){
  const q=$("historySearch").value.trim().toLowerCase(), status=$("historyStatus").value;
  const list=jobs.filter(j=>(!status||j.status===status)&&(!q||[j.title,j.equipment,j.inspector,j.template_title].some(v=>String(v||"").toLowerCase().includes(q))));
  const root=$("historyList");
  if(!list.length){root.innerHTML='<div class="empty">沒有符合條件的紀錄。</div>';return;}
  root.innerHTML=list.map(j=>`<div class="record"><div class="record-main"><div class="record-title">${esc(j.title)} <span class="badge ${j.status==="已完成"?"done":""}">${esc(j.status)}</span></div><div class="record-meta">${esc(j.equipment||"未填設備")} · ${esc(j.inspector)} · ${esc(j.template_title||"")}<br>更新：${esc(shortDate(j.updated_at))}${j.completed_at?" · 完成："+esc(shortDate(j.completed_at)):""}</div></div><div class="record-actions"><button class="btn btn-outline" data-open="${esc(j.id)}">開啟</button><button class="btn btn-outline" data-export="${esc(j.id)}">Excel</button></div></div>`).join("");
  root.querySelectorAll("[data-open]").forEach(b=>b.addEventListener("click",()=>openJob(b.dataset.open)));
  root.querySelectorAll("[data-export]").forEach(b=>b.addEventListener("click",()=>{const j=jobs.find(x=>x.id===b.dataset.export);if(j)exportJob(j);}));
}
$("historySearch").addEventListener("input",renderHistory);$("historyStatus").addEventListener("change",renderHistory);
$("refreshHistoryBtn").addEventListener("click",loadAll);
$("exportAllBtn").addEventListener("click",()=>{
  const q=$("historySearch").value.trim().toLowerCase(),status=$("historyStatus").value;
  const list=jobs.filter(j=>(!status||j.status===status)&&(!q||[j.title,j.equipment,j.inspector,j.template_title].some(v=>String(v||"").toLowerCase().includes(q))));
  if(!list.length)return alert("沒有可匯出的紀錄。");
  const rows=[["作業編號","作業名稱","設備／位置","保養人員","表單樣板","狀態","預定日期","完成時間","備註"]];
  list.forEach(j=>rows.push([j.id,j.title,j.equipment,j.inspector,j.template_title,j.status,j.scheduled_at||"",j.completed_at?shortDate(j.completed_at):"",j.remarks||""]));
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),"作業清單");XLSX.writeFile(wb,"設備保養作業清單.xlsx");
});

async function openJob(id){
  const j=jobs.find(x=>x.id===id);if(!j)return;
  const t=templates.find(x=>x.id===j.template_id);
  if(!t){return alert("原表單樣板目前不存在；此筆紀錄仍可從歷史紀錄匯出。");}
  resetJob();showTab("jobs");
  $("jobId").value=j.id;$("jobTitle").value=j.title||"";$("equipment").value=j.equipment||"";$("inspector").value=j.inspector||"";
  $("jobTemplate").value=j.template_id;$("scheduledAt").value=j.scheduled_at||"";$("jobStatus").value=j.status||"進行中";$("remarks").value=j.remarks||"";
  activeFields=Array.isArray(t.fields)?t.fields:[];activeJobTemplateId=t.id;
  (j.results||[]).forEach(r=>{currentResults[r.field_id]={value:r.value};});
  renderDynamicFields();$("formVersionNote").textContent=`樣板：${t.title}；欄位 ${activeFields.length} 個`;
  // 覆蓋預設 radio 選取，確保歷史資料顯示正確
  for(const f of activeFields){if(f.type==="choice" && currentResults[f.id]){const radios=document.querySelectorAll(`input[name="field_${CSS.escape(f.id)}"]`);radios.forEach(r=>r.checked=r.value===currentResults[f.id].value);}}
}
function init(){
  if(!db){
    $("setupNotice").classList.remove("hidden");
    return;
  }
  resetTemplate();
  renderBuilder();
  resetJob();
  loadAll();
}
init();
