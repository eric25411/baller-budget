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

// CRITICAL FIX: Direct injection of missing fields
let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || clone(defaultData);
state.bills = state.bills || [];
state.spending = state.spending || [];
state.deposits = state.deposits || [];
state.goals = state.goals || [];
state.scheduleMeta = state.scheduleMeta || {};
state.settings = state.settings || clone(defaultData.settings);

let activeTab = 'dashboard', scheduleSearch = '', spendingSearch = '', depositSearch = '';
let scheduleFilterMode = 'all', spendingFilterMode = 'period', depositFilterMode = 'period';
let currentPeriodOffset = 0, editingBillId = null;

function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); renderApp(); }

function setTab(id) { 
    if(['budget', 'spending', 'deposits', 'schedule'].includes(id)) currentPeriodOffset = getTodayOffset(); 
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

function getTodayOffset() {
    const today = new Date(); today.setHours(0,0,0,0);
    const anchor = parseISODate(state.settings.anchorDate);
    const diffDays = Math.floor((today - anchor) / (1000 * 60 * 60 * 24));
    return Math.floor(diffDays / state.settings.periodDays);
}

function getScheduleRows() {
  const rows = [];
  const startLimit = new Date(); startLimit.setFullYear(startLimit.getFullYear() - 1);
  const endLimit = addDays(new Date(), (state.settings.scheduleMonthsForward || 12) * 30);
  
  state.bills.forEach(bill => {
    let current = parseISODate(bill.date);
    const billEnd = bill.endDate ? parseISODate(bill.endDate) : endLimit;
    const actualLimit = billEnd < endLimit ? billEnd : endLimit;

    while (current <= actualLimit) {
      if (current >= startLimit) {
        const dateStr = toISODate(current);
        const key = `${bill.id}_${dateStr}`;
        const meta = state.scheduleMeta[key] || {};
        const finalAmount = (meta.actualAmount !== undefined) ? meta.actualAmount : parseFloat(bill.amount);
        rows.push({
          id: key, billId: bill.id, description: bill.name, amount: finalAmount, date: dateStr,
          status: meta.paid ? 'Paid' : (current < new Date().setHours(0,0,0,0) ? 'Overdue' : 'Upcoming')
        });
      }
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
    const { start, end } = getPeriodDates(offset);
    const schedule = getScheduleRows();
    const pIncome = state.deposits.filter(d => { let dt = parseISODate(d.date); return dt >= start && dt <= end; }).reduce((s, d) => s + d.amount, 0);
    const pSpending = state.spending.filter(sp => { let dt = parseISODate(sp.date); return dt >= start && dt <= end; }).reduce((s, sp) => s + sp.amount, 0);
    const pBills = schedule.filter(r => { let dt = parseISODate(r.date); return dt >= start && dt <= end; }).reduce((s, r) => s + r.amount, 0);
    
    // Carryover calculation
    const priorIncome = state.deposits.filter(d => parseISODate(d.date) < start).reduce((s, d) => s + d.amount, 0);
    const priorSpending = state.spending.filter(sp => parseISODate(sp.date) < start).reduce((s, sp) => s + sp.amount, 0);
    const priorBills = schedule.filter(r => parseISODate(r.date) < start).reduce((s, r) => s + r.amount, 0);
    const carryOver = (parseFloat(state.settings.initialBalance) || 0) + priorIncome - priorBills - priorSpending;

    return { start, end, carryOver, pIncome, pSpending, pBills, totalLeft: (carryOver + pIncome - pBills - pSpending) };
}

// --- RENDERS ---
function renderDashboard() {
  const stats = calculatePeriodStats(getTodayOffset());
  document.getElementById('tab-dashboard').innerHTML = `
    <div class="panel" style="text-align:center;">
        <div class="label">Total Available</div>
        <div class="value" style="font-size: 2rem; color: #3498db;">${formatMoney(stats.totalLeft)}</div>
    </div>
    <div class="stats"><div class="stat"><div class="label">Income</div><div class="value">${formatMoney(stats.pIncome)}</div></div><div class="stat"><div class="label">Spent</div><div class="value">${formatMoney(stats.pBills + stats.pSpending)}</div></div></div>`;
}

function renderGoals() {
    document.getElementById('tab-goals').innerHTML = `
        <div class="panel"><h3>Create New Goal</h3>
            <div class="stack">
                <input type="text" id="goalName" class="field" placeholder="Goal Name">
                <input type="number" id="goalTarget" class="field" placeholder="Target $">
                <input type="number" id="goalMilestones" class="field" placeholder="# Milestones">
                <button class="btn" onclick="addGoal()">Create</button>
            </div>
        </div>
        <div class="stack">${state.goals.map(g => `
            <div class="panel">
                <strong>${g.name}</strong><br>
                <small>${formatMoney(g.current || 0)} / ${formatMoney(g.target)}</small>
                <div style="background:#eee; height:10px; margin:10px 0;"><div style="background:#3498db; width:${Math.min(100, ((g.current||0)/g.target)*100)}%; height:100%;"></div></div>
                <div style="display:flex; gap:5px;"><input type="number" id="pay-${g.id}" class="field" placeholder="$" style="flex:1"><button class="mini-btn" onclick="adjustGoal('${g.id}', 'add')">Add</button></div>
            </div>`).join('')}</div>`;
}

function renderSettings() {
  document.getElementById('tab-settings').innerHTML = `
    <div class="panel"><h3>Settings</h3><div class="stack"><label>Name</label><input type="text" class="field" value="${state.userName}" onchange="state.userName=this.value;saveState()"></div></div>
    <div class="panel"><h3>Data Controls</h3><div class="stack">
        <button class="btn" onclick="exportCSV()">Export to Excel (CSV)</button>
        <button class="btn" style="background:#3498db" onclick="exportData()">Backup JSON</button>
        <button class="btn danger-btn" onclick="if(confirm('Wipe all data?')) { state=clone(defaultData); saveState(); }">Reset App</button>
    </div></div>`;
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
  state.spending.push({ id: makeId('sp'), description: `Goal: ${g.name}`, amount: amt, date: toISODate(new Date()) });
  saveState();
}
function exportCSV() { 
  let csv = "Type,Date,Description,Amount\n";
  state.spending.forEach(s => csv += `Expense,${s.date},${s.description},${s.amount}\n`);
  state.deposits.forEach(d => csv += `Income,${d.date},${d.description},${d.amount}\n`);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a'); a.setAttribute('href', url); a.setAttribute('download', 'budget_export.csv'); a.click();
}
function exportData() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state));
  const a = document.createElement('a'); a.setAttribute('href', dataStr); a.setAttribute('download', 'budget_backup.json'); a.click();
}

// Helper renders for missing tabs
function renderBills() { document.getElementById('tab-bills').innerHTML = '<div class="panel"><h3>Manage Bills</h3><div class="stack"><input type="text" id="billName" class="field" placeholder="Name"><input type="number" id="billAmount" class="field" placeholder="$"><input type="date" id="billDate" class="field"><button class="btn" onclick="addBill()">Save</button></div></div>'; }
function renderSchedule() { document.getElementById('tab-schedule').innerHTML = '<div class="panel"><h3>Payment Schedule</h3><p>Your bills will appear here once added.</p></div>'; }
function renderBudget() { document.getElementById('tab-budget').innerHTML = '<div class="panel"><h3>Analysis</h3><p>Calculated based on your cycles.</p></div>'; }
function renderSpending() { document.getElementById('tab-spending').innerHTML = '<div class="panel"><h3>Spending</h3><div class="stack"><input type="text" id="spDesc" class="field" placeholder="Item"><input type="number" id="spAmt" class="field" placeholder="$"><button class="btn" onclick="addSpending()">Add</button></div></div>'; }
function renderDeposits() { document.getElementById('tab-deposits').innerHTML = '<div class="panel"><h3>Income</h3><div class="stack"><input type="text" id="dpDesc" class="field" placeholder="Source"><input type="number" id="dpAmt" class="field" placeholder="$"><button class="btn" onclick="addDeposit()">Add</button></div></div>'; }

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
