const STORAGE_KEY = 'budgetflow-v1';

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'bills', label: 'Bills' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'budget', label: 'Budget Tracker' },
  { id: 'goals', label: 'Goal Planner' },
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
  settings: { initialBalance: 0, anchorDate: '2026-03-05', periodDays: 14 },
  userName: 'Baller',
  bills: [],
  spending: [],
  deposits: [],
  goals: [],
  scheduleMeta: {} 
};

// FORCE RECOVERY: Ensure all keys exist so the UI doesn't crash
let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || clone(defaultData);
state.bills = state.bills || [];
state.spending = state.spending || [];
state.deposits = state.deposits || [];
state.goals = state.goals || [];
state.scheduleMeta = state.scheduleMeta || {};
state.settings = state.settings || clone(defaultData.settings);

let activeTab = 'dashboard', currentPeriodOffset = 0;

function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); renderApp(); }

function setTab(id) { 
    if(['budget', 'spending', 'deposits', 'schedule'].includes(id)) {
        const today = new Date(); today.setHours(0,0,0,0);
        const anchor = parseISODate(state.settings.anchorDate);
        const diffDays = Math.floor((today - anchor) / (1000 * 60 * 60 * 24));
        currentPeriodOffset = Math.floor(diffDays / state.settings.periodDays);
    }
    activeTab = id; 
    renderApp(); 
}

