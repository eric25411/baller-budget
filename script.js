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
  if (!value) return null;
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

let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || clone(defaultData);
// Migration check for the new goals array
if (!state.goals) state.goals = [];

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
    
    const priorIncome = state.deposits.filter(d => parseISODate(d.date) < start).reduce((s, d) => s + d.amount, 0);
    const priorSpending = state.spending.filter(sp => parseISODate(sp.date) < start).reduce((s, sp) => s + sp.amount, 0);
    const priorBills = schedule.filter(r => parseISODate(r.date) < start).reduce((s, r) => s + r.amount, 0);
    const carryOver = (parseFloat(state.settings.initialBalance) || 0) + priorIncome - priorBills - priorSpending;

    const pIncome = state.deposits.filter(d => { let dt = parseISODate(d.date); return dt >= start && dt <= end; }).reduce((s, d) => s + d.amount, 0);
    const pSpending = state.spending.filter(sp => { let dt = parseISODate(sp.date); return dt >= start && dt <= end; }).reduce((s, sp) => s + sp.amount, 0);
    const pBills = schedule.filter(r => { let dt = parseISODate(r.date); return dt >= start && dt <= end; }).reduce((s, r) => s + r.amount, 0);

    return { start, end, carryOver, pIncome, pSpending, pBills, totalLeft: (carryOver + pIncome - pBills - pSpending) };
}

// --- RENDERS ---
function renderDashboard() {
  const todayOffset = getTodayOffset();
  const stats = calculatePeriodStats(todayOffset);
  const today = new Date(); today.setHours(0,0,0,0);
  const daysLeft = Math.max(1, Math.ceil((stats.end - today) / (1000 * 60 * 60 * 24)));
  const imminent = getScheduleRows().filter(r => { const d = parseISODate(r.date); return d >= today && d <= addDays(today, 3) && r.status !== 'Paid'; });
  
  document.getElementById('tab-dashboard').innerHTML = `
    <div class="panel" style="text-align:center; padding: 25px 20px;">
        <div class="label" style="text-transform:uppercase; font-size:0.75rem; color:#636e72">Total Available</div>
        <div class="value" style="font-size: 2.2rem; font-weight: 800; color: #3498db;">${formatMoney(stats.totalLeft)}</div>
        <div style="font-size: 1.2rem; font-weight: 700; color: #2d3436; margin-top:10px;">${formatMoney(stats.totalLeft / daysLeft)} <span style="font-size:0.7rem;">/ day</span></div>
    </div>
    ${imminent.length ? `<div class="panel" style="border-left: 4px solid #e74c3c;"><div style="color: #e74c3c; font-weight: bold; font-size: 0.8rem; margin-bottom:5px;">⚠️ DUE SOON</div>${imminent.map(i => `<div style="display:flex; justify-content:space-between; font-size:0.85rem;"><span>${i.description}</span><strong>${formatMoney(i.amount)}</strong></div>`).join('')}</div>` : ''}
    <div class="stats"><div class="stat"><div class="label">Prior</div><div class="value">${formatMoney(stats.carryOver)}</div></div><div class="stat"><div class="label">Income</div><div class="value" style="color:#2ecc71">${formatMoney(stats.pIncome)}</div></div><div class="stat"><div class="label">Spent</div><div class="value" style="color:#e74c3c">${formatMoney(stats.pBills + stats.pSpending)}</div></div></div>`;
}

function renderBills() {
  document.getElementById('tab-bills').innerHTML = `
    <div class="panel"><div class="panel-head"><h2>${editingBillId ? 'Edit Bill' : 'Manage Bills'}</h2></div>
      <div class="stack">
        <input type="text" id="billName" class="field" placeholder="Name">
        <input type="number" id="billAmount" class="field" placeholder="Amount">
        <input type="date" id="billDate" class="field">
        <select id="billFreq" class="field" onchange="document.getElementById('customDays').classList.toggle('hidden', this.value !== 'Custom')">
          <option value="Monthly">Monthly</option><option value="Weekly">Weekly</option><option value="Bi-Weekly">Bi-Weekly</option><option value="Custom">Custom</option>
        </select>
        <input type="number" id="customDays" class="field hidden" placeholder="Days">
        <input type="date" id="billEndDate" class="field" title="End Date">
        <div style="display:flex; gap:10px;"><button class="btn" style="flex:2" onclick="addBill()">${editingBillId ? 'Update' : 'Save'}</button>${editingBillId ? `<button class="btn" style="flex:1; background:#7f8c8d" onclick="cancelEdit()">Cancel</button>` : ''}</div>
      </div>
    </div>
    <div class="table-wrap"><table><tbody>${state.bills.map(b => `<tr><td><strong>${b.name}</strong><br><small>${b.frequency}</small></td><td style="text-align:right;">${formatMoney(b.amount)}<br><button class="mini-btn" onclick="editBill('${b.id}')">Edit</button><button class="mini-btn danger-btn" onclick="deleteItem('bills','${b.id}')">Del</button></td></tr>`).join('')}</tbody></table></div>`;
}

