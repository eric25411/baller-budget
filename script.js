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
function formatDateRange(start, end) {
    const opt = { month: 'short', day: '2-digit' };
    return `${start.toLocaleDateString('en-US', opt)} - ${end.toLocaleDateString('en-US', opt)}`;
}

// --- STATE MANAGEMENT ---
const defaultData = {
  settings: { initialBalance: 0, scheduleMonthsForward: 12, anchorDate: '2026-03-05', periodDays: 14 },
  userName: 'Baller',
  bills: [],
  spending: [],
  deposits: [],
  goals: [],
  scheduleMeta: {} 
};

// SAFETY NET: Ensure every part of the data exists
let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || clone(defaultData);
state.bills = state.bills || [];
state.spending = state.spending || [];
state.deposits = state.deposits || [];
state.goals = state.goals || [];
state.scheduleMeta = state.scheduleMeta || {};
state.settings = state.settings || clone(defaultData.settings);

let activeTab = 'dashboard', currentPeriodOffset = 0, editingBillId = null;

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

// --- LOGIC ENGINES ---
function getPeriodDates(offset = 0) {
    let start = parseISODate(state.settings.anchorDate || '2026-03-05');
    let days = parseInt(state.settings.periodDays || 14);
    start.setDate(start.getDate() + (offset * days));
    let end = new Date(start); end.setDate(end.getDate() + (days - 1));
    return { start, end };
}

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
    const { start, end } = getPeriodDates(offset);
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

// --- RENDERS ---
function renderDashboard() {
  const stats = calculatePeriodStats(currentPeriodOffset);
  const daysLeft = Math.max(1, Math.ceil((stats.end - new Date()) / (1000 * 60 * 60 * 24)));
  document.getElementById('tab-dashboard').innerHTML = `
    <div class="panel" style="text-align:center; padding: 30px 10px;">
        <div class="label" style="font-size:0.8rem; color:#636e72">Available Now</div>
        <div class="value" style="font-size: 2.5rem; font-weight: 800; color: #3498db;">${formatMoney(stats.totalLeft)}</div>
        <div style="font-size: 1.1rem; color: #2d3436; margin-top:8px;">${formatMoney(stats.totalLeft / daysLeft)} <small>/ day left</small></div>
    </div>
    <div class="stats">
        <div class="stat"><div class="label">Carryover</div><div class="value">${formatMoney(stats.carryOver)}</div></div>
        <div class="stat"><div class="label">Income</div><div class="value" style="color:#2ecc71">${formatMoney(stats.pIncome)}</div></div>
        <div class="stat"><div class="label">Bills/Misc</div><div class="value" style="color:#e74c3c">${formatMoney(stats.pBills + stats.pSpending)}</div></div>
    </div>`;
}

function renderGoals() {
    document.getElementById('tab-goals').innerHTML = `
        <div class="panel"><h3>New Goal</h3>
            <div class="stack">
                <input type="text" id="goalName" class="field" placeholder="Goal Name">
                <div style="display:flex; gap:10px;"><input type="number" id="goalTarget" class="field" placeholder="Target $" style="flex:1"><input type="number" id="goalMilestones" class="field" placeholder="Milestones" style="flex:1"></div>
                <button class="btn" onclick="addGoal()">Create Goal</button>
            </div>
        </div>
        <div class="stack">${state.goals.map(g => {
            const current = g.current || 0;
            const percent = Math.min(100, (current / g.target) * 100);
            return `
            <div class="panel">
                <div style="display:flex; justify-content:space-between;"><strong>${g.name}</strong><button class="mini-btn danger-btn" onclick="deleteItem('goals', '${g.id}')">Del</button></div>
                <div style="margin: 8px 0;"><small>${formatMoney(current)} / ${formatMoney(g.target)}</small></div>
                <div style="background:#eee; height:10px; border-radius:5px; overflow:hidden;"><div style="background:#3498db; width:${percent}%; height:100%;"></div></div>
                <div style="display:flex; gap:5px; margin-top:15px;"><input type="number" id="pay-${g.id}" class="field" placeholder="$" style="flex:1; margin:0;"><button class="mini-btn" style="background:#3498db; color:white" onclick="adjustGoal('${g.id}', 'add')">Deposit</button></div>
            </div>`;
        }).join('')}</div>`;
}

function renderSettings() {
  document.getElementById('tab-settings').innerHTML = `
    <div class="panel"><h3>App Settings</h3>
        <div class="stack">
            <label>Starting Balance</label><input type="number" class="field" value="${state.settings.initialBalance}" onchange="state.settings.initialBalance=parseFloat(this.value)||0;saveState()">
            <label>Cycle Start Date</label><input type="date" class="field" value="${state.settings.anchorDate}" onchange="state.settings.anchorDate=this.value;saveState()">
        </div>
    </div>
    <div class="panel"><h3>Data Recovery</h3>
        <div class="stack">
            <button class="btn" onclick="exportCSV()">Export to Excel (CSV)</button>
            <button class="btn" style="background:#3498db" onclick="exportData()">Download Backup (JSON)</button>
            <button class="btn danger-btn" onclick="if(confirm('Wipe everything?')) { state=clone(defaultData); saveState(); }">Reset All Data</button>
        </div>
    </div>`;
}

// --- ACTIONS ---
function addGoal() {
  const n = document.getElementById('goalName').value, t = parseFloat(document.getElementById('goalTarget').value), m = parseInt(document.getElementById('goalMilestones').value) || 0;
  if(!n || isNaN(t)) return;
  state.goals.push({ id: makeId('goal'), name: n, target: t, current: 0, milestones: m });
  saveState();
}