// --- CALCULATION ENGINE ---
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
        <div class="label" style="font-size:0.9rem; color:#636e72; text-transform:uppercase; letter-spacing:1px;">Available Now</div>
        <div class="value" style="font-size: 3rem; font-weight: 800; color: #3498db; margin: 10px 0;">${formatMoney(stats.totalLeft)}</div>
        <div style="font-size: 1.2rem; font-weight: 600; color: #2ecc71;">${formatMoney(stats.totalLeft / daysLeft)} <span style="font-weight:400; font-size:0.9rem; color:#95a5a6">/ day remaining</span></div>
    </div>
    <div class="stats">
        <div class="stat"><div class="label">Carryover</div><div class="value">${formatMoney(stats.carryOver)}</div></div>
        <div class="stat"><div class="label">Income</div><div class="value" style="color:#2ecc71">+${formatMoney(stats.pIncome)}</div></div>
        <div class="stat"><div class="label">Spent</div><div class="value" style="color:#e74c3c">-${formatMoney(stats.pBills + stats.pSpending)}</div></div>
    </div>`;
}

function renderGoals() {
    const goalsHtml = state.goals.length === 0 ? '<p style="text-align:center; color:#95a5a6; padding:20px;">No goals yet. Start saving for something big!</p>' : 
    state.goals.map(g => {
        const cur = g.current || 0;
        const progress = Math.min(100, (cur / g.target) * 100);
        return `
        <div class="panel">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div><strong style="font-size:1.1rem;">${g.name}</strong><br><small style="color:#7f8c8d">${g.milestones || 0} Milestones</small></div>
                <button class="mini-btn danger-btn" onclick="deleteGoal('${g.id}')">Delete</button>
            </div>
            <div style="margin: 15px 0;">
                <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                    <small>${formatMoney(cur)}</small><small>${formatMoney(g.target)}</small>
                </div>
                <div style="background:#eee; height:12px; border-radius:10px; overflow:hidden;"><div style="background:#3498db; width:${progress}%; height:100%;"></div></div>
            </div>
            <div style="display:flex; gap:8px;">
                <input type="number" id="amt-${g.id}" class="field" placeholder="0.00" style="margin:0; flex:1;">
                <button class="mini-btn" style="background:#3498db; color:white; padding:0 15px;" onclick="fundGoal('${g.id}')">Deposit</button>
            </div>
        </div>`;
    }).join('');

    document.getElementById('tab-goals').innerHTML = `
        <div class="panel"><h3>Create New Goal</h3>
            <div class="stack">
                <input type="text" id="gName" class="field" placeholder="Goal Name (e.g. Vacation)">
                <div style="display:flex; gap:10px;"><input type="number" id="gTarget" class="field" placeholder="Target $" style="flex:1"><input type="number" id="gMile" class="field" placeholder="Milestones" style="flex:1"></div>
                <button class="btn" onclick="addGoal()">Create Goal</button>
            </div>
        </div>
        <div class="stack">${goalsHtml}</div>`;
}

function renderSettings() {
  document.getElementById('tab-settings').innerHTML = `
    <div class="panel"><h3>Core Configuration</h3>
        <div class="stack">
            <label>Name</label><input type="text" class="field" value="${state.userName}" onchange="state.userName=this.value;saveState()">
            <label>Initial Balance</label><input type="number" class="field" value="${state.settings.initialBalance}" onchange="state.settings.initialBalance=parseFloat(this.value)||0;saveState()">
            <label>Anchor Date</label><input type="date" class="field" value="${state.settings.anchorDate}" onchange="state.settings.anchorDate=this.value;saveState()">
        </div>
    </div>
    <div class="panel"><h3>Tools & Backup</h3>
        <div class="stack">
            <button class="btn" onclick="exportCSV()">Export to Excel (CSV)</button>
            <button class="btn" style="background:#3498db" onclick="exportJSON()">Save Backup (JSON)</button>
            <button class="btn danger-btn" style="margin-top:20px" onclick="if(confirm('Wipe all data forever?')) { state=clone(defaultData); saveState(); }">Full System Reset</button>
        </div>
    </div>`;
}

// --- ACTIONS ---
function addGoal() {
    const n = document.getElementById('gName').value, t = parseFloat(document.getElementById('gTarget').value), m = parseInt(document.getElementById('gMile').value) || 0;
    if(!n || isNaN(t)) return;
    state.goals.push({ id: makeId('goal'), name: n, target: t, current: 0, milestones: m });
    saveState();
}
function fundGoal(id) {
    const amt = parseFloat(document.getElementById(`amt-${id}`).value);
    if(!amt) return;
    const g = state.goals.find(x => x.id === id);
    g.current = (g.current || 0) + amt;
    state.spending.push({ id: makeId('sp'), description: `Saving: ${g.name}`, amount: amt, date: toISODate(new Date()) });
    saveState();
}
function deleteGoal(id) { state.goals = state.goals.filter(g => g.id !== id); saveState(); }

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

// Other tabs
function renderBills() {
    document.getElementById('tab-bills').innerHTML = `
    <div class="panel"><h3>Add Bill</h3>
        <div class="stack"><input type="text" id="bN" class="field" placeholder="Name"><input type="number" id="bA" class="field" placeholder="$"><input type="date" id="bD" class="field"><select id="bF" class="field"><option value="Monthly">Monthly</option><option value="Weekly">Weekly</option><option value="Bi-Weekly">Bi-Weekly</option></select><button class="btn" onclick="addB()">Save</button></div>
    </div>
    <div class="stack">${state.bills.map(b => `<div class="panel" style="display:flex; justify-content:space-between; align-items:center;"><div><strong>${b.name}</strong><br><small>${b.frequency} - ${formatMoney(b.amount)}</small></div><button class="mini-btn danger-btn" onclick="state.bills=state.bills.filter(x=>x.id!=='${b.id}');saveState()">Del</button></div>`).join('')}</div>`;
}
function addB() {
    const n = document.getElementById('bN').value, a = parseFloat(document.getElementById('bA').value), d = document.getElementById('bD').value, f = document.getElementById('bF').value;
    if(n && a && d) { state.bills.push({ id: makeId('bill'), name: n, amount: a, date: d, frequency: f }); saveState(); }
}
function renderSchedule() {
    const rows = getScheduleRows().filter(r => r.date >= toISODate(new Date()));
    document.getElementById('tab-schedule').innerHTML = `<div class="stack">${rows.slice(0, 15).map(r => `<div class="panel" style="display:flex; justify-content:space-between;"><div><small>${r.date}</small><br><strong>${r.description}</strong></div><div style="text-align:right;">${formatMoney(r.amount)}<br><small style="color:#3498db">${r.status}</small></div></div>`).join('')}</div>`;
}
function renderBudget() {
    const stats = calculatePeriodStats(currentPeriodOffset);
    document.getElementById('tab-budget').innerHTML = `<div class="panel" style="text-align:center;"><h3>${toISODate(stats.start)} to ${toISODate(stats.end)}</h3><hr><div class="stack" style="text-align:left;"><div>Bills: ${formatMoney(stats.pBills)}</div><div>Daily Avg: ${formatMoney((stats.pBills + stats.pSpending) / 14)}</div><div style="font-weight:800; border-top:1px solid #eee; padding-top:10px;">End Balance: ${formatMoney(stats.totalLeft)}</div></div></div>`;
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
      try {
          if (activeTab === 'dashboard') renderDashboard();
          else if (activeTab === 'bills') renderBills();
          else if (activeTab === 'schedule') renderSchedule();
          else if (activeTab === 'budget') renderBudget();
          else if (activeTab === 'goals') renderGoals();
          else if (activeTab === 'spending') renderSpending();
          else if (activeTab === 'deposits') renderDeposits();
          else if (activeTab === 'settings') renderSettings();
      } catch (e) { console.error(e); activeP.innerHTML = '<div class="panel">Error loading this tab. Check console.</div>'; }
  }
}
window.onload = renderApp;
