// 預設樣板（若 LocalStorage 無資料時自動載入）
const defaultTemplates = {
  "tpl_1": {
    title: "設備例行保養單",
    items: [
      "外觀清潔與螺絲緊固",
      "運轉聲音與異常震動檢查",
      "線路與電壓電流量測",
      "潤滑油/冷卻水添加與更換"
    ]
  },
  "tpl_2": {
    title: "公務車輛維護檢查單",
    items: [
      "五油三水檢查",
      "胎壓與胎紋深度測量",
      "煞車系統與燈號測試",
      "車載紀錄器與儀表板異常檢查"
    ]
  }
};

let currentJobId = null;

// 取得當前所有樣板 (從 LocalStorage 或 預設值)
function getTemplates() {
  const stored = localStorage.getItem("custom_templates");
  if (!stored) {
    localStorage.setItem("custom_templates", JSON.stringify(defaultTemplates));
    return defaultTemplates;
  }
  return JSON.parse(stored);
}

// 新增自訂樣板
function addCustomTemplate() {
  const title = document.getElementById("newTemplateTitle").value.trim();
  const itemsText = document.getElementById("newTemplateItems").value.trim();

  if (!title || !itemsText) {
    alert("請填寫「樣板名稱」與「檢查項目」！");
    return;
  }

  // 將多行文字轉為陣列，過濾空白行
  const items = itemsText.split("\n").map(item => item.trim()).filter(item => item.length > 0);

  if (items.length === 0) {
    alert("請至少輸入一個檢查項目！");
    return;
  }

  const templates = getTemplates();
  const newKey = "tpl_" + Date.now();
  
  templates[newKey] = {
    title: title,
    items: items
  };

  localStorage.setItem("custom_templates", JSON.stringify(templates));

  // 清空輸入框並刷新下拉選單
  document.getElementById("newTemplateTitle").value = "";
  document.getElementById("newTemplateItems").value = "";
  alert(`成功新增樣板：「${title}」！`);
  loadTemplateDropdown();
}

// 刪除選中的樣板
function deleteSelectedTemplate() {
  const select = document.getElementById("templateSelect");
  const key = select.value;

  if (!key) {
    alert("請先選擇要刪除的樣板！");
    return;
  }

  const templates = getTemplates();
  const title = templates[key] ? templates[key].title : "";

  if (confirm(`確定要刪除「${title}」樣板嗎？`)) {
    delete templates[key];
    localStorage.setItem("custom_templates", JSON.stringify(templates));
    loadTemplateDropdown();
    document.getElementById("formContainer").style.display = "none";
    alert("樣板已刪除！");
  }
}

// 載入樣板到下拉選單
function loadTemplateDropdown() {
  const select = document.getElementById("templateSelect");
  const templates = getTemplates();

  select.innerHTML = '<option value="">-- 請選擇表單 --</option>';

  for (const [key, tpl] of Object.entries(templates)) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = tpl.title;
    select.appendChild(opt);
  }
}

// 選擇樣板後呈現動態表單
function renderDynamicForm() {
  const key = document.getElementById("templateSelect").value;
  const container = document.getElementById("formContainer");
  const fields = document.getElementById("dynamicFields");
  const templates = getTemplates();

  if (!key || !templates[key]) {
    container.style.display = "none";
    return;
  }

  container.style.display = "block";
  fields.innerHTML = "";

  const template = templates[key];
  template.items.forEach((item, index) => {
    const itemDiv = document.createElement("div");
    itemDiv.className = "check-item";
    itemDiv.innerHTML = `
      <span>${index + 1}. ${item}</span>
      <div class="check-options">
        <label><input type="radio" name="item_${index}" value="合格" checked> 合格</label>
        <label><input type="radio" name="item_${index}" value="異常"> 異常</label>
        <label><input type="radio" name="item_${index}" value="不適用"> N/A</label>
      </div>
    `;
    fields.appendChild(itemDiv);
  });

  if (!currentJobId) {
    currentJobId = "JOB_" + Date.now();
  }
}

