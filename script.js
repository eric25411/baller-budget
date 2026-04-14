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
  if (!value) return new Date();
  const p = value.split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2]);
}
function toISODate(date) { return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()); }
function addDays(date, days) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
function formatMoney(v) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v || 0); }

// --- STATE MANAGEMENT ---
const defaultData = {
  settings: { initialBalance: 0, anchorDate: '2026-03-05', periodDays: 14, scheduleMonthsForward: 12 },
  userName: 'Baller',
  bills: [],
  spending: [],
  deposits: [],
  scheduleMeta: {} 
};

let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || clone(defaultData);
// Ensure missing keys are back-filled
state.bills = state.bills || [];
state.spending = state.spending || [];
state.deposits = state.deposits || [];
state.settings = { ...defaultData.settings, ...state.settings };

let activeTab = 'dashboard', currentPeriodOffset = 0;

function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); renderApp(); }

function setTab(id) { 
    if(['budget', 'spending', 'deposits', 'schedule'].includes(id)) {
        const today = new Date(); today.setHours(0,0,0,0);
        const anchor = parseISODate(state.settings.anchorDate);
        const diffDays = Math.floor((today - anchor) / (1000 * 60 * 60 * 24));
        currentPeriodOffset = Math.floor(diffDays / (state.settings.periodDays || 14));
    }
    activeTab = id; 
    renderApp(); 
}