function renderGoals() {
    document.getElementById('tab-goals').innerHTML = `
        <div class="panel"><div class="panel-head"><h2>New Financial Goal</h2></div>
            <div class="stack">
                <input type="text" id="goalName" class="field" placeholder="Goal Name">
                <div style="display:flex; gap:10px;"><input type="number" id="goalTarget" class="field" placeholder="Target $" style="flex:1"><input type="number" id="goalMilestones" class="field" placeholder="# Milestones" style="flex:1"></div>
                <button class="btn" onclick="addGoal()">Create Goal</button>
            </div>
        </div>
        <div class="stack">${state.goals.map(g => {
            const percent = Math.min(100, (g.current / g.target) * 100);
            const mVal = g.target / (parseInt(g.milestones) + 1);
            let nextM = 0; for(let i=1; i<=g.milestones; i++) { if(g.current < mVal * i) { nextM = mVal * i; break; } }
            return `
            <div class="panel">
                <div style="display:flex; justify-content:space-between;"><strong>${g.name}</strong><button class="mini-btn danger-btn" onclick="deleteItem('goals', '${g.id}')">Del</button></div>
                <small>${formatMoney(g.current)} / ${formatMoney(g.target)}</small>
                <div style="background:#eee; height:8px; border-radius:4px; margin:8px 0; overflow:hidden;"><div style="background:#3498db; width:${percent}%; height:100%;"></div></div>
                <div style="display:flex; justify-content:space-between; font-size:0.65rem; color:#95a5a6; margin-bottom:10px;"><span>${Math.round(percent)}%</span><span>${nextM > 0 ? 'Next: ' + formatMoney(nextM) : 'Done!'}</span></div>
                <div style="display:flex; gap:5px;"><input type="number" id="pay-${g.id}" class="field" placeholder="$" style="margin:0; flex:1"><button class="mini-btn" style="background:#3498db; color:white" onclick="adjustGoal('${g.id}', 'add')">Deposit</button><button class="mini-btn" style="background:#7f8c8d; color:white" onclick="adjustGoal('${g.id}', 'sub')">Back</button></div>
            </div>`;
        }).join('')}</div>`;
}

function renderSchedule() {
  let rows = getScheduleRows();
  if (scheduleFilterMode === '30days') rows = rows.filter(r => { const d = parseISODate(r.date); return d >= new Date().setHours(0,0,0,0) && d <= addDays(new Date(), 30); });
  else if (scheduleFilterMode === 'period') { const { start, end } = getPeriodDates(currentPeriodOffset); rows = rows.filter(r => { const d = parseISODate(r.date); return d >= start && d <= end; }); }
  rows = rows.filter(r => r.description.toLowerCase().includes(scheduleSearch.toLowerCase()));
  const { start, end } = getPeriodDates(currentPeriodOffset);
  document.getElementById('tab-schedule').innerHTML = `
    <div class="panel"><input type="text" class="field" placeholder="Search..." value="${scheduleSearch}" oninput="scheduleSearch=this.value;renderSchedule()">
        <div style="display:flex; gap:5px; margin-top:10px;"><button class="mini-btn ${scheduleFilterMode==='all'?'active':''}" onclick="scheduleFilterMode='all';renderSchedule()">All</button><button class="mini-btn ${scheduleFilterMode==='30days'?'active':''}" onclick="scheduleFilterMode='30days';renderSchedule()">30d</button><button class="mini-btn ${scheduleFilterMode==='period'?'active':''}" onclick="scheduleFilterMode='period';renderSchedule()">Period</button></div>
        ${scheduleFilterMode === 'period' ? `<div style="display:flex; justify-content:space-between; align-items:center; margin-top:15px;"><button class="mini-btn" onclick="currentPeriodOffset--;renderSchedule()">◀</button><strong>${formatDateRange(start, end)}</strong><button class="mini-btn" onclick="currentPeriodOffset++;renderSchedule()">▶</button></div>` : ''}
    </div>
    <div class="table-wrap"><table><tbody>${rows.map(r => `<tr class="${r.status.toLowerCase()}"><td><small>${r.date}</small><br><strong>${r.description}</strong></td><td style="text-align:right;"><input type="number" class="field" style="width:70px; font-size:0.8rem; text-align:right;" value="${r.amount}" onchange="setActualAmount('${r.id}', this.value)"><br><button class="mini-btn" onclick="togglePaid('${r.id}')">${r.status === 'Paid' ? 'Undo' : 'Pay'}</button></td></tr>`).join('')}</tbody></table></div>`;
}

