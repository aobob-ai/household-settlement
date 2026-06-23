const CATEGORIES = ["スーパー", "薬局", "外食", "家賃", "ガス", "その他"];
const PAYERS = [
  { id: "my", label: "俺" },
  { id: "partner", label: "彼女" }
];

const STORAGE_KEY = "householdSettlementData_v1";
const DEFAULT_RATIO = { my: 4, partner: 3 };

const elements = {
  targetMonth: document.querySelector("#targetMonth"),
  myRatio: document.querySelector("#myRatio"),
  partnerRatio: document.querySelector("#partnerRatio"),
  ratioPreview: document.querySelector("#ratioPreview"),
  payerButtons: document.querySelector("#payerButtons"),
  categoryButtons: document.querySelector("#categoryButtons"),
  amount: document.querySelector("#amount"),
  addExpense: document.querySelector("#addExpense"),
  formError: document.querySelector("#formError"),
  monthBadge: document.querySelector("#monthBadge"),
  grandTotal: document.querySelector("#grandTotal"),
  myPaid: document.querySelector("#myPaid"),
  partnerPaid: document.querySelector("#partnerPaid"),
  myShare: document.querySelector("#myShare"),
  partnerShare: document.querySelector("#partnerShare"),
  settlement: document.querySelector("#settlement"),
  categorySummary: document.querySelector("#categorySummary"),
  expenseCount: document.querySelector("#expenseCount"),
  expenseList: document.querySelector("#expenseList"),
  lineText: document.querySelector("#lineText"),
  copyButton: document.querySelector("#copyButton"),
  copyStatus: document.querySelector("#copyStatus"),
  expenseItemTemplate: document.querySelector("#expenseItemTemplate")
};

let state = loadState();
let selectedPayer = "my";
let selectedCategory = CATEGORIES[0];
let currentMonth = getCurrentMonth();
let ratioSaveTimer;

init();

function init() {
  renderChoiceButtons();
  elements.targetMonth.value = currentMonth;
  ensureMonth(currentMonth);
  loadMonth(currentMonth);
  bindEvents();
}

function bindEvents() {
  elements.targetMonth.addEventListener("change", () => {
    if (!elements.targetMonth.value) return;
    clearTimeout(ratioSaveTimer);
    saveRatio();
    currentMonth = elements.targetMonth.value;
    ensureMonth(currentMonth);
    loadMonth(currentMonth);
    elements.copyStatus.textContent = "";
  });

  [elements.myRatio, elements.partnerRatio].forEach((input) => {
    input.addEventListener("input", () => {
      updateRatioPreview();
      clearTimeout(ratioSaveTimer);
      ratioSaveTimer = setTimeout(saveRatio, 250);
    });
    input.addEventListener("change", saveRatio);
  });

  elements.amount.addEventListener("input", () => {
    elements.amount.value = elements.amount.value.replace(/[^0-9]/g, "");
    elements.formError.textContent = "";
  });
  elements.amount.addEventListener("keydown", (event) => {
    if (event.key === "Enter") addExpense();
  });
  elements.addExpense.addEventListener("click", addExpense);
  elements.copyButton.addEventListener("click", copyLineText);
}

function renderChoiceButtons() {
  PAYERS.forEach((payer) => {
    const button = createChoiceButton(payer.label, payer.id === selectedPayer, () => {
      selectedPayer = payer.id;
      updateChoiceSelection(elements.payerButtons, payer.id);
    });
    button.dataset.value = payer.id;
    elements.payerButtons.append(button);
  });

  CATEGORIES.forEach((category) => {
    const button = createChoiceButton(category, category === selectedCategory, () => {
      selectedCategory = category;
      updateChoiceSelection(elements.categoryButtons, category);
    });
    button.dataset.value = category;
    elements.categoryButtons.append(button);
  });
}

function createChoiceButton(label, isSelected, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `choice-button${isSelected ? " is-selected" : ""}`;
  button.textContent = label;
  button.setAttribute("aria-pressed", String(isSelected));
  button.addEventListener("click", onClick);
  return button;
}

