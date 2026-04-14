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
    .hero-value { font-size: 3rem; font-weight: 800; color: var(--primary); letter-spacing: -1px; margin: 8px 0; }
    .daily-badge { display: inline-block; background: rgba(46, 204, 113, 0.1); color: var(--secondary); padding: 6px 16px; border-radius: 50px; font-weight: 700; font-size: 0.9rem; }
    .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .mini-card { background: #fdfdfd; padding: 15px; border-radius: 12px; text-align: center; border: 1px solid #f0f0f0; }
    .mini-card .label { font-size: 0.7rem; text-transform: uppercase; color: var(--text-sub); font-weight: 600; margin-bottom: 4px; }
    .mini-card .value { font-size: 1rem; font-weight: 700; }
    .tab-btn { padding: 10px 18px; border-radius: 20px; border: none; background: #eee; cursor: pointer; font-weight: 600; font-size: 0.85rem; white-space: nowrap; }
    .tab-btn.active { background: var(--primary); color: white; }
    .stack { display: flex; flex-direction: column; gap: 10px; }
    .field { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #ddd; box-sizing: border-box; font-size: 1rem; }
    .btn { background: var(--primary); color: white; border: none; padding: 12px; border-radius: 8px; font-weight: 700; cursor: pointer; }
    .mini-btn { padding: 6px 12px; border-radius: 6px; border: none; font-size: 0.75rem; cursor: pointer; font-weight: 600; }
    .danger-btn { background: var(--danger); color: white; }
    .hidden { display: none; }
    .flex-between { display: flex; justify-content: space-between; align-items: center; }
    .arrow-btn { background: #eee; border: none; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; font-weight: bold; }
`;
document.head.appendChild(style);

// --- CORE UTILS ---
function clone(obj) { return JSON.parse(JSON.stringify(obj)); }
function makeId(prefix) { return prefix + '-' + Math.random().toString(36).slice(2, 8) + '-' + Date.now().toString(36); }
function pad(n) { return String(n).padStart(2, '0'); }
function parseISODate(value) { if (!value) return new Date(); const p = value.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
function toISODate(date) { return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()); }
function addDays(date, days) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
function formatMoney(v) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v || 0); }

// --- STATE MANAGEMENT ---
const defaultData = {
  settings: { initialBalance: 0, anchorDate: '2026-04-02', periodDays: 14 },
  userName: 'Baller',
  bills: [],
  spending: [],
  deposits: [],
  scheduleMeta: {} 
};

let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || clone(defaultData);
let activeTab = 'dashboard', currentPeriodOffset = 0, scheduleView = 'period'; 

function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); renderApp(); }

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
          date: dateStr, status: meta.paid ? 'Paid' : (current < new Date().setHours(0,0,0,0) ? 'Overdue' : 'Upcoming'),
          isPaid: !!meta.paid
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
        <div style="font-size:0.8rem; color:var(--text-sub); font-weight:600; text-transform:uppercase;">Available Now</div>
        <div class="hero-value">${formatMoney(stats.totalLeft)}</div>
        <div class="daily-badge">${formatMoney(stats.totalLeft / daysLeft)} <span style="font-weight:400; opacity:0.8;">/ day remaining</span></div>
    </div>
    <div class="stat-grid">
        <div class="mini-card"><div class="label">Carryover</div><div class="value">${formatMoney(stats.carryOver)}</div></div>
        <div class="mini-card"><div class="label">Income</div><div class="value" style="color:var(--secondary);">+${formatMoney(stats.pIncome)}</div></div>
        <div class="mini-card" style="grid-column: span 2;"><div class="label">Period Obligations</div><div class="value" style="color:var(--danger);">-${formatMoney(stats.pBills + stats.pSpending)}</div></div>
    </div>`;
}

function renderBudget() {
    const stats = calculatePeriodStats(currentPeriodOffset);
    document.getElementById('tab-budget').innerHTML = `
        <div class="panel">
            <div class="flex-between" style="margin-bottom:20px;">
                <button class="arrow-btn" onclick="currentPeriodOffset--; renderApp();">❮</button>
                <div style="text-align:center;"><h3 style="margin:0; font-size:1.1rem;">Budget Analysis</h3><small>${toISODate(stats.start)} - ${toISODate(stats.end)}</small></div>
                <button class="arrow-btn" onclick="currentPeriodOffset++; renderApp();">❯</button>
            </div>
            <div class="stack">
                <div class="flex-between"><span>Carryover</span><strong>${formatMoney(stats.carryOver)}</strong></div>
                <div class="flex-between"><span>Income</span><strong style="color:var(--secondary);">+${formatMoney(stats.pIncome)}</strong></div>
                <div class="flex-between"><span>Bills</span><strong style="color:var(--danger);">${formatMoney(stats.pBills)}</strong></div>
                <div class="flex-between"><span>Spent</span><strong style="color:var(--danger);">${formatMoney(stats.pSpending)}</strong></div>
                <div style="margin-top:10px; padding-top:15px; border-top:2px dashed #eee;" class="flex-between">
                    <span style="font-weight:800;">Remaining</span><span style="font-weight:800; font-size:1.3rem; color:var(--primary);">${formatMoney(stats.totalLeft)}</span>
                </div>
            </div>
        </div>`;
}

function renderSchedule() {
    const stats = calculatePeriodStats(currentPeriodOffset);
    let rows = getScheduleRows();
    if(scheduleView === 'period') {
        rows = rows.filter(r => { let d = parseISODate(r.date); return d >= stats.start && d <= stats.end; });
    } else {
        rows = rows.filter(r => r.date >= toISODate(new Date())).slice(0, 20);
    }
    
    document.getElementById('tab-schedule').innerHTML = `
        <div class="flex-between" style="margin-bottom:15px; background:#eee; padding:5px; border-radius:10px;">
            <button style="flex:1; border-radius:8px;" class="mini-btn ${scheduleView==='period'?'active btn':''}" onclick="scheduleView='period';renderApp()">Pay Period</button>
            <button style="flex:1; border-radius:8px;" class="mini-btn ${scheduleView==='30day'?'active btn':''}" onclick="scheduleView='30day';renderApp()">Next 30 Days</button>
        </div>
        <div class="stack">${rows.map(r => `
            <div class="panel flex-between" style="padding:15px; opacity: ${r.isPaid ? '0.6' : '1'}">
                <div><small>${r.date}</small><br><strong>${r.description}</strong></div>
                <div style="text-align:right;">
                    <input type="number" step="0.01" style="width:80px; text-align:right; border:none; font-weight:700;" value="${r.amount}" 
                        onchange="updateActual('${r.id}', this.value)">
                    <br><button class="mini-btn" style="background:${r.isPaid?'var(--secondary)':'#eee'}; color:${r.isPaid?'white':''}" 
                        onclick="togglePaid('${r.id}')">${r.isPaid?'Paid':'Mark Paid'}</button>
                </div>
            </div>`).join('')}</div>`;
}

function updateActual(id, val) { state.scheduleMeta[id] = { ...state.scheduleMeta[id], actualAmount: parseFloat(val) }; saveState(); }
function togglePaid(id) { state.scheduleMeta[id] = { ...state.scheduleMeta[id], paid: !state.scheduleMeta[id]?.paid }; saveState(); }

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
    <div class="stack">${state.bills.map(b => `
        <div class="panel flex-between" style="padding:12px 18px;">
            <div><strong>${b.name}</strong><br><small>${b.frequency} - ${formatMoney(b.amount)}</small></div>
            <div style="display:flex; gap:8px;">
                <button class="mini-btn" onclick="editB('${b.id}')">Edit</button>
                <button class="mini-btn danger-btn" onclick="state.bills=state.bills.filter(x=>x.id!=='${b.id}');saveState()">Del</button>
            </div>
        </div>`).join('')}</div>`;
}

function addB() {
    const n=document.getElementById('bN').value, a=parseFloat(document.getElementById('bA').value), d=document.getElementById('bD').value, f=document.getElementById('bF').value, c=document.getElementById('bC').value;
    if(n && a && d) { state.bills.push({ id: makeId('bill'), name: n, amount: a, date: d, frequency: f, customDays: c }); saveState(); }
}
function editB(id) {
    const b = state.bills.find(x => x.id === id);
    const n = prompt("New Name:", b.name), a = prompt("New Amount:", b.amount);
    if(n && a) { b.name = n; b.amount = parseFloat(a); saveState(); }
}

function renderSpending() {
    document.getElementById('tab-spending').innerHTML = `<div class="panel"><h3>Spending</h3><div class="stack"><input type="text" id="sD" class="field" placeholder="Item"><input type="number" id="sA" class="field" placeholder="$"><input type="date" id="sDt" class="field" value="${toISODate(new Date())}"><button class="btn" onclick="addS()">Add</button></div></div>
    <div class="stack">${state.spending.sort((a,b)=>b.date.localeCompare(a.date)).map(s => `<div class="panel flex-between"><div><small>${s.date}</small><br><strong>${s.description}</strong></div><strong>${formatMoney(s.amount)}</strong></div>`).join('')}</div>`;
}
function addS() { const d=document.getElementById('sD').value, a=parseFloat(document.getElementById('sA').value), dt=document.getElementById('sDt').value; if(d && a) { state.spending.push({ id: makeId('sp'), description: d, amount: a, date: dt }); saveState(); } }

function renderDeposits() {
    document.getElementById('tab-deposits').innerHTML = `<div class="panel"><h3>Deposits</h3><div class="stack"><input type="text" id="dD" class="field" placeholder="Source"><input type="number" id="dA" class="field" placeholder="$"><input type="date" id="dDt" class="field" value="${toISODate(new Date())}"><button class="btn" onclick="addD()">Add</button></div></div>
    <div class="stack">${state.deposits.sort((a,b)=>b.date.localeCompare(a.date)).map(d => `<div class="panel flex-between"><div><small>${d.date}</small><br><strong>${d.description}</strong></div><strong style="color:var(--secondary)">+${formatMoney(d.amount)}</strong></div>`).join('')}</div>`;
}
function addD() { const d=document.getElementById('dD').value, a=parseFloat(document.getElementById('dA').value), dt=document.getElementById('dDt').value; if(d && a) { state.deposits.push({ id: makeId('dp'), description: d, amount: a, date: dt }); saveState(); } }

function renderSettings() {
  document.getElementById('tab-settings').innerHTML = `
    <div class="panel"><h3>Config</h3><div class="stack"><label>Start Bal</label><input type="number" class="field" value="${state.settings.initialBalance}" onchange="state.settings.initialBalance=parseFloat(this.value);saveState()"><label>Start Date</label><input type="date" class="field" value="${state.settings.anchorDate}" onchange="state.settings.anchorDate=this.value;saveState()"></div></div>
    <div class="panel"><h3>Data</h3><div class="stack"><button class="btn" onclick="exportCSV()">Export Excel</button><button class="btn danger-btn" onclick="if(confirm('Wipe data?')){state=clone(defaultData);saveState()}">Reset</button></div></div>`;
}
function exportCSV() { let csv="Type,Date,Description,Amount\n"; state.spending.forEach(s=>csv+=`Expense,${s.date},"${s.description}",${s.amount}\n`); state.deposits.forEach(d=>csv+=`Income,${d.date},"${d.description}",${d.amount}\n`); const blob=new Blob([csv],{type:'text/csv'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='Export.csv'; a.click(); }

function renderApp() {
  const nav = document.getElementById('tabs');
  nav.innerHTML = `<div style="display:flex; gap:10px; overflow-x:auto; padding: 15px 5px;">${TABS.map(t => `<button class="tab-btn ${activeTab === t.id ? 'active' : ''}" onclick="activeTab='${t.id}';renderApp()">${t.label}</button>`).join('')}</div>`;
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
