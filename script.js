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

// --- STYLES ---
const style = document.createElement('style');
style.textContent = `
    :root {
        --primary: #3498db;
        --secondary: #2ecc71;
        --danger: #e74c3c;
        --bg: #f8f9fa;
        --card-bg: #ffffff;
        --text-main: #2d3436;
        --text-sub: #636e72;
    }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text-main); margin: 0; padding: 0; }
    .panel { background: var(--card-bg); border-radius: 16px; padding: 20px; margin-bottom: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid rgba(0,0,0,0.02); }
    .hero-value { font-size: 3.2rem; font-weight: 800; color: var(--primary); letter-spacing: -1px; margin: 8px 0; }
    .daily-badge { display: inline-block; background: rgba(46, 204, 113, 0.1); color: var(--secondary); padding: 6px 16px; border-radius: 50px; font-weight: 700; font-size: 1rem; }
    .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .mini-card { background: #fdfdfd; padding: 15px; border-radius: 12px; text-align: center; border: 1px solid #f0f0f0; }
    .mini-card .label { font-size: 0.75rem; text-transform: uppercase; color: var(--text-sub); font-weight: 600; margin-bottom: 4px; }
    .mini-card .value { font-size: 1.1rem; font-weight: 700; color: var(--text-main); }
    .tab-btn { padding: 10px 18px; border-radius: 20px; border: none; background: #eee; cursor: pointer; font-weight: 600; font-size: 0.9rem; }
    .tab-btn.active { background: var(--primary); color: white; }
    .stack { display: flex; flex-direction: column; gap: 10px; }
    .field { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #ddd; box-sizing: border-box; }
    .btn { background: var(--primary); color: white; border: none; padding: 12px; border-radius: 8px; font-weight: 700; cursor: pointer; }
    .mini-btn { padding: 4px 10px; border-radius: 6px; border: none; font-size: 0.8rem; cursor: pointer; }
    .danger-btn { background: var(--danger); color: white; }
    .hidden { display: none; }
`;
document.head.appendChild(style);

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
  settings: { initialBalance: 0, anchorDate: '2026-03-05', periodDays: 14 },
  userName: 'Baller',
  bills: [],
  spending: [],
  deposits: [],
  scheduleMeta: {} 
};

let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || clone(defaultData);
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