function updateChoiceSelection(container, selectedValue) {
  container.querySelectorAll(".choice-button").forEach((button) => {
    const isSelected = button.dataset.value === selectedValue;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && saved.months && saved.lastRatio) return saved;
  } catch (error) {
    console.warn("保存データを読み込めませんでした。", error);
  }
  return { months: {}, lastRatio: { ...DEFAULT_RATIO } };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function ensureMonth(month) {
  if (state.months[month]) return;
  state.months[month] = {
    ratio: { ...state.lastRatio },
    expenses: []
  };
  saveState();
}

function loadMonth(month) {
  const data = state.months[month];
  elements.myRatio.value = data.ratio.my;
  elements.partnerRatio.value = data.ratio.partner;
  updateRatioPreview();
  render();
}

function saveRatio() {
  clearTimeout(ratioSaveTimer);
  const my = Number(elements.myRatio.value);
  const partner = Number(elements.partnerRatio.value);
  if (!Number.isFinite(my) || !Number.isFinite(partner) || !(my > 0) || !(partner > 0)) return;

  state.months[currentMonth].ratio = { my, partner };
  state.lastRatio = { my, partner };
  saveState();
  render();
}

function updateRatioPreview() {
  const my = elements.myRatio.value || "-";
  const partner = elements.partnerRatio.value || "-";
  elements.ratioPreview.textContent = `俺 ${my}：彼女 ${partner}`;
}

function addExpense() {
  const amount = Number(elements.amount.value);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    elements.formError.textContent = "1円以上の金額を入力してください。";
    elements.amount.focus();
    return;
  }

  state.months[currentMonth].expenses.push({
    id: createId(),
    payer: selectedPayer,
    category: selectedCategory,
    amount,
    createdAt: Date.now()
  });
  saveState();
  elements.amount.value = "";
  elements.formError.textContent = "";
  elements.copyStatus.textContent = "";
  render();
  elements.amount.focus();
}

function deleteExpense(id) {
  const expenses = state.months[currentMonth].expenses;
  state.months[currentMonth].expenses = expenses.filter((expense) => expense.id !== id);
  saveState();
  elements.copyStatus.textContent = "";
  render();
}

function render() {
  const data = state.months[currentMonth];
  const totals = calculateTotals(data);
  renderSummary(data, totals);
  renderCategorySummary(totals.byCategory);
  renderExpenseList(data.expenses);
  elements.lineText.value = createLineText(data, totals);
}

function calculateTotals(data) {
  const byCategory = Object.fromEntries(CATEGORIES.map((category) => [category, 0]));
  let myPaid = 0;
  let partnerPaid = 0;

  data.expenses.forEach((expense) => {
    if (!(expense.category in byCategory)) byCategory[expense.category] = 0;
    byCategory[expense.category] += expense.amount;
    if (expense.payer === "my") myPaid += expense.amount;
    else partnerPaid += expense.amount;
  });

  const total = myPaid + partnerPaid;
  const ratioTotal = data.ratio.my + data.ratio.partner;
  const myExpected = total * data.ratio.my / ratioTotal;
  const partnerExpected = total * data.ratio.partner / ratioTotal;
  // 1円単位で精算するため、式の左右をそれぞれ四捨五入してから差を出す。
  // 指定例: 44,921円 - 34,490円 = 10,431円
  const myAdvanceForPartner = Math.round(myPaid * data.ratio.partner / ratioTotal);
  const partnerAdvanceForMy = Math.round(partnerPaid * data.ratio.my / ratioTotal);
  const partnerToMy = myAdvanceForPartner - partnerAdvanceForMy;

  return { byCategory, myPaid, partnerPaid, total, myExpected, partnerExpected, partnerToMy };
}

function renderSummary(data, totals) {
  elements.monthBadge.textContent = formatMonthLabel(currentMonth);
  elements.grandTotal.textContent = formatYen(totals.total);
  elements.myPaid.textContent = formatYen(totals.myPaid);
  elements.partnerPaid.textContent = formatYen(totals.partnerPaid);
  elements.myShare.textContent = `本来の負担 ${formatYen(Math.round(totals.myExpected))}`;
  elements.partnerShare.textContent = `本来の負担 ${formatYen(Math.round(totals.partnerExpected))}`;

  const rounded = Math.round(totals.partnerToMy);
  let result = "精算はありません";
  if (rounded > 0) result = `彼女 → 俺：${formatYen(rounded)}`;
  if (rounded < 0) result = `俺 → 彼女：${formatYen(Math.abs(rounded))}`;
  elements.settlement.innerHTML = "<span>精算結果</span>";
  const strong = document.createElement("strong");
  strong.textContent = result;
  elements.settlement.append(strong);
}

function renderCategorySummary(byCategory) {
  elements.categorySummary.replaceChildren();
  CATEGORIES.forEach((category) => {
    const row = document.createElement("div");
    row.className = "category-row";
    const label = document.createElement("span");
    label.textContent = category;
    const value = document.createElement("strong");
    value.textContent = formatYen(byCategory[category] || 0);
    row.append(label, value);
    elements.categorySummary.append(row);
  });
}

