const STORAGE_KEY = 'personal-ledger-expenses-v1';
const form = document.querySelector('#expense-form');
const list = document.querySelector('#expense-list');
const empty = document.querySelector('#empty-state');
const total = document.querySelector('#month-total');
const monthFilter = document.querySelector('#month-filter');
const merchantSearch = document.querySelector('#merchant-search');

let expenses = load();
const today = new Date();
const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
form.elements.date.value = localDate;
monthFilter.value = localDate.slice(0, 7);

function load() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value.filter(item => item && item.id && item.merchant && Number.isFinite(Number(item.amount)) && item.date) : [];
  } catch { return []; }
}

function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses)); }
function money(value) { return `¥${Number(value).toFixed(2)}`; }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }

function render() {
  const month = monthFilter.value;
  const query = merchantSearch.value.trim().toLowerCase();
  const monthExpenses = expenses.filter(item => item.date.startsWith(month));
  const visible = expenses
    .filter(item => !query || item.merchant.toLowerCase().includes(query))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  total.textContent = money(monthExpenses.reduce((sum, item) => sum + Number(item.amount), 0));
  empty.hidden = visible.length > 0;
  list.innerHTML = visible.map(item => `<li class="expense-item">
    <div class="expense-main"><div class="merchant">${escapeHtml(item.merchant)}</div><div class="meta">${escapeHtml(item.date)}${item.note ? ` · ${escapeHtml(item.note)}` : ''}</div></div>
    <div><span class="amount">${money(item.amount)}</span><button class="delete" data-id="${escapeHtml(item.id)}" type="button">删除</button></div>
  </li>`).join('');
}

form.addEventListener('submit', event => {
  event.preventDefault();
  const data = new FormData(form);
  expenses.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, merchant: data.get('merchant').trim(), amount: Number(data.get('amount')), date: data.get('date'), note: data.get('note').trim() });
  save(); form.reset(); form.elements.date.value = localDate; render(); form.elements.merchant.focus();
});
list.addEventListener('click', event => {
  const button = event.target.closest('.delete');
  if (!button) return;
  expenses = expenses.filter(item => item.id !== button.dataset.id); save(); render();
});
monthFilter.addEventListener('input', render);
merchantSearch.addEventListener('input', render);
render();