// --- LOGIC ---
function getScheduleRows() {
  const rows = [];
  const endLimit = addDays(new Date(), 365);
  state.bills.forEach(bill => {
    let current = parseISODate(bill.date);
    while (current <= endLimit) {
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
      else if (bill.frequency === 'Custom') current = addDays(current, parseInt(bill.customDays || 1));
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
    <div class="panel" style="text-align:center;">
        <div style="font-size:0.9rem; color:var(--text-sub); font-weight:600; text-transform:uppercase;">Available Now</div>
        <div class="hero-value">${formatMoney(stats.totalLeft)}</div>
        <div class="daily-badge">${formatMoney(stats.totalLeft / daysLeft)} <span style="font-weight:400; opacity:0.8;">/ day remaining</span></div>
    </div>
    <div class="stat-grid">
        <div class="mini-card"><div class="label">Carryover</div><div class="value">${formatMoney(stats.carryOver)}</div></div>
        <div class="mini-card"><div class="label">Income</div><div class="value" style="color:var(--secondary);">+${formatMoney(stats.pIncome)}</div></div>
        <div class="mini-card" style="grid-column: span 2;"><div class="label">Total Obligations</div><div class="value" style="color:var(--danger);">-${formatMoney(stats.pBills + stats.pSpending)}</div></div>
    </div>`;
}

function renderBudget() {
    const stats = calculatePeriodStats(currentPeriodOffset);
    const startDate = stats.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endDate = stats.end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    document.getElementById('tab-budget').innerHTML = `
        <div class="panel">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                <h3 style="margin:0; font-size:1.2rem; color:var(--primary);">Budget Analysis</h3>
                <div style="font-size:0.85rem; background:var(--bg); padding:4px 12px; border-radius:8px; font-weight:600;">${startDate} - ${endDate}</div>
            </div>
            <div style="display:flex; flex-direction:column; gap:12px;">
                <div style="display:flex; justify-content:space-between;"><span style="color:var(--text-sub);">Carryover</span><span style="font-weight:600;">${formatMoney(stats.carryOver)}</span></div>
                <div style="display:flex; justify-content:space-between;"><span style="color:var(--text-sub);">Planned Income</span><span style="font-weight:600; color:var(--secondary);">+${formatMoney(stats.pIncome)}</span></div>
                <div style="display:flex; justify-content:space-between;"><span style="color:var(--text-sub);">Expected Bills</span><span style="font-weight:600; color:var(--danger);">${formatMoney(stats.pBills)}</span></div>
                <div style="display:flex; justify-content:space-between;"><span style="color:var(--text-sub);">Other Spending</span><span style="font-weight:600; color:var(--danger);">${formatMoney(stats.pSpending)}</span></div>
                <div style="margin-top:10px; padding-top:15px; border-top:2px dashed #eee; display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-weight:800; font-size:1.1rem;">Remaining</span>
                    <span style="font-weight:800; font-size:1.4rem; color:var(--primary);">${formatMoney(stats.totalLeft)}</span>
                </div>
            </div>
        </div>`;
}

function renderBills() {
    document.getElementById('tab-bills').innerHTML = `
    <div class="panel"><h3>Manage Bills</h3>
        <div class="stack">
            <input type="text" id="bN" class="field" placeholder="Name">
            <input type="number" id="bA" class="field" placeholder="$">
            <input type="date" id="bD" class="field">
            <select id="bF" class="field" onchange="document.getElementById('cDWrap').style.display=(this.value==='Custom'?'block':'none')">
                <option value="Monthly">Monthly</option><option value="Weekly">Weekly</option><option value="Bi-Weekly">Bi-Weekly</option><option value="Custom">Custom Days</option>
            </select>
            <div id="cDWrap" style="display:none;"><input type="number" id="bC" class="field" placeholder="Every X Days"></div>
            <button class="btn" onclick="addB()">Save Bill</button>
        </div>
    </div>
    <div class="stack">${state.bills.map(b => `<div class="panel" style="display:flex; justify-content:space-between;"><div><strong>${b.name}</strong><br><small>${b.frequency}</small></div><button class="mini-btn danger-btn" onclick="state.bills=state.bills.filter(x=>x.id!=='${b.id}');saveState()">Del</button></div>`).join('')}</div>`;
}

function addB() {
    const n=document.getElementById('bN').value, a=parseFloat(document.getElementById('bA').value), d=document.getElementById('bD').value, f=document.getElementById('bF').value, c=document.getElementById('bC').value;
    if(n && a && d) { state.bills.push({ id: makeId('bill'), name: n, amount: a, date: d, frequency: f, customDays: c }); saveState(); }
}

function renderSpending() {
    document.getElementById('tab-spending').innerHTML = `
    <div class="panel"><h3>Other Spending</h3><div class="stack"><input type="text" id="sD" class="field" placeholder="Item"><input type="number" id="sA" class="field" placeholder="$"><input type="date" id="sDt" class="field" value="${toISODate(new Date())}"><button class="btn" onclick="addS()">Add Expense</button></div></div>
    <div class="stack">${state.spending.sort((a,b)=>b.date.localeCompare(a.date)).map(s => `<div class="panel" style="display:flex; justify-content:space-between;"><div><small>${s.date}</small><br><strong>${s.description}</strong></div><strong>${formatMoney(s.amount)}</strong></div>`).join('')}</div>`;
}
function addS() { const d=document.getElementById('sD').value, a=parseFloat(document.getElementById('sA').value), dt=document.getElementById('sDt').value; if(d && a) { state.spending.push({ id: makeId('sp'), description: d, amount: a, date: dt }); saveState(); } }

function renderDeposits() {
    document.getElementById('tab-deposits').innerHTML = `
    <div class="panel"><h3>Deposits</h3><div class="stack"><input type="text" id="dD" class="field" placeholder="Source"><input type="number" id="dA" class="field" placeholder="$"><input type="date" id="dDt" class="field" value="${toISODate(new Date())}"><button class="btn" onclick="addD()">Add Income</button></div></div>
    <div class="stack">${state.deposits.sort((a,b)=>b.date.localeCompare(a.date)).map(d => `<div class="panel" style="display:flex; justify-content:space-between;"><div><small>${d.date}</small><br><strong>${d.description}</strong></div><strong style="color:var(--secondary)">+${formatMoney(d.amount)}</strong></div>`).join('')}</div>`;
}
function addD() { const d=document.getElementById('dD').value, a=parseFloat(document.getElementById('dA').value), dt=document.getElementById('dDt').value; if(d && a) { state.deposits.push({ id: makeId('dp'), description: d, amount: a, date: dt }); saveState(); } }

function renderSchedule() {
    const rows = getScheduleRows().filter(r => r.date >= toISODate(new Date()));
    document.getElementById('tab-schedule').innerHTML = `<div class="stack">${rows.slice(0, 15).map(r => `<div class="panel" style="display:flex; justify-content:space-between;"><div><small>${r.date}</small><br><strong>${r.description}</strong></div><div style="text-align:right;">${formatMoney(r.amount)}<br><small style="color:var(--primary)">${r.status}</small></div></div>`).join('')}</div>`;
}

function renderSettings() {
  document.getElementById('tab-settings').innerHTML = `
    <div class="panel"><h3>Core Config</h3>
        <div class="stack">
            <label>Name</label><input type="text" class="field" value="${state.userName}" onchange="state.userName=this.value;saveState()">
            <label>Start Bal</label><input type="number" class="field" value="${state.settings.initialBalance}" onchange="state.settings.initialBalance=parseFloat(this.value);saveState()">
            <label>Start Date</label><input type="date" class="field" value="${state.settings.anchorDate}" onchange="state.settings.anchorDate=this.value;saveState()">
        </div>
    </div>
    <div class="panel"><h3>Data Tools</h3>
        <div class="stack">
            <button class="btn" onclick="exportCSV()">Export to Excel (CSV)</button>
            <button class="btn danger-btn" onclick="if(confirm('Wipe everything?')) { state=clone(defaultData); saveState(); }">System Reset</button>
        </div>
    </div>`;
}

function exportCSV() {
    let csv = "Type,Date,Description,Amount\n";
    state.spending.forEach(s => csv += `Expense,${s.date},"${s.description}",${s.amount}\n`);
    state.deposits.forEach(d => csv += `Income,${d.date},"${d.description}",${d.amount}\n`);
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'BudgetFlow_Export.csv'; a.click();
}

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