function renderExpenseList(expenses) {
  elements.expenseCount.textContent = `${expenses.length}件`;
  elements.expenseList.replaceChildren();

  if (expenses.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "まだ支出がありません";
    elements.expenseList.append(empty);
    return;
  }

  [...expenses].reverse().forEach((expense) => {
    const item = elements.expenseItemTemplate.content.firstElementChild.cloneNode(true);
    const payer = item.querySelector(".payer-chip");
    payer.textContent = expense.payer === "my" ? "俺" : "彼女";
    payer.classList.toggle("partner", expense.payer === "partner");
    item.querySelector(".expense-category").textContent = expense.category;
    item.querySelector(".expense-amount").textContent = formatYen(expense.amount);
    item.querySelector(".delete-button").addEventListener("click", () => deleteExpense(expense.id));
    elements.expenseList.append(item);
  });
}

function createLineText(data, totals) {
  const monthNumber = Number(currentMonth.split("-")[1]);
  const nonZeroCategories = CATEGORIES.filter((category) => totals.byCategory[category] > 0);
  const lines = [`${monthNumber}月経費`, ""];

  if (nonZeroCategories.length === 0) {
    lines.push("支出なし");
    return lines.join("\n");
  }

  const maxLabelLength = Math.max(...nonZeroCategories.map((category) => category.length));
  nonZeroCategories.forEach((category) => {
    const padding = "　".repeat(Math.max(1, maxLabelLength - category.length + 1));
    lines.push(`${category}${padding}${formatYen(totals.byCategory[category])}`);
  });
  lines.push("");

  const roundedSettlement = Math.round(totals.partnerToMy);
  if (roundedSettlement === 0) {
    lines.push("精算なし");
    return lines.join("\n");
  }

  const recipient = roundedSettlement > 0 ? "彼女支払" : "俺支払";
  const payerA = roundedSettlement > 0 ? "my" : "partner";
  const payerB = roundedSettlement > 0 ? "partner" : "my";
  const ratioA = roundedSettlement > 0 ? data.ratio.partner : data.ratio.my;
  const ratioB = roundedSettlement > 0 ? data.ratio.my : data.ratio.partner;
  const paidA = roundedSettlement > 0 ? totals.myPaid : totals.partnerPaid;
  const paidB = roundedSettlement > 0 ? totals.partnerPaid : totals.myPaid;
  const ratioTotal = data.ratio.my + data.ratio.partner;
  const expressionA = expenseExpression(data.expenses, payerA);
  const expressionB = expenseExpression(data.expenses, payerB);
  const termA = Math.round(paidA * ratioA / ratioTotal);
  const termB = Math.round(paidB * ratioB / ratioTotal);

  lines.push(recipient);
  lines.push(`${expressionA} × ${formatNumber(ratioA)}/${formatNumber(ratioTotal)} - ${expressionB} × ${formatNumber(ratioB)}/${formatNumber(ratioTotal)}`);
  lines.push(`= ${formatNumber(termA)} - ${formatNumber(termB)}`);
  lines.push(`= ${formatYen(Math.abs(roundedSettlement))}`);
  return lines.join("\n");
}

function expenseExpression(expenses, payer) {
  const totalsByCategory = new Map();
  expenses.filter((expense) => expense.payer === payer).forEach((expense) => {
    totalsByCategory.set(expense.category, (totalsByCategory.get(expense.category) || 0) + expense.amount);
  });
  const amounts = CATEGORIES
    .filter((category) => totalsByCategory.has(category))
    .map((category) => formatNumber(totalsByCategory.get(category)));
  if (amounts.length === 0) return "0";
  return amounts.length === 1 ? amounts[0] : `(${amounts.join(" + ")})`;
}

async function copyLineText() {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(elements.lineText.value);
    } else {
      elements.lineText.focus();
      elements.lineText.select();
      const copied = document.execCommand("copy");
      elements.lineText.setSelectionRange(0, 0);
      if (!copied) throw new Error("copy failed");
    }
    elements.copyStatus.textContent = "コピーしました";
  } catch (error) {
    elements.copyStatus.textContent = "コピーできませんでした。テキストを長押ししてコピーしてください。";
  }
}

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(month) {
  const [year, monthNumber] = month.split("-");
  return `${year}年${Number(monthNumber)}月`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 10 }).format(value);
}

function formatYen(value) {
  return `${formatNumber(value)}円`;
}

function createId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