// --- LOGIC: CUSTOM SCHEDULES ---
function getScheduleRows() {
  const rows = [];
  const endLimit = addDays(new Date(), (state.settings.scheduleMonthsForward || 12) * 30);
  
  state.bills.forEach(bill => {
    let current = parseISODate(bill.date);
    const billEnd = bill.endDate ? parseISODate(bill.endDate) : endLimit;
    const actualLimit = billEnd < endLimit ? billEnd : endLimit;

    while (current <= actualLimit) {
        const dateStr = toISODate(current);
        const key = `${bill.id}_${dateStr}`;
        const meta = state.scheduleMeta[key] || {};
        rows.push({
          id: key, billId: bill.id, description: bill.name, 
          amount: (meta.actualAmount !== undefined) ? meta.actualAmount : parseFloat(bill.amount), 
          date: dateStr, status: meta.paid ? 'Paid' : (current < new Date().setHours(0,0,0,0) ? 'Overdue' : 'Upcoming')
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

function calculatePeriodStats(offset) {
    const start = parseISODate(state.settings.anchorDate);
    const days = parseInt(state.settings.periodDays || 14);
    start.setDate(start.getDate() + (offset * days));
    const end = new Date(start); end.setDate(end.getDate() + (days - 1));
    
    const schedule = getScheduleRows();
    const pIncome = state.deposits.filter(d => { let dt = parseISODate(d.date); return dt >= start && dt <= end; }).reduce((s, d) => s + d.amount, 0);
    const pSpending = state.spending.filter(sp => { let dt = parseISODate(sp.date); return dt >= start && dt <= end; }).reduce((s, sp) => s + sp.amount, 0);
    const pBills = schedule.filter(r => { let dt = parseISODate(r.date); return dt >= start && dt <= end; }).reduce((s, r) => s + r.amount, 0);
    
    const priorIncome = state.deposits.filter(d => parseISODate(d.date) < start).reduce((s, d) => s + d.amount, 0);
    const priorSpending = state.spending.filter(sp => parseISODate(sp.date) < start).reduce((s, sp) => s + sp.amount, 0);
    const priorBills = schedule.filter(r => parseISODate(r.date) < start).reduce((s, r) => s + r.amount, 0);
    const carryOver = (parseFloat(state.settings.initialBalance) || 0) + priorIncome - priorBills - priorSpending;

    return { start, end, carryOver, pIncome, pSpending, pBills, totalLeft: (carryOver + pIncome - pBills - pSpending) };
}

// --- UI RENDERS ---
function renderDashboard() {
  const stats = calculatePeriodStats(currentPeriodOffset);
  const daysLeft = Math.max(1, Math.ceil((stats.end - new Date()) / (1000 * 60 * 60 * 24)));
  document.getElementById('tab-dashboard').innerHTML = `
    <div class="panel" style="text-align:center; padding: 40px 10px;">
        <div class="label" style="font-size:0.9rem; color:#636e72; text-transform:uppercase;">Available Now</div>
        <div class="value" style="font-size: 3.2rem; font-weight: 800; color: #3498db; margin: 10px 0;">${formatMoney(stats.totalLeft)}</div>
        <div style="font-size: 1.2rem; font-weight: 600; color: #2ecc71;">${formatMoney(stats.totalLeft / daysLeft)} <span style="font-weight:400; font-size:0.9rem; color:#95a5a6">/ day left</span></div>
    </div>
    <div class="stats">
        <div class="stat"><div class="label">Carryover</div><div class="value">${formatMoney(stats.carryOver)}</div></div>
        <div class="stat"><div class="label">Expected Income</div><div class="value" style="color:#2ecc71">${formatMoney(stats.pIncome)}</div></div>
        <div class="stat"><div class="label">Bills & Spent</div><div class="value" style="color:#e74c3c">${formatMoney(stats.pBills + stats.pSpending)}</div></div>
    </div>`;
}

function renderSettings() {
  document.getElementById('tab-settings').innerHTML = `
    <div class="panel"><h3>App Configuration</h3>
        <div class="stack">
            <label>User Name</label><input type="text" class="field" value="${state.userName}" onchange="state.userName=this.value;saveState()">
            <label>Initial Balance</label><input type="number" class="field" value="${state.settings.initialBalance}" onchange="state.settings.initialBalance=parseFloat(this.value)||0;saveState()">
            <label>Anchor Date (Cycle Start)</label><input type="date" class="field" value="${state.settings.anchorDate}" onchange="state.settings.anchorDate=this.value;saveState()">
            <label>Days per Pay Period</label><input type="number" class="field" value="${state.settings.periodDays}" onchange="state.settings.periodDays=parseInt(this.value);saveState()">
        </div>
    </div>
    <div class="panel"><h3>Data & Exports</h3>
        <div class="stack">
            <button class="btn" onclick="exportCSV()">Export to Excel (CSV)</button>
            <button class="btn" style="background:#3498db" onclick="exportJSON()">Save Backup (JSON)</button>
            <button class="btn danger-btn" onclick="if(confirm('Delete all data?')) { state=clone(defaultData); saveState(); }">System Reset</button>
        </div>
    </div>`;
}

// --- RESTORING THE CUSTOM BILL LOGIC ---
function renderBills() {
    document.getElementById('tab-bills').innerHTML = `
    <div class="panel"><h3>Add Recurring Bill</h3>
        <div class="stack">
            <input type="text" id="bN" class="field" placeholder="Name">
            <input type="number" id="bA" class="field" placeholder="$ Amount">
            <input type="date" id="bD" class="field" placeholder="First Date">
            <select id="bF" class="field" onchange="document.getElementById('customDaysWrap').style.display = (this.value==='Custom'?'block':'none')">
                <option value="Monthly">Monthly</option>
                <option value="Weekly">Weekly</option>
                <option value="Bi-Weekly">Bi-Weekly</option>
                <option value="Custom">Custom Days...</option>
            </select>
            <div id="customDaysWrap" style="display:none;"><input type="number" id="bCustom" class="field" placeholder="Every X Days"></div>
            <button class="btn" onclick="addB()">Save Bill</button>
        </div>
    </div>
    <div class="stack">${state.bills.map(b => `
        <div class="panel" style="display:flex; justify-content:space-between; align-items:center;">
            <div><strong>${b.name}</strong><br><small>${b.frequency === 'Custom' ? 'Every ' + b.customDays + ' Days' : b.frequency} - ${formatMoney(b.amount)}</small></div>
            <button class="mini-btn danger-btn" onclick="state.bills=state.bills.filter(x=>x.id!=='${b.id}');saveState()">Del</button>
        </div>`).join('')}</div>`;
}

function addB() {
    const n = document.getElementById('bN').value, a = parseFloat(document.getElementById('bA').value), d = document.getElementById('bD').value, f = document.getElementById('bF').value, c = document.getElementById('bCustom').value;
    if(n && a && d) { 
        state.bills.push({ id: makeId('bill'), name: n, amount: a, date: d, frequency: f, customDays: c }); 
        saveState(); 
    }
}

// --- EXPORT TOOLS ---
function exportCSV() {
    let csv = "Type,Date,Description,Amount\n";
    state.spending.forEach(s => csv += `Expense,${s.date},"${s.description}",${s.amount}\n`);
    state.deposits.forEach(d => csv += `Income,${d.date},"${d.description}",${d.amount}\n`);
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'BudgetFlow_Export.csv'; a.click();
}
function exportJSON() {
    const data = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state));
    const a = document.createElement('a'); a.href = data; a.download = 'BudgetFlow_Backup.json'; a.click();
}

// Other essential tabs
function renderSchedule() {
    const rows = getScheduleRows().filter(r => r.date >= toISODate(new Date()));
    document.getElementById('tab-schedule').innerHTML = `<div class="stack">${rows.slice(0, 20).map(r => `<div class="panel" style="display:flex; justify-content:space-between;"><div><small>${r.date}</small><br><strong>${r.description}</strong></div><div style="text-align:right;">${formatMoney(r.amount)}<br><small style="color:#3498db">${r.status}</small></div></div>`).join('')}</div>`;
}
function renderBudget() {
    const stats = calculatePeriodStats(currentPeriodOffset);
    document.getElementById('tab-budget').innerHTML = `<div class="panel" style="text-align:center;"><h3>${toISODate(stats.start)} - ${toISODate(stats.end)}</h3><hr><div class="stack" style="text-align:left;"><div>Carryover: ${formatMoney(stats.carryOver)}</div><div>Income: ${formatMoney(stats.pIncome)}</div><div>Bills Due: ${formatMoney(stats.pBills)}</div><div>Spent: ${formatMoney(stats.pSpending)}</div><div style="font-weight:800; border-top:1px solid #eee; padding-top:10px; margin-top:10px; font-size:1.2rem;">End Balance: ${formatMoney(stats.totalLeft)}</div></div></div>`;
}
function renderSpending() {
    document.getElementById('tab-spending').innerHTML = `<div class="panel"><h3>New Expense</h3><div class="stack"><input type="text" id="sD" class="field" placeholder="Item"><input type="number" id="sA" class="field" placeholder="$"><input type="date" id="sDt" class="field" value="${toISODate(new Date())}"><button class="btn" onclick="addS()">Add</button></div></div><div class="stack">${state.spending.sort((a,b)=>b.date.localeCompare(a.date)).map(s => `<div class="panel" style="display:flex; justify-content:space-between;"><div><small>${s.date}</small><br><strong>${s.description}</strong></div><strong>${formatMoney(s.amount)}</strong></div>`).join('')}</div>`;
}
function addS() { const d = document.getElementById('sD').value, a = parseFloat(document.getElementById('sA').value), dt = document.getElementById('sDt').value; if(d && a) { state.spending.push({ id: makeId('sp'), description: d, amount: a, date: dt }); saveState(); } }
function renderDeposits() {
    document.getElementById('tab-deposits').innerHTML = `<div class="panel"><h3>New Income</h3><div class="stack"><input type="text" id="dD" class="field" placeholder="Source"><input type="number" id="dA" class="field" placeholder="$"><input type="date" id="dDt" class="field" value="${toISODate(new Date())}"><button class="btn" onclick="addD()">Add</button></div></div><div class="stack">${state.deposits.sort((a,b)=>b.date.localeCompare(a.date)).map(d => `<div class="panel" style="display:flex; justify-content:space-between;"><div><small>${d.date}</small><br><strong>${d.description}</strong></div><strong style="color:#2ecc71">${formatMoney(d.amount)}</strong></div>`).join('')}</div>`;
}
function addD() { const d = document.getElementById('dD').value, a = parseFloat(document.getElementById('dA').value), dt = document.getElementById('dDt').value; if(d && a) { state.deposits.push({ id: makeId('dp'), description: d, amount: a, date: dt }); saveState(); } }

function renderApp() {
  const nav = document.getElementById('tabs');
  nav.innerHTML = TABS.map(t => `<button class="tab-btn ${activeTab === t.id ? 'active' : ''}" onclick="setTab('${t.id}')">${t.label}</button>`).join('');
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  const activeP = document.getElementById(`tab-${activeTab}`);
  if (activeP) {
      activeP.classList.remove('hidden');
      if (activeTab === 'dashboard') renderDashboard();
      else if (activeTab === 'bills') renderBills();
      else if (activeTab === 'schedule') renderSchedule();
      else if (activeTab === 'budget') renderBudget();
      else if (activeTab === 'spending') renderSpending();
      else if (activeTab === 'deposits') renderDeposits();
      else if (activeTab === 'settings') renderSettings();
  }
}
window.onload = renderApp;