function renderBudget() {
  const stats = calculatePeriodStats(currentPeriodOffset);
  const isToday = currentPeriodOffset === getTodayOffset();
  document.getElementById('tab-budget').innerHTML = `
    <div class="panel">
        <div class="panel-head"><h2>Analysis</h2></div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <button class="tab-btn" onclick="currentPeriodOffset--;renderBudget()">◀</button>
            <div style="text-align: center;"><strong style="display:block;">${formatDateRange(stats.start, stats.end)}</strong></div>
            <button class="tab-btn" onclick="currentPeriodOffset++;renderBudget()">▶</button>
        </div>
        <div class="stack" style="gap:10px; margin-top:20px;">
            <div style="display:flex; justify-content:space-between;"><span>Carryover</span><strong>${formatMoney(stats.carryOver)}</strong></div>
            <div style="display:flex; justify-content:space-between;"><span>Income</span><strong>${formatMoney(stats.pIncome)}</strong></div>
            <div style="display:flex; justify-content:space-between;"><span>Bills</span><strong style="color:#e74c3c">-${formatMoney(stats.pBills)}</strong></div>
            <div style="display:flex; justify-content:space-between;"><span>Spent</span><strong style="color:#e74c3c">-${formatMoney(stats.pSpending)}</strong></div>
            <hr>
            <div style="display:flex; justify-content:space-between; font-size:1.2rem; font-weight:800;"><span>Remaining</span><span style="color: #3498db">${formatMoney(stats.totalLeft)}</span></div>
        </div>
    </div>`;
}

function renderSpending() {
  const { start, end } = getPeriodDates(currentPeriodOffset);
  let rows = state.spending;
  if (spendingFilterMode === 'period') rows = rows.filter(s => { const dt = parseISODate(s.date); return dt >= start && dt <= end; });
  document.getElementById('tab-spending').innerHTML = `
    <div class="panel"><div class="stack"><input type="text" id="spDesc" class="field" placeholder="Description"><input type="number" id="spAmt" class="field" placeholder="$"><input type="date" id="spDate" class="field" value="${toISODate(new Date())}"><button class="btn" onclick="addSpending()">Add</button></div></div>
    <div class="table-wrap"><table><tbody>${rows.sort((a,b)=>b.date.localeCompare(a.date)).map(s => `<tr><td><small>${s.date}</small><br><strong>${s.description}</strong></td><td style="text-align:right;">${formatMoney(s.amount)}<br><button class="mini-btn danger-btn" onclick="deleteItem('spending','${s.id}')">Del</button></td></tr>`).join('')}</tbody></table></div>`;
}

function renderDeposits() {
  const { start, end } = getPeriodDates(currentPeriodOffset);
  let rows = state.deposits;
  if (depositFilterMode === 'period') rows = rows.filter(d => { const dt = parseISODate(d.date); return dt >= start && dt <= end; });
  document.getElementById('tab-deposits').innerHTML = `
    <div class="panel"><div class="stack"><input type="text" id="dpDesc" class="field" placeholder="Source"><input type="number" id="dpAmt" class="field" placeholder="$"><input type="date" id="dpDate" class="field" value="${toISODate(new Date())}"><button class="btn" onclick="addDeposit()">Add</button></div></div>
    <div class="table-wrap"><table><tbody>${rows.sort((a,b)=>b.date.localeCompare(a.date)).map(d => `<tr><td><small>${d.date}</small><br><strong>${d.description}</strong></td><td style="text-align:right;">${formatMoney(d.amount)}<br><button class="mini-btn danger-btn" onclick="deleteItem('deposits','${d.id}')">Del</button></td></tr>`).join('')}</tbody></table></div>`;
}

