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
let scheduleFilterMode = 'all'; 
let currentPeriodOffset = 0; 
let editingBillId = null; // NEW: Track what we are editing

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

function getTodayOffset() {
    const today = new Date();
    today.setHours(0,0,0,0);
    const anchor = parseISODate(state.settings.anchorDate);
    const diffTime = today - anchor;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return Math.floor(diffDays / state.settings.periodDays);
}

// --- SCHEDULE ENGINE ---
function getScheduleRows() {
  const rows = [];
  const startLimit = new Date();
  startLimit.setFullYear(startLimit.getFullYear() - 1);
  const endLimit = addDays(new Date(), (state.settings.scheduleMonthsForward || 12) * 30);
  
  state.bills.forEach(bill => {
    let current = parseISODate(bill.date);
    if (!current) return;
    
    // NEW: Stop the bill if an end date is provided
    const billEnd = bill.endDate ? parseISODate(bill.endDate) : endLimit;
    const actualLimit = billEnd < endLimit ? billEnd : endLimit;

    while (current <= actualLimit) {
      if (current >= startLimit) {
        const dateStr = toISODate(current);
        const key = `${bill.id}_${dateStr}`;
        const meta = state.scheduleMeta[key] || {};
        rows.push({
          id: key,
          description: bill.name,
          amount: parseFloat(bill.amount),
          date: dateStr,
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
  today.setHours(0,0,0,0);
  
  const daysLeft = Math.max(1, Math.ceil((stats.end - today) / (1000 * 60 * 60 * 24)));
  const dailyAllowance = stats.totalLeft / daysLeft;

  const container = document.getElementById('tab-dashboard');
  container.innerHTML = `
    <div class="panel" style="text-align:center; padding: 25px 20px;">
        <div class="label" style="text-transform:uppercase; font-size:0.75rem; letter-spacing:1px; color:#636e72">Welcome, ${state.userName}</div>
        <div class="value" style="font-size: 2.2rem; font-weight: 800; color: var(--accent); margin: 5px 0;">${formatMoney(stats.totalLeft)}</div>
        
        <div style="background: #f8f9fa; border-radius: 12px; padding: 15px; margin-top: 20px;">
            <div class="label" style="font-size: 0.7rem; color: #636e72; text-transform: uppercase;">Daily Allowance</div>
            <div style="font-size: 1.5rem; font-weight: 700; color: #2d3436;">${formatMoney(dailyAllowance)} <span style="font-size:0.8rem; font-weight:400;">/ day</span></div>
        </div>
    </div>

    <div class="stats">
      <div class="stat"><div class="label">INCOME</div><div class="value" style="color:#2ecc71">${formatMoney(stats.pIncome)}</div></div>
      <div class="stat"><div class="label">OUTBOUND</div><div class="value" style="color:#e74c3c">${formatMoney(stats.pBills + stats.pSpending)}</div></div>
    </div>
  `;
}

function renderBills() {
  const container = document.getElementById('tab-bills');
  container.innerHTML = `
    <div class="panel"><div class="panel-head"><h2>${editingBillId ? 'Edit Bill' : 'Manage Bills'}</h2></div>
      <div class="stack">
        <label style="font-size:0.7rem; color:#636e72">Bill Name</label>
        <input type="text" id="billName" class="field" placeholder="Rent, Electric, etc.">
        
        <label style="font-size:0.7rem; color:#636e72">Amount ($)</label>
        <input type="number" id="billAmount" class="field" placeholder="0.00">
        
        <label style="font-size:0.7rem; color:#636e72">Start Date</label>
        <input type="date" id="billDate" class="field">
        
        <label style="font-size:0.7rem; color:#636e72">Frequency</label>
        <select id="billFreq" class="field" onchange="document.getElementById('customDays').classList.toggle('hidden', this.value !== 'Custom')">
          <option value="Monthly">Monthly</option>
          <option value="Weekly">Weekly</option>
          <option value="Bi-Weekly">Bi-Weekly</option>
          <option value="Custom">Custom</option>
        </select>
        <input type="number" id="customDays" class="field hidden" placeholder="Interval (Days)">

        <label style="font-size:0.7rem; color:#636e72">End Date (Optional - stops recurring)</label>
        <input type="date" id="billEndDate" class="field">

        <div style="display:flex; gap:10px;">
            <button class="btn" style="flex:2" onclick="addBill()">${editingBillId ? 'Update Bill' : 'Save Bill'}</button>
            ${editingBillId ? `<button class="btn" style="flex:1; background:#7f8c8d" onclick="cancelEdit()">Cancel</button>` : ''}
        </div>
      </div>
    </div>
    <div class="table-wrap"><table>
      <tbody>${state.bills.map(b => `
        <tr>
          <td><strong>${b.name}</strong><br><small style="color:#95a5a6">${b.frequency}${b.endDate ? ' (Ends ' + b.endDate + ')' : ''}</small></td>
          <td style="text-align:right;">${formatMoney(b.amount)}<br>
            <button class="mini-btn" onclick="editBill('${b.id}')">Edit</button>
            <button class="mini-btn danger-btn" onclick="deleteItem('bills','${b.id}')">Del</button>
          </td>
        </tr>`).join('')}</tbody>
    </table></div>`;
}

// --- ACTIONS & APP START ---
function editBill(id) {
    const bill = state.bills.find(b => b.id === id);
    if (!bill) return;
    editingBillId = id;
    renderBills(); // Re-render to show updated title and cancel button
    
    // Fill the inputs
    document.getElementById('billName').value = bill.name;
    document.getElementById('billAmount').value = bill.amount;
    document.getElementById('billDate').value = bill.date;
    document.getElementById('billFreq').value = bill.frequency;
    document.getElementById('billEndDate').value = bill.endDate || '';
    if (bill.frequency === 'Custom') {
        const cd = document.getElementById('customDays');
        cd.classList.remove('hidden');
        cd.value = bill.customDays;
    }
}

function cancelEdit() {
    editingBillId = null;
    renderBills();
}

function addBill() {
  const n = document.getElementById('billName').value, 
        a = parseFloat(document.getElementById('billAmount').value), 
        d = document.getElementById('billDate').value, 
        f = document.getElementById('billFreq').value, 
        c = document.getElementById('customDays').value,
        ed = document.getElementById('billEndDate').value;

  if (!n || isNaN(a) || !d) return;

  const billData = { name: n, amount: a, date: d, frequency: f, customDays: c, endDate: ed };

  if (editingBillId) {
      const idx = state.bills.findIndex(b => b.id === editingBillId);
      if (idx !== -1) state.bills[idx] = { ...state.bills[idx], ...billData };
      editingBillId = null;
  } else {
      state.bills.push({ id: makeId('bill'), ...billData });
  }
  
  saveState();
}

// ... Rest of functions (renderSchedule, renderSpending, etc.) remain identical ...
function renderSchedule() {
  const container = document.getElementById('tab-schedule');
  let rows = getScheduleRows();
  if (scheduleFilterMode === '30days') {
      const thirtyDaysOut = addDays(new Date(), 30);
      rows = rows.filter(r => { const d = parseISODate(r.date); return d >= new Date().setHours(0,0,0,0) && d <= thirtyDaysOut; });
  } else if (scheduleFilterMode === 'period') {
      const { start, end } = getPeriodDates(currentPeriodOffset);
      rows = rows.filter(r => { const d = parseISODate(r.date); return d >= start && d <= end; });
  }
  rows = rows.filter(r => r.description.toLowerCase().includes(scheduleSearch.toLowerCase()));
  const { start, end } = getPeriodDates(currentPeriodOffset);

  container.innerHTML = `
    <div class="panel">
        <input type="text" class="field" placeholder="Search bills..." value="${scheduleSearch}" oninput="scheduleSearch=this.value;renderSchedule()">
        <div style="display:flex; gap:5px; margin-top:10px;">
            <button class="mini-btn ${scheduleFilterMode==='all'?'active':''}" onclick="scheduleFilterMode='all';renderSchedule()">All</button>
            <button class="mini-btn ${scheduleFilterMode==='30days'?'active':''}" onclick="scheduleFilterMode='30days';renderSchedule()">Next 30d</button>
            <button class="mini-btn ${scheduleFilterMode==='period'?'active':''}" onclick="scheduleFilterMode='period';renderSchedule()">By Period</button>
        </div>
        ${scheduleFilterMode === 'period' ? `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:15px; padding-top:10px; border-top:1px solid #eee;">
                <button class="mini-btn" onclick="currentPeriodOffset--;renderSchedule()">◀</button>
                <div style="font-size:0.8rem; font-weight:bold;">${start.toLocaleDateString()} - ${end.toLocaleDateString()}</div>
                <button class="mini-btn" onclick="currentPeriodOffset++;renderSchedule()">▶</button>
            </div>
        ` : ''}
    </div>
    <div class="table-wrap"><table>
      <tbody>${rows.map(r => `
        <tr class="${r.status.toLowerCase()}">
            <td><div style="font-size:0.7rem; color:#636e72;">${r.date}</div><strong>${r.description}</strong></td>
            <td style="text-align:right;">${formatMoney(r.amount)}<br>
                <button class="mini-btn" style="font-size:0.6rem; padding:2px 6px;" onclick="togglePaid('${r.id}')">${r.status === 'Paid' ? 'Undo' : 'Pay'}</button>
            </td>
        </tr>`).join('')}</tbody>
    </table></div>`;
}

function renderSpending() {
  const container = document.getElementById('tab-spending');
  const today = toISODate(new Date());
  container.innerHTML = `
    <div class="panel">
        <input type="text" id="spDesc" class="field" placeholder="Description">
        <input type="number" id="spAmt" class="field" placeholder="$">
        <input type="date" id="spDate" class="field" value="${today}">
        <button class="btn" onclick="addSpending()">Add Expense</button>
    </div>
    <div class="table-wrap"><table>
      <tbody>${state.spending.sort((a,b)=>b.date.localeCompare(a.date)).map(s => `<tr><td>${s.date}</td><td>${s.description}</td><td>${formatMoney(s.amount)}</td><td><button class="mini-btn danger-btn" onclick="deleteItem('spending','${s.id}')">Del</button></td></tr>`).join('')}</tbody>
    </table></div>`;
}

function renderDeposits() {
  const container = document.getElementById('tab-deposits');
  const today = toISODate(new Date());
  container.innerHTML = `
    <div class="panel">
        <input type="text" id="dpDesc" class="field" placeholder="Source">
        <input type="number" id="dpAmt" class="field" placeholder="$">
        <input type="date" id="dpDate" class="field" value="${today}">
        <button class="btn" onclick="addDeposit()">Add Income</button>
    </div>
    <div class="table-wrap"><table>
      <tbody>${state.deposits.sort((a,b)=>b.date.localeCompare(a.date)).map(d => `<tr><td>${d.date}</td><td>${d.description}</td><td>${formatMoney(d.amount)}</td><td><button class="mini-btn danger-btn" onclick="deleteItem('deposits','${d.id}')">Del</button></td></tr>`).join('')}</tbody>
    </table></div>`;
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
        <button class="tab-btn" onclick="currentPeriodOffset--;renderBudget()">◀</button>
        <div style="text-align: center;">
          <strong style="display: block; font-size: 1.1rem;">${startStr} - ${endStr}</strong>
          <button class="mini-btn" style="margin-top:5px; font-size:0.7rem;" onclick="currentPeriodOffset=getTodayOffset();renderBudget()">Today</button>
        </div>
        <button class="tab-btn" onclick="currentPeriodOffset++;renderBudget()">▶</button>
      </div>
      <div class="stack" style="gap:12px">
        <div style="display:flex; justify-content:space-between; color:#636e72"><span>Prior Carryover</span><strong>${formatMoney(stats.carryOver)}</strong></div>
        <div style="display:flex; justify-content:space-between"><span>New Income</span><strong>${formatMoney(stats.pIncome)}</strong></div>
        <div style="display:flex; justify-content:space-between"><span>Scheduled Bills</span><strong style="color:#e74c3c">${formatMoney(stats.pBills)}</strong></div>
        <div style="display:flex; justify-content:space-between"><span>Misc Spending</span><strong style="color:#e74c3c">${formatMoney(stats.pSpending)}</strong></div>
        <hr style="border:0; border-top:1px solid #eee; margin:5px 0;">
        <div style="display:flex; justify-content:space-between; font-size:1.2rem; font-weight:bold;">
          <span>Net Remaining</span><span style="color:#3498db">${formatMoney(stats.totalLeft)}</span>
        </div>
      </div>
    </div>`;
}

function renderSettings() {
  const container = document.getElementById('tab-settings');
  container.innerHTML = `
    <div class="panel"><div class="panel-head"><h2>Account Settings</h2></div>
      <div class="stack">
        <label>Your Name</label><input type="text" class="field" value="${state.userName}" onchange="state.userName=this.value;saveState()">
        <label>Starting Balance (Total Cash)</label><input type="number" class="field" value="${state.settings.initialBalance}" onchange="state.settings.initialBalance=parseFloat(this.value)||0;saveState()">
        <label>Cycle Start Date</label><input type="date" class="field" value="${state.settings.anchorDate}" onchange="state.settings.anchorDate=this.value;saveState()">
        <label>Cycle Length (Days)</label><input type="number" class="field" value="${state.settings.periodDays}" onchange="state.settings.periodDays=this.value;saveState()">
      </div>
    </div>
    <div class="panel">
        <div class="panel-head"><h2>Data Management</h2></div>
        <div class="stack" style="gap:10px">
            <button class="btn" style="background:#34495e" onclick="exportData()">Download Backup</button>
            <button class="btn" style="background:#7f8c8d" onclick="document.getElementById('importFile').click()">Import Backup</button>
            <input type="file" id="importFile" class="hidden" onchange="importData(event)">
            <button class="btn danger-btn" onclick="if(confirm('Erase all data?')) { state=clone(defaultData); saveState(); }">Reset App</button>
        </div>
    </div>`;
}

function togglePaid(key) { state.scheduleMeta[key] = { paid: !state.scheduleMeta[key]?.paid }; saveState(); }
function deleteItem(coll, id) { state[coll] = state[coll].filter(i => i.id !== id); saveState(); }
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
function exportData() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state));
  const dl = document.createElement('a'); dl.setAttribute("href", dataStr); dl.setAttribute("download", `budget_backup_${toISODate(new Date())}.json`); dl.click();
}
function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (data.bills && data.settings) {
                state = data;
                saveState();
                alert("Backup restored!");
            }
        } catch(err) { alert("Error reading backup file."); }
    };
    reader.readAsText(file);
}

function renderApp() {
  const nav = document.getElementById('tabs');
  nav.innerHTML = TABS.map(t => `<button class="tab-btn ${activeTab === t.id ? 'active' : ''}" onclick="setTab('${t.id}')">${t.label}</button>`).join('');
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  document.getElementById(`tab-${activeTab}`).classList.remove('hidden');
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