function adjustGoal(id, type) {
  const amt = parseFloat(document.getElementById(`pay-${id}`).value);
  if(!amt) return;
  const g = state.goals.find(x => x.id === id);
  g.current = (g.current || 0) + amt;
  state.spending.push({ id: makeId('sp'), description: `Goal Deposit: ${g.name}`, amount: amt, date: toISODate(new Date()) });
  saveState();
}

function deleteItem(coll, id) { state[coll] = state[coll].filter(i => i.id !== id); saveState(); }

function exportCSV() { 
  let csv = "Type,Date,Description,Amount\n";
  state.spending.forEach(s => csv += `Expense,${s.date},"${s.description}",${s.amount}\n`);
  state.deposits.forEach(d => csv += `Income,${d.date},"${d.description}",${d.amount}\n`);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'budget_export.csv'; a.click();
}

function exportData() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state));
  const a = document.createElement('a'); a.href = dataStr; a.download = 'budget_backup.json'; a.click();
}

// Minimal versions of other tabs for functionality
function renderBills() {
  document.getElementById('tab-bills').innerHTML = `
    <div class="panel"><h3>Manage Bills</h3><div class="stack"><input type="text" id="billName" class="field" placeholder="Name"><input type="number" id="billAmount" class="field" placeholder="$"><input type="date" id="billDate" class="field"><select id="billFreq" class="field"><option value="Monthly">Monthly</option><option value="Weekly">Weekly</option><option value="Bi-Weekly">Bi-Weekly</option></select><button class="btn" onclick="addBill()">Save Bill</button></div></div>
    <div class="table-wrap"><table><tbody>${state.bills.map(b => `<tr><td><strong>${b.name}</strong></td><td style="text-align:right;">${formatMoney(b.amount)}<br><button class="mini-btn danger-btn" onclick="deleteItem('bills','${b.id}')">Del</button></td></tr>`).join('')}</tbody></table></div>`;
}
function addBill() {
  const n = document.getElementById('billName').value, a = parseFloat(document.getElementById('billAmount').value), d = document.getElementById('billDate').value, f = document.getElementById('billFreq').value;
  if (!n || isNaN(a) || !d) return;
  state.bills.push({ id: makeId('bill'), name: n, amount: a, date: d, frequency: f });
  saveState();
}
function renderSchedule() {
  const rows = getScheduleRows().filter(r => r.date >= toISODate(new Date()));
  document.getElementById('tab-schedule').innerHTML = `<div class="table-wrap"><table><tbody>${rows.slice(0, 20).map(r => `<tr><td><small>${r.date}</small><br><strong>${r.description}</strong></td><td style="text-align:right;">${formatMoney(r.amount)}</td></tr>`).join('')}</tbody></table></div>`;
}
function renderBudget() {
  const stats = calculatePeriodStats(currentPeriodOffset);
  document.getElementById('tab-budget').innerHTML = `<div class="panel"><h3>Period: ${formatDateRange(stats.start, stats.end)}</h3><div class="stack"><div>Bills: ${formatMoney(stats.pBills)}</div><div>Spent: ${formatMoney(stats.pSpending)}</div><hr><div>Remaining: ${formatMoney(stats.totalLeft)}</div></div></div>`;
}
function renderSpending() {
  document.getElementById('tab-spending').innerHTML = `<div class="panel"><h3>Add Expense</h3><div class="stack"><input type="text" id="spDesc" class="field" placeholder="Item"><input type="number" id="spAmt" class="field" placeholder="$"><input type="date" id="spDate" class="field" value="${toISODate(new Date())}"><button class="btn" onclick="addS()">Add</button></div></div><div class="table-wrap"><table><tbody>${state.spending.sort((a,b)=>b.date.localeCompare(a.date)).map(s => `<tr><td><small>${s.date}</small><br><strong>${s.description}</strong></td><td style="text-align:right;">${formatMoney(s.amount)}</td></tr>`).join('')}</tbody></table></div>`;
}
function addS() { const d = document.getElementById('spDesc').value, a = parseFloat(document.getElementById('spAmt').value), dt = document.getElementById('spDate').value; if(d && a) { state.spending.push({ id: makeId('sp'), description: d, amount: a, date: dt }); saveState(); } }
function renderDeposits() {
  document.getElementById('tab-deposits').innerHTML = `<div class="panel"><h3>Add Income</h3><div class="stack"><input type="text" id="dpDesc" class="field" placeholder="Source"><input type="number" id="dpAmt" class="field" placeholder="$"><input type="date" id="dpDate" class="field" value="${toISODate(new Date())}"><button class="btn" onclick="addD()">Add</button></div></div><div class="table-wrap"><table><tbody>${state.deposits.sort((a,b)=>b.date.localeCompare(a.date)).map(d => `<tr><td><small>${d.date}</small><br><strong>${d.description}</strong></td><td style="text-align:right;">${formatMoney(d.amount)}</td></tr>`).join('')}</tbody></table></div>`;
}
function addD() { const d = document.getElementById('dpDesc').value, a = parseFloat(document.getElementById('dpAmt').value), dt = document.getElementById('dpDate').value; if(d && a) { state.deposits.push({ id: makeId('dp'), description: d, amount: a, date: dt }); saveState(); } }

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
      else if (activeTab === 'goals') renderGoals();
      else if (activeTab === 'spending') renderSpending();
      else if (activeTab === 'deposits') renderDeposits();
      else if (activeTab === 'settings') renderSettings();
  }
}
window.onload = renderApp;
