// 定義表單樣板結構
const templates = {
  equipment: {
    title: "設備例行保養單",
    items: [
      "外觀清潔與螺絲緊固",
      "運轉聲音與異常震動檢查",
      "線路與電壓電流量測",
      "潤滑油/冷卻水添加與更換"
    ]
  },
  vehicle: {
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

// 初始化 EmailJS（若有申請 EmailJS，可在此處輸入您的 Public Key）
// emailjs.init("YOUR_PUBLIC_KEY");

// 選擇樣板後呈現動態表單
function renderDynamicForm() {
  const type = document.getElementById("templateSelect").value;
  const container = document.getElementById("formContainer");
  const fields = document.getElementById("dynamicFields");

  if (!type || !templates[type]) {
    container.style.display = "none";
    return;
  }

  container.style.display = "block";
  fields.innerHTML = "";

  const template = templates[type];
  template.items.forEach((item, index) => {
    const itemDiv = document.createElement("div");
    itemDiv.className = "check-item";
    itemDiv.innerHTML = `
      <span>${index + 1}.${item}</span>
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
  const type = document.getElementById("templateSelect").value;
  const template = templates[type];
  
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

  // 2. 匯出 Excel (使用 SheetJS)
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
  const targetEmail = "manager@example.com"; // 預設收件者 Email (可自訂)

  // 方法 A: 呼叫客戶端預設 Email 軟體 (mailto:)
  const subject = encodeURIComponent(`[保養完成通知] ${data.jobTitle} -${data.inspector}`);
  const bodyDetails = data.results.map((r, i) => `${i+1}. ${r.checkItem}:${r.result}`).join("\n");
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

  /* 
  // 方法 B: 若要背景自動寄信，需先申請 EmailJS 並取消此區塊註解：
  emailjs.send("YOUR_SERVICE_ID", "YOUR_TEMPLATE_ID", {
    to_email: targetEmail,
    job_title: data.jobTitle,
    inspector: data.inspector,
    remarks: data.remarks
  }).then(() => {
    alert("郵件已自動發送！");
  });
  */
}

// 頁面載入時初始化
document.addEventListener("DOMContentLoaded", loadHistory);