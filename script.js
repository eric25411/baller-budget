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
  settings: { 
    initialBalance: 0, 
    scheduleMonthsForward: 12,
    anchorDate: '2026-03-05', 
    periodDays: 14 
  },
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
let currentPeriodOffset = 0; 

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderApp();
}

function setTab(id) {
  activeTab = id;
  renderApp();
}

// --- PERIOD CALCULATIONS ---
function getPeriodDates(offset = 0) {
    let start = parseISODate(state.settings.anchorDate || '2026-03-05');
    let days = parseInt(state.settings.periodDays || 14);
    start.setDate(start.getDate() + (offset * days));
    let end = new Date(start);
    end.setDate(end.getDate() + (days - 1));
    return { start, end };
}

// New helper to find which period "Today" falls into
function getTodayOffset() {
    const today = new Date();
    today.setHours(0,0,0,0);
    const anchor = parseISODate(state.settings.anchorDate);
    const diffTime = today - anchor;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return Math.floor(diffDays / state.settings.periodDays);
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
      if (parsed) { state = parsed; saveState(); alert('Import Success!'); }
    } catch (err) { alert('Import failed.'); }
  };
  reader.readAsText(file);
}

// --- SCHEDULE ENGINE ---
function getScheduleRows() {
  const rows = [];
  const start = new Date();
  const end = addDays(start, (state.settings.scheduleMonthsForward || 12) * 30);
  
  state.bills.forEach(bill => {
    let current = parseISODate(bill.date);
    if (!current) return;
    while (current <= end) {
      const dateStr = toISODate(current);
      const key = `${bill.id}_${dateStr}`;
      const meta = state.scheduleMeta[key] || {};
      rows.push({
        id: key,
        description: bill.name,
        amount: parseFloat(bill.amount),
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

// --- SHARED BUDGET MATH ---
function calculatePeriodStats(offset) {
    const { start, end } = getPeriodDates(offset);
    
    const priorIncome = state.deposits.filter(d => parseISODate(d.date) < start).reduce((s, d) => s + d.amount, 0);
    const priorSpending = state.spending.filter(sp => parseISODate(sp.date) < start).reduce((s, sp) => s + sp.amount, 0);
    const priorBills = getScheduleRows().filter(r => parseISODate(r.date) < start).reduce((s, r) => s + r.amount, 0);
    const carryOver = (parseFloat(state.settings.initialBalance) || 0) + priorIncome - priorBills - priorSpending;

    const pIncome = state.deposits.filter(d => { let dt = parseISODate(d.date); return dt >= start && dt <= end; }).reduce((s, d) => s + d.amount, 0);
    const pSpending = state.spending.filter(sp => { let dt = parseISODate(sp.date); return dt >= start && dt <= end; }).reduce((s, sp) => s + sp.amount, 0);
    const pBills = getScheduleRows().filter(r => { let dt = parseISODate(r.date); return dt >= start && dt <= end; }).reduce((s, r) => s + r.amount, 0);

    return { start, end, carryOver, pIncome, pSpending, pBills, totalLeft: (carryOver + pIncome - pBills - pSpending) };
}

// --- RENDERING TABS ---

function renderDashboard() {
  const todayOffset = getTodayOffset();
  const stats = calculatePeriodStats(todayOffset);
  
  const today = new Date();
  const daysLeft = Math.ceil((stats.end - today) / (1000 * 60 * 60 * 24));

  const container = document.getElementById('tab-dashboard');
  container.innerHTML = `
    <div class="panel" style="text-align:center; padding: 30px 20px;">
        <div class="label" style="text-transform:uppercase; font-size:0.8rem; letter-spacing:1px; color:#636e72">Available Now</div>
        <div class="value" style="font-size: 2.5rem; font-weight: 800; color: var(--accent); margin: 10px 0;">${formatMoney(stats.totalLeft)}</div>
        <div style="font-size: 0.9rem; color: #636e72;">
            Period ends in <strong>${daysLeft} days</strong>
        </div>
    </div>

    <div class="stats">
      <div class="stat"><div class="label">Prior</div><div class="value">${formatMoney(stats.carryOver)}</div></div>
      <div class="stat"><div class="label">Income</div><div class="value" style="color:#2ecc71">${formatMoney(stats.pIncome)}</div></div>
      <div class="stat"><div class="label">Outbound</div><div class="value" style="color:#e74c3c">${formatMoney(stats.pBills + stats.pSpending)}</div></div>
    </div>

    <div class="panel">
        <div class="panel-head"><h3>Quick Summary</h3></div>
        <p style="font-size:0.9rem; line-height:1.6">
            Hey <strong>${state.userName}</strong>, you have <strong>${formatMoney(stats.totalLeft)}</strong> to last you until 
            <strong>${stats.end.toLocaleDateString('en-US', {month:'short', day:'2-digit'})}</strong>. 
            You've spent ${formatMoney(stats.pSpending)} on extra stuff this period.
        </p>
    </div>
  `;
}

function renderBills() {
  const container = document.getElementById('tab-bills');
  container.innerHTML = `
    <div class="panel"><div class="panel-head"><h2>Add Bill</h2></div>
      <div class="stack">
        <input type="text" id="billName" class="field" placeholder="Bill Name">
        <input type="number" id="billAmount" class="field" placeholder="Amount ($)">
        <input type="date" id="billDate" class="field">
        <select id="billFreq" class="field" onchange="document.getElementById('customDays').classList.toggle('hidden', this.value !== 'Custom')">
          <option value="Monthly">Monthly</option><option value="Weekly">Weekly</option><option value="Bi-Weekly">Bi-Weekly</option><option value="Custom">Custom</option>
        </select>
        <input type="number" id="customDays" class="field hidden" placeholder="Days">
        <button class="btn" onclick="addBill()">Save Bill</button>
      </div>
    </div>
    <div class="panel"><div class="table-wrap"><table>
      <tbody>${state.bills.map(b => `<tr><td>${b.name}</td><td>${formatMoney(b.amount)}</td>
      <td><button class="mini-btn danger-btn" onclick="deleteItem('bills','${b.id}')">Del</button></td></tr>`).join('')}</tbody>
    </table></div></div>`;
}

function renderSchedule() {
  const container = document.getElementById('tab-schedule');
  const rows = getScheduleRows().filter(r => r.description.toLowerCase().includes(scheduleSearch.toLowerCase()));
  container.innerHTML = `
    <div class="panel"><input type="text" class="field" placeholder="Search..." oninput="scheduleSearch=this.value;renderSchedule()"></div>
    <div class="table-wrap"><table>
      <tbody>${rows.map(r => `<tr><td>${r.date}</td><td>${r.description}</td><td>${formatMoney(r.amount)}</td>
      <td><button class="mini-btn" onclick="togglePaid('${r.id}')">${r.status === 'Paid' ? 'Undo' : 'Pay'}</button></td></tr>`).join('')}</tbody>
    </table></div>`;
}

function renderSpending() {
  const container = document.getElementById('tab-spending');
  container.innerHTML = `
    <div class="panel">
        <input type="text" id="spDesc" class="field" placeholder="Desc"><input type="number" id="spAmt" class="field" placeholder="$"><input type="date" id="spDate" class="field">
        <button class="btn" onclick="addSpending()">Add Expense</button>
    </div>
    <div class="panel"><div class="table-wrap"><table>
      <tbody>${state.spending.map(s => `<tr><td>${s.date}</td><td>${s.description}</td><td>${formatMoney(s.amount)}</td>
      <td><button class="mini-btn danger-btn" onclick="deleteItem('spending','${s.id}')">Del</button></td></tr>`).join('')}</tbody>
    </table></div></div>`;
}

function renderDeposits() {
  const container = document.getElementById('tab-deposits');
  container.innerHTML = `
    <div class="panel">
        <input type="text" id="dpDesc" class="field" placeholder="Source"><input type="number" id="dpAmt" class="field" placeholder="$"><input type="date" id="dpDate" class="field">
        <button class="btn" onclick="addDeposit()">Add Income</button>
    </div>
    <div class="panel"><div class="table-wrap"><table>
      <tbody>${state.deposits.map(d => `<tr><td>${d.date}</td><td>${d.description}</td><td>${formatMoney(d.amount)}</td>
      <td><button class="mini-btn danger-btn" onclick="deleteItem('deposits','${d.id}')">Del</button></td></tr>`).join('')}</tbody>
    </table></div></div>`;
}

function renderBudget() {
  const stats = calculatePeriodStats(currentPeriodOffset);
  const startStr = stats.start.toLocaleDateString('en-US', {month:'short', day:'2-digit'});
  const endStr = stats.end.toLocaleDateString('en-US', {month:'short', day:'2-digit'});

  const container = document.getElementById('tab-budget');
  container.innerHTML = `
    <div class="panel">
      <div class="panel-head"><h2>Budget Analysis</h2></div>
      
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <button class="tab-btn" onclick="changePeriod(-1)">◀</button>
        <div style="text-align: center;">
          <strong style="display: block; font-size: 1.1rem;">${startStr} - ${endStr}</strong>
          <button class="mini-btn" style="margin-top:5px; font-size:0.7rem;" onclick="currentPeriodOffset=getTodayOffset();renderBudget()">Jump to Today</button>
        </div>
        <button class="tab-btn" onclick="changePeriod(1)">▶</button>
      </div>

      <div class="stack" style="gap:12px">
        <div style="display:flex; justify-content:space-between; color:#636e72"><span>Prior Leftover</span><strong>${formatMoney(stats.carryOver)}</strong></div>
        <div style="display:flex; justify-content:space-between"><span>New Income</span><strong>${formatMoney(stats.pIncome)}</strong></div>
        <div style="display:flex; justify-content:space-between"><span>Period Bills</span><strong style="color:#e74c3c">${formatMoney(stats.pBills)}</strong></div>
        <div style="display:flex; justify-content:space-between"><span>Misc Spent</span><strong style="color:#e74c3c">${formatMoney(stats.pSpending)}</strong></div>
        <hr style="border:0; border-top:1px solid #eee; margin:5px 0;">
        <div style="display:flex; justify-content:space-between; font-size:1.2rem; font-weight:bold;">
          <span>Current Leftover</span><span style="color:#3498db">${formatMoney(stats.totalLeft)}</span>
        </div>
      </div>
    </div>
    
    <div class="panel">
        <div class="panel-head"><h3>Manual Adjustments</h3></div>
        <label style="font-size:0.8rem; color:#666;">Set Manual Starting Balance</label>
        <input type="number" class="field" placeholder="Enter leftover before anchor" value="${state.settings.initialBalance}" onchange="state.settings.initialBalance=this.value;saveState()">
        
        <label style="font-size:0.8rem; color:#666;">Change Period Start Date</label>
        <input type="date" class="field" value="${state.settings.anchorDate}" onchange="state.settings.anchorDate=this.value; currentPeriodOffset=getTodayOffset(); saveState()">
    </div>`;
}

function renderSettings() {
  const container = document.getElementById('tab-settings');
  container.innerHTML = `
    <div class="panel"><div class="panel-head"><h2>App Settings</h2></div>
      <div class="stack">
        <label>Display Name</label>
        <input type="text" class="field" value="${state.userName}" onchange="state.userName=this.value;saveState()">
        
        <label>Default Cycle Start (Anchor)</label>
        <input type="date" class="field" value="${state.settings.anchorDate}" onchange="state.settings.anchorDate=this.value;saveState()">
        
        <label>Cycle Length (Days)</label>
        <input type="number" class="field" value="${state.settings.periodDays}" onchange="state.settings.periodDays=this.value;saveState()">
      </div>
    </div>
    <div class="panel">
      <div class="stack">
        <button class="btn" style="background:#34495e; margin-bottom:10px;" onclick="exportData()">Export Data</button>
        <input type="file" accept=".json" onchange="handleImport(event)" class="field">
        <button class="danger-btn" style="margin-top:15px" onclick="if(confirm('Wipe all?')){state=clone(defaultData);saveState()}">Nuke All Data</button>
      </div>
    </div>`;
}

// --- ACTIONS ---
function togglePaid(key) { state.scheduleMeta[key] = { paid: !state.scheduleMeta[key]?.paid }; saveState(); }
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

  // Sync internal offset to "Today" whenever we start up
  if (!currentPeriodOffset) currentPeriodOffset = getTodayOffset();

  if (activeTab === 'dashboard') renderDashboard();
  else if (activeTab === 'bills') renderBills();
  else if (activeTab === 'schedule') renderSchedule();
  else if (activeTab === 'budget') renderBudget();
  else if (activeTab === 'spending') renderSpending();
  else if (activeTab === 'deposits') renderDeposits();
  else if (activeTab === 'settings') renderSettings();
}

window.onload = renderApp;