function renderSettings() {
  document.getElementById('tab-settings').innerHTML = `<div class="panel"><div class="stack"><label>Name</label><input type="text" class="field" value="${state.userName}" onchange="state.userName=this.value;saveState()"><label>Start Bal</label><input type="number" class="field" value="${state.settings.initialBalance}" onchange="state.settings.initialBalance=parseFloat(this.value)||0;saveState()"><label>Start Date</label><input type="date" class="field" value="${state.settings.anchorDate}" onchange="state.settings.anchorDate=this.value;saveState()"></div></div><div class="panel"><div class="stack"><button class="btn" onclick="exportData()">Backup (JSON)</button><button class="btn danger-btn" onclick="if(confirm('Reset?')) { state=clone(defaultData); saveState(); }">Reset</button></div></div>`;
}

// --- SHARED ACTIONS ---
function setActualAmount(key, val) { if (!state.scheduleMeta[key]) state.scheduleMeta[key] = { paid: false }; state.scheduleMeta[key].actualAmount = parseFloat(val) || 0; saveState(); }
function togglePaid(key) { if (!state.scheduleMeta[key]) state.scheduleMeta[key] = { paid: false }; state.scheduleMeta[key].paid = !state.scheduleMeta[key].paid; saveState(); }
function addBill() {
  const n = document.getElementById('billName').value, a = parseFloat(document.getElementById('billAmount').value), d = document.getElementById('billDate').value, f = document.getElementById('billFreq').value, c = document.getElementById('customDays').value;
  if (!n || isNaN(a) || !d) return;
  if (editingBillId) { const idx = state.bills.findIndex(b => b.id === editingBillId); state.bills[idx] = { ...state.bills[idx], name: n, amount: a, date: d, frequency: f, customDays: c }; editingBillId = null; }
  else state.bills.push({ id: makeId('bill'), name: n, amount: a, date: d, frequency: f, customDays: c });
  saveState();
}
function editBill(id) { const b = state.bills.find(b => b.id === id); editingBillId = id; renderBills(); document.getElementById('billName').value = b.name; document.getElementById('billAmount').value = b.amount; document.getElementById('billDate').value = b.date; document.getElementById('billFreq').value = b.frequency; }
function cancelEdit() { editingBillId = null; renderBills(); }
function addSpending() { const d = document.getElementById('spDesc').value, a = parseFloat(document.getElementById('spAmt').value), dt = document.getElementById('spDate').value; if (!d || isNaN(a) || !dt) return; state.spending.push({ id: makeId('sp'), description: d, amount: a, date: dt }); saveState(); }
function addDeposit() { const d = document.getElementById('dpDesc').value, a = parseFloat(document.getElementById('dpAmt').value), dt = document.getElementById('dpDate').value; if (!d || isNaN(a) || !dt) return; state.deposits.push({ id: makeId('dp'), description: d, amount: a, date: dt }); saveState(); }
function addGoal() { const n = document.getElementById('goalName').value, t = parseFloat(document.getElementById('goalTarget').value), m = parseInt(document.getElementById('goalMilestones').value) || 0; if(!n || !t) return; state.goals.push({ id: makeId('goal'), name: n, target: t, current: 0, milestones: m }); saveState(); }
function adjustGoal(id, type) { const amt = parseFloat(document.getElementById(`pay-${id}`).value); if(!amt) return; const g = state.goals.find(x => x.id === id); if(type === 'add') { g.current += amt; state.spending.push({ id: makeId('sp'), description: `Goal: ${g.name}`, amount: amt, date: toISODate(new Date()) }); } else { g.current -= amt; state.deposits.push({ id: makeId('dp'), description: `Back: ${g.name}`, amount: amt, date: toISODate(new Date()) }); } saveState(); }
function deleteItem(coll, id) { state[coll] = state[coll].filter(i => i.id !== id); saveState(); }
function exportData() { const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state)); const dl = document.createElement('a'); dl.setAttribute("href", dataStr); dl.setAttribute("download", `budget_backup.json`); dl.click(); }

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