// 收集當前表單資料
function getFormData(status = "進行中") {
  const key = document.getElementById("templateSelect").value;
  const templates = getTemplates();
  const template = templates[key];
  
  const results = template ? template.items.map((item, index) => {
    const selected = document.querySelector(`input[name="item_${index}"]:checked`);
    return {
      checkItem: item,
      result: selected ? selected.value : "未填"
    };
  }) : [];

  return {
    id: currentJobId || "JOB_" + Date.now(),
    jobTitle: document.getElementById("jobTitle").value || "未命名作業",
    inspector: document.getElementById("inspector").value || "未填寫",
    templateName: template ? template.title : "未選擇",
    remarks: document.getElementById("remarks").value || "",
    status: status,
    updatedAt: new Date().toLocaleString(),
    results: results
  };
}

// 暫存/儲存作業至 LocalStorage
function saveProgress() {
  const data = getFormData("進行中");
  let records = JSON.parse(localStorage.getItem("maintenance_records") || "[]");
  
  const existingIndex = records.findIndex(r => r.id === data.id);
  if (existingIndex >= 0) {
    records[existingIndex] = data;
  } else {
    records.push(data);
  }

  localStorage.setItem("maintenance_records", JSON.stringify(records));
  alert("作業已儲存！");
  loadHistory();
}

// 載入歷史紀錄
function loadHistory() {
  const historyList = document.getElementById("historyList");
  const records = JSON.parse(localStorage.getItem("maintenance_records") || "[]");

  if (records.length === 0) {
    historyList.innerHTML = "尚無紀錄";
    return;
  }

  historyList.innerHTML = records.map(r => `
    <div class="history-item">
      <div>
        <strong>${r.jobTitle}</strong> (${r.inspector}) - <em>${r.templateName}</em>
        <br><small style="color:#666;">更新時間：${r.updatedAt}</small>
      </div>
      <div>
        <span class="badge ${r.status === '已完成' ? 'badge-done' : ''}">${r.status}</span>
      </div>
    </div>
  `).join("");
}

// 作業結束：匯出 Excel & 發送 Email
function finishJob() {
  const data = getFormData("已完成");
  
  // 1. 存檔
  let records = JSON.parse(localStorage.getItem("maintenance_records") || "[]");
  const existingIndex = records.findIndex(r => r.id === data.id);
  if (existingIndex >= 0) {
    records[existingIndex] = data;
  } else {
    records.push(data);
  }
  localStorage.setItem("maintenance_records", JSON.stringify(records));
  loadHistory();

  // 2. 匯出 Excel
  exportToExcel(data);

  // 3. 寄送 Email 通知
  sendEmailNotification(data);
}

// 匯出 Excel 邏輯
function exportToExcel(data) {
  const excelData = [
    ["保養作業編號", data.id],
    ["保養作業名稱", data.jobTitle],
    ["保養人員", data.inspector],
    ["表單樣板", data.templateName],
    ["完成時間", data.updatedAt],
    ["綜合備註", data.remarks],
    [],
    ["項次", "檢查項目", "檢查結果"]
  ];

  data.results.forEach((item, index) => {
    excelData.push([index + 1, item.checkItem, item.result]);
  });

  const ws = XLSX.utils.aoa_to_sheet(excelData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "保養紀錄");

  XLSX.writeFile(wb, `${data.jobTitle}_${data.inspector}_保養紀錄.xlsx`);
}

// 寄送 Email 邏輯
function sendEmailNotification(data) {
  const targetEmail = "manager@example.com";

  const subject = encodeURIComponent(`[保養完成通知] ${data.jobTitle} - ${data.inspector}`);
  const bodyDetails = data.results.map((r, i) => `${i+1}. ${r.checkItem}: ${r.result}`).join("\n");
  const body = encodeURIComponent(
    `保養作業已順利完成！\n\n` +
    `作業名稱：${data.jobTitle}\n` +
    `保養人員：${data.inspector}\n` +
    `完成時間：${data.updatedAt}\n` +
    `備註：${data.remarks}\n\n` +
    `--- 檢查明細 ---\n` +
    bodyDetails
  );

  window.location.href = `mailto:${targetEmail}?subject=${subject}&body=${body}`;
}

// 頁面載入時初始化
document.addEventListener("DOMContentLoaded", () => {
  loadTemplateDropdown();
  loadHistory();
});