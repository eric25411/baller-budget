const STORAGE_KEY = 'budgetflow-v1';

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'bills', label: 'Bills' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'budget', label: 'Budget Tracker' },
  { id: 'spending', label: 'Other Spending' },
  { id: 'deposits', label: 'Deposits' },
  { id: 'settings', label: 'Settings' },
];

// --- BUDGET PERIOD CONFIG ---
let anchorDate = new Date('2026-03-02'); // Starting point for cycles
let periodDays = 14; 
let currentPeriodOffset = 0; // 0 is the cycle containing the anchor/current date

// --- CORE UTILS ---
function clone(obj) { return JSON.parse(JSON.stringify(obj)); }
function makeId(prefix) { return prefix + '-' + Math.random().toString(36).slice(2, 8) + '-' + Date.now().toString(36); }
function pad(n) { return String(n).padStart(2, '0'); }
function parseISODate(value) {
  if (!value) return null;
  const p = value.split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2]);
}
function toISODate(date) { return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()); }
function addDays(date, days) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
function formatMoney(v) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v || 0); }

// --- STATE MANAGEMENT ---
const defaultData = {
  settings: { openingBalance: 0, scheduleMonthsForward: 12 },
  userName: 'Baller',
  bills: [],
  spending: [],
  deposits: [],
  scheduleMeta: {}
};

let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || clone(defaultData);
let activeTab = 'dashboard';
let scheduleSearch = '';
let filter30Days = false; 

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderApp();
}

function setTab(id) {
  activeTab = id;
  renderApp();
}

// --- PERIOD CALCULATIONS ---
function getPeriodDates() {
    let start = new Date(anchorDate);
    start.setDate(start.getDate() + (currentPeriodOffset * periodDays));
    let end = new Date(start);
    end.setDate(end.getDate() + (periodDays - 1));
    return { start, end };
}

function changePeriod(direction) {
    currentPeriodOffset += direction;
    renderBudget();
}

// --- DATA MANAGEMENT ---
function exportData() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
  const downloadAnchorNode = document.createElement('a');
  downloadAnchorNode.setAttribute("href", dataStr);
  downloadAnchorNode.setAttribute("download", "budgetflow-backup.json");
  document.body.appendChild(downloadAnchorNode);
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
}

function handleImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const parsed = JSON.parse(e.target.result);
      if (parsed) { 
        state = parsed;
        saveState();
        alert('Data imported successfully!');
      }
    } catch (err) { alert('Import failed.'); }
  };
  reader.readAsText(file);
}

// --- SCHEDULE ENGINE ---
function getScheduleRows() {
  const rows = [];
  const start = new Date();
  const end = addDays(start, (state.settings.scheduleMonthsForward || 12) * 30);
  const thirtyDaysOut = addDays(start, 30);

  state.bills.forEach(bill => {
    let current = parseISODate(bill.date);
    if (!current) return;
    while (current <= end) {
      if (filter30Days && current > thirtyDaysOut) break; 
      const dateStr = toISODate(current);
      const key = `${bill.id}_${dateStr}`;
      const meta = state.scheduleMeta[key] || {};
      rows.push({
        id: key,
        description: bill.name,
        amount: bill.amount,
        date: dateStr,
        status: meta.paid ? 'Paid' : (current < new Date() ? 'Overdue' : 'Upcoming')
      });
      if (bill.frequency === 'Weekly') current = addDays(current, 7);
      else if (bill.frequency === 'Bi-Weekly') current = addDays(current, 14);
      else if (bill.frequency === 'Monthly') { current.setMonth(current.getMonth() + 1); }
      else if (bill.frequency === 'Custom' && bill.customDays) current = addDays(current, parseInt(bill.customDays));
      else break;
    }
  });
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

// --- RENDERING TABS ---

function renderDashboard() {
  const income = state.deposits.reduce((s, d) => s + d.amount, 0);
  const bills = state.bills.reduce((s, b) => s + b.amount, 0);
  const spending = state.spending.reduce((s, sp) => s + sp.amount, 0);
  const container = document.getElementById('tab-dashboard');
  container.innerHTML = `
    <div class="stats">
      <div class="stat"><div class="label">Income</div><div class="value" style="color:#2ecc71">${formatMoney(income)}</div></div>
      <div class="stat"><div class="label">Outbound</div><div class="value" style="color:#e74c3c">${formatMoney(bills + spending)}</div></div>
      <div class="stat"><div class="label">Net</div><div class="value" style="color:#3498db">${formatMoney(income - (bills + spending))}</div></div>
    </div>
    <div class="panel"><div class="panel-body"><h3>Welcome, ${state.userName}</h3></div></div>`;
}

function renderBills() {
  const container = document.getElementById('tab-bills');
  container.innerHTML = `
    <div class="panel"><div class="panel-head"><h2>Add New Bill</h2></div>
      <div class="panel-body stack">
        <input type="text" id="billName" class="field" placeholder="Bill Name">
        <input type="number" id="billAmount" class="field" placeholder="Amount ($)">
        <input type="date" id="billDate" class="field">
        <select id="billFreq" class="field" onchange="toggleCustomFreq(this.value)">
          <option value="Monthly">Monthly</option>
          <option value="Weekly">Weekly</option>
          <option value="Bi-Weekly">Bi-Weekly</option>
          <option value="Custom">Custom Days</option>
        </select>
        <input type="number" id="customDays" class="field hidden" placeholder="Days">
        <button class="btn" onclick="addBill()">Save Bill</button>
      </div>
    </div>
    <div class="panel"><div class="table-wrap"><table>
      <thead><tr><th>Name</th><th>Amt</th><th>Freq</th><th>Action</th></tr></thead>
      <tbody>${state.bills.map(b => `<tr><td>${b.name}</td><td>${formatMoney(b.amount)}</td><td>${b.frequency}</td>
      <td><button class="mini-btn danger-btn" onclick="deleteItem('bills','${b.id}')">Del</button></td></tr>`).join('')}</tbody>
    </table></div></div>`;
}

function renderSchedule() {
  const container = document.getElementById('tab-schedule');
  const rows = getScheduleRows().filter(r => r.description.toLowerCase().includes(scheduleSearch.toLowerCase()));
  container.innerHTML = `
    <div class="panel"><div class="panel-head"><h2>Payment Schedule</h2></div>
      <div class="stack">
        <input type="text" class="field" placeholder="Search..." oninput="updateSearch(this.value)">
        <label style="display:flex; align-items:center; gap:10px; margin:10px 0;">
          <input type="checkbox" ${filter30Days ? 'checked' : ''} onchange="toggle30DayFilter(this.checked)"> 
          Next 30 days only
        </label>
      </div>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>Date</th><th>Bill</th><th>Amt</th><th>Status</th><th>Action</th></tr></thead>
      <tbody>${rows.map(r => `<tr><td>${r.date}</td><td>${r.description}</td><td>${formatMoney(r.amount)}</td>
      <td><span class="status ${r.status.toLowerCase()}">${r.status}</span></td>
      <td><button class="mini-btn" onclick="togglePaid('${r.id}')">${r.status === 'Paid' ? 'Undo' : 'Pay'}</button></td></tr>`).join('')}</tbody>
    </table></div>`;
}

function renderSpending() {
  const container = document.getElementById('tab-spending');
  container.innerHTML = `
    <div class="panel"><div class="panel-head"><h2>Other Spending</h2></div>
      <div class="panel-body stack">
        <input type="text" id="spDesc" class="field" placeholder="Description">
        <input type="number" id="spAmt" class="field" placeholder="Amount ($)">
        <input type="date" id="spDate" class="field">
        <button class="btn" onclick="addSpending()">Add Expense</button>
      </div>
    </div>
    <div class="panel"><div class="table-wrap"><table>
      <tbody>${state.spending.map(s => `<tr><td>${s.date}</td><td>${s.description}</td><td>${formatMoney(s.amount)}</td>
      <td><button class="mini-btn danger-btn" onclick="deleteItem('spending','${s.id}')">Del</button></td></tr>`).join('')}</tbody>
    </table></div></div>`;
}

function renderDeposits() {
  const container = document.getElementById('tab-deposits');
  container.innerHTML = `
    <div class="panel"><div class="panel-head"><h2>Income</h2></div>
      <div class="panel-body stack">
        <input type="text" id="dpDesc" class="field" placeholder="Source">
        <input type="number" id="dpAmt" class="field" placeholder="Amount ($)">
        <input type="date" id="dpDate" class="field">
        <button class="btn" onclick="addDeposit()">Add Income</button>
      </div>
    </div>
    <div class="panel"><div class="table-wrap"><table>
      <tbody>${state.deposits.map(d => `<tr><td>${d.date}</td><td>${d.description}</td><td>${formatMoney(d.amount)}</td>
      <td><button class="mini-btn danger-btn" onclick="deleteItem('deposits','${d.id}')">Del</button></td></tr>`).join('')}</tbody>
    </table></div></div>`;
}

function renderBudget() {
  const { start, end } = getPeriodDates();
  const startStr = start.toLocaleDateString('en-US', {month:'short', day:'2-digit'});
  const endStr = end.toLocaleDateString('en-US', {month:'short', day:'2-digit'});

  // Math for Period
  const periodIncome = state.deposits.filter(d => {
    let dt = parseISODate(d.date);
    return dt >= start && dt <= end;
  }).reduce((s, d) => s + d.amount, 0);

  const periodSpending = state.spending.filter(sp => {
    let dt = parseISODate(sp.date);
    return dt >= start && dt <= end;
  }).reduce((s, sp) => s + sp.amount, 0);

  // Get Bills scheduled within this period
  const periodBills = getScheduleRows().filter(r => {
    let dt = parseISODate(r.date);
    return dt >= start && dt <= end;
  }).reduce((s, r) => s + r.amount, 0);

  const container = document.getElementById('tab-budget');
  container.innerHTML = `
    <div class="panel">
      <div class="panel-head"><h2>Budget Tracker</h2></div>
      
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px;">
        <button class="tab-btn" onclick="changePeriod(-1)">◀</button>
        <div style="text-align: center;">
          <strong style="display: block; font-size: 1.1rem;">${startStr} - ${endStr}</strong>
          <span style="font-size: 0.8rem; color: #636e72;">14-Day Period</span>
        </div>
        <button class="tab-btn" onclick="changePeriod(1)">▶</button>
      </div>

      <div class="stack" style="gap:15px">
        <div style="display:flex; justify-content:space-between"><span>Period Income</span><strong>${formatMoney(periodIncome)}</strong></div>
        <div style="display:flex; justify-content:space-between"><span>Scheduled Bills</span><strong style="color:#e74c3c">${formatMoney(periodBills)}</strong></div>
        <div style="display:flex; justify-content:space-between"><span>Other Spending</span><strong style="color:#e74c3c">${formatMoney(periodSpending)}</strong></div>
        <hr style="border:0; border-top:1px solid #eee; margin:10px 0;">
        <div style="display:flex; justify-content:space-between; font-size:1.2rem; font-weight:bold;">
          <span>Leftover</span><span style="color:#3498db">${formatMoney(periodIncome - periodBills - periodSpending)}</span>
        </div>
      </div>
    </div>`;
}

function renderSettings() {
  const container = document.getElementById('tab-settings');
  container.innerHTML = `
    <div class="panel"><div class="panel-head"><h2>Settings</h2></div>
      <div class="stack">
        <label>User Name</label>
        <input type="text" class="field" value="${state.userName}" onchange="state.userName=this.value;saveState()">
      </div>
    </div>
    <div class="panel">
      <div class="panel-head"><h2>Data Management</h2></div>
      <div class="stack">
        <button class="btn" style="background:#34495e; margin-bottom:15px;" onclick="exportData()">Download Backup</button>
        <input type="file" id="importFile" accept=".json" onchange="handleImport(event)" class="field">
        <button class="danger-btn" style="margin-top:20px" onclick="if(confirm('Wipe everything?')){state=clone(defaultData);saveState()}">Factory Reset</button>
      </div>
    </div>`;
}

// --- ACTIONS ---
function toggleCustomFreq(v) { document.getElementById('customDays').classList.toggle('hidden', v !== 'Custom'); }
function updateSearch(v) { scheduleSearch = v; renderSchedule(); }
function toggle30DayFilter(v) { filter30Days = v; renderSchedule(); }
function togglePaid(key) { 
  state.scheduleMeta[key] = { paid: !state.scheduleMeta[key]?.paid }; 
  saveState(); 
}
function deleteItem(coll, id) { state[coll] = state[coll].filter(i => i.id !== id); saveState(); }

function addBill() {
  const n = document.getElementById('billName').value, a = parseFloat(document.getElementById('billAmount').value), d = document.getElementById('billDate').value, f = document.getElementById('billFreq').value, c = document.getElementById('customDays').value;
  if (!n || isNaN(a) || !d) return;
  state.bills.push({ id: makeId('bill'), name: n, amount: a, date: d, frequency: f, customDays: c });
  saveState();
}

function addSpending() {
  const d = document.getElementById('spDesc').value, a = parseFloat(document.getElementById('spAmt').value), dt = document.getElementById('spDate').value;
  if (!d || isNaN(a) || !dt) return;
  state.spending.push({ id: makeId('sp'), description: d, amount: a, date: dt });
  saveState();
}

function addDeposit() {
  const d = document.getElementById('dpDesc').value, a = parseFloat(document.getElementById('dpAmt').value), dt = document.getElementById('dpDate').value;
  if (!d || isNaN(a) || !dt) return;
  state.deposits.push({ id: makeId('dp'), description: d, amount: a, date: dt });
  saveState();
}

function renderApp() {
  const nav = document.getElementById('tabs');
  nav.innerHTML = TABS.map(t => `<button class="tab-btn ${activeTab === t.id ? 'active' : ''}" onclick="setTab('${t.id}')">${t.label}</button>`).join('');
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  document.getElementById(`tab-${activeTab}`).classList.remove('hidden');

  if (activeTab === 'dashboard') renderDashboard();
  else if (activeTab === 'bills') renderBills();
  else if (activeTab === 'schedule') renderSchedule();
  else if (activeTab === 'budget') renderBudget();
  else if (activeTab === 'spending') renderSpending();
  else if (activeTab === 'deposits') renderDeposits();
  else if (activeTab === 'settings') renderSettings();
}

window.onload = renderApp;
