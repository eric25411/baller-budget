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

// --- UTILS & HELPERS ---
function clone(obj) { return JSON.parse(JSON.stringify(obj)); }
function makeId(prefix) { return prefix + '-' + Math.random().toString(36).slice(2, 8) + '-' + Date.now().toString(36); }
function formatMoney(v) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v || 0); }

const defaultData = {
  userName: 'Baller',
  bills: [],
  spending: [],
  deposits: [],
  schedule: []
};

let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || clone(defaultData);
let activeTab = 'dashboard';
let scheduleSearch = '';

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderApp();
}

function setTab(id) {
  activeTab = id;
  renderApp();
}

// --- CALCULATION ENGINE ---
function getBudgetStats() {
  const income = state.deposits.reduce((sum, d) => sum + (d.amount || 0), 0);
  const bills = state.bills.reduce((sum, b) => sum + (b.amount || 0), 0);
  const extra = state.spending.reduce((sum, s) => sum + (s.amount || 0), 0);
  const totalOut = bills + extra;
  return { income, bills, extra, totalOut, remaining: income - totalOut };
}

// --- RENDERING LOGIC ---

function renderDashboard() {
  const stats = getBudgetStats();
  const container = document.getElementById('tab-dashboard');
  container.innerHTML = `
    <div class="stats">
      <div class="stat"><div class="label">Total Income</div><div class="value" style="color:var(--good)">${formatMoney(stats.income)}</div></div>
      <div class="stat"><div class="label">Total Expenses</div><div class="value" style="color:var(--bad)">${formatMoney(stats.totalOut)}</div></div>
      <div class="stat"><div class="label">Net Cash Flow</div><div class="value" style="color:var(--accent)">${formatMoney(stats.remaining)}</div></div>
    </div>
    <div class="panel"><div class="panel-body"><h3>Welcome, ${state.userName}</h3><p>Your financials are synced and healthy.</p></div></div>`;
}

function renderBills() {
  const container = document.getElementById('tab-bills');
  container.innerHTML = `
    <div class="panel">
      <div class="panel-head"><h2>Manage Bills</h2></div>
      <div class="panel-body stack">
        <div class="grid-two">
          <div class="stack">
            <input type="text" id="billName" class="field" placeholder="Bill Name">
            <input type="number" id="billAmount" class="field" placeholder="Amount">
            <input type="date" id="billDate" class="field">
          </div>
          <div class="stack">
            <select id="billFreq" class="field" onchange="toggleCustomFreq(this.value)">
              <option value="Monthly">Monthly</option>
              <option value="Weekly">Weekly</option>
              <option value="Bi-Weekly">Bi-Weekly</option>
              <option value="Quarterly">Every 3 Months</option>
              <option value="Semi-Annual">Every 6 Months</option>
              <option value="Custom">Custom (Days)</option>
            </select>
            <input type="number" id="customDays" class="field hidden" placeholder="Every X Days">
            <button class="btn" onclick="addBill()" style="margin-top:auto">Add Bill & Schedule</button>
          </div>
        </div>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Name</th><th>Amount</th><th>Frequency</th><th>Next Date</th><th>Actions</th></tr></thead>
        <tbody>
          ${state.bills.map(b => `
            <tr>
              <td data-label="Name"><strong>${b.name}</strong></td>
              <td data-label="Amount">${formatMoney(b.amount)}</td>
              <td data-label="Frequency">${b.frequency === 'Custom' ? `Every ${b.customDays} Days` : b.frequency}</td>
              <td data-label="Next Date">${b.date}</td>
              <td data-label="Actions"><button class="mini-btn danger-btn" onclick="deleteItem('bills','${b.id}')">Delete</button></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderSchedule() {
  const container = document.getElementById('tab-schedule');
  const items = state.schedule.filter(i => i.description.toLowerCase().includes(scheduleSearch.toLowerCase()));
  const sorted = [...items].sort((a, b) => new Date(a.date) - new Date(b.date));

  container.innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <h2>Payment Schedule</h2>
        <input type="text" class="field inline-field" placeholder="Search..." value="${scheduleSearch}" oninput="updateSchedSearch(this.value)">
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          ${sorted.map(i => `
            <tr>
              <td data-label="Date">${i.date}</td>
              <td data-label="Description"><strong>${i.description}</strong></td>
              <td data-label="Amount">${formatMoney(i.amount)}</td>
              <td data-label="Status"><span class="status ${i.status.toLowerCase()}">${i.status}</span></td>
              <td data-label="Actions"><button class="mini-btn danger-btn" onclick="deleteItem('schedule','${i.id}')">Delete</button></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderSpending() {
  const container = document.getElementById('tab-spending');
  container.innerHTML = `
    <div class="panel"><div class="panel-head"><h2>Other Spending</h2></div>
      <div class="panel-body stack">
        <input type="text" id="spendDesc" class="field" placeholder="Description">
        <input type="number" id="spendAmt" class="field" placeholder="Amount">
        <input type="date" id="spendDate" class="field">
        <button class="btn" onclick="addSpending()">Add Expense</button>
      </div>
    </div>
    <div class="table-wrap">
      <table><thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Actions</th></tr></thead>
        <tbody>
          ${state.spending.map(s => `<tr><td data-label="Date">${s.date}</td><td data-label="Description"><strong>${s.description}</strong></td><td data-label="Amount">${formatMoney(s.amount)}</td>
          <td data-label="Actions"><button class="mini-btn danger-btn" onclick="deleteItem('spending','${s.id}')">Delete</button></td></tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderDeposits() {
  const container = document.getElementById('tab-deposits');
  container.innerHTML = `
    <div class="panel"><div class="panel-head"><h2>Income & Deposits</h2></div>
      <div class="panel-body stack">
        <input type="text" id="depDesc" class="field" placeholder="Source">
        <input type="number" id="depAmt" class="field" placeholder="Amount">
        <input type="date" id="depDate" class="field">
        <button class="btn" onclick="addDeposit()">Add Income</button>
      </div>
    </div>
    <div class="table-wrap">
      <table><thead><tr><th>Date</th><th>Source</th><th>Amount</th><th>Actions</th></tr></thead>
        <tbody>
          ${state.deposits.map(d => `<tr><td data-label="Date">${d.date}</td><td data-label="Source"><strong>${d.description}</strong></td><td data-label="Amount">${formatMoney(d.amount)}</td>
          <td data-label="Actions"><button class="mini-btn danger-btn" onclick="deleteItem('deposits','${d.id}')">Delete</button></td></tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderBudget() {
  const stats = getBudgetStats();
  const container = document.getElementById('tab-budget');
  container.innerHTML = `
    <div class="panel-head"><h2>Budget Tracker</h2></div>
    <div class="summary-grid">
      <div class="summary-tile"><div class="label">Total Income</div><div class="value">${formatMoney(stats.income)}</div></div>
      <div class="summary-tile"><div class="label">Total Out</div><div class="value">${formatMoney(stats.totalOut)}</div></div>
      <div class="summary-tile"><div class="label">Remaining</div><div class="value" style="color:var(--accent)">${formatMoney(stats.remaining)}</div></div>
    </div>`;
}

function renderSettings() {
  const container = document.getElementById('tab-settings');
  container.innerHTML = `
    <div class="panel"><div class="panel-head"><h2>Settings</h2></div>
      <div class="panel-body stack">
        <label>User Name</label>
        <input type="text" class="field" value="${state.userName}" onchange="updateName(this.value)">
        <button class="danger-btn" onclick="clearAllData()" style="margin-top:20px">Wipe All Data</button>
      </div>
    </div>`;
}

// --- ACTIONS ---

function toggleCustomFreq(val) {
  const el = document.getElementById('customDays');
  val === 'Custom' ? el.classList.remove('hidden') : el.classList.add('hidden');
}

function addBill() {
  const n = document.getElementById('billName').value;
  const a = parseFloat(document.getElementById('billAmount').value);
  const d = document.getElementById('billDate').value;
  const f = document.getElementById('billFreq').value;
  const c = document.getElementById('customDays').value;

  if (!n || isNaN(a) || !d) return alert("Fill in Name, Amount, and Date");

  state.bills.push({ id: makeId('bill'), name: n, amount: a, date: d, frequency: f, customDays: f === 'Custom' ? c : null });
  state.schedule.push({ id: makeId('sch'), description: n, amount: a, date: d, status: 'Upcoming' });
  saveState();
}

function addSpending() {
  const n = document.getElementById('spendDesc').value;
  const a = parseFloat(document.getElementById('spendAmt').value);
  const d = document.getElementById('spendDate').value;
  if (!n || isNaN(a) || !d) return;
  state.spending.push({ id: makeId('spend'), description: n, amount: a, date: d });
  saveState();
}

function addDeposit() {
  const n = document.getElementById('depDesc').value;
  const a = parseFloat(document.getElementById('depAmt').value);
  const d = document.getElementById('depDate').value;
  if (!n || isNaN(a) || !d) return;
  state.deposits.push({ id: makeId('dep'), description: n, amount: a, date: d });
  saveState();
}

function deleteItem(coll, id) { state[coll] = state[coll].filter(i => i.id !== id); saveState(); }
function updateName(v) { state.userName = v; saveState(); }
function updateSchedSearch(v) { scheduleSearch = v; renderSchedule(); }
function clearAllData() { if(confirm("Wipe everything?")) { state = clone(defaultData); saveState(); } }

function renderApp() {
  const nav = document.getElementById('tabs');
  nav.innerHTML = TABS.map(t => `<button class="tab-btn ${activeTab === t.id ? 'active' : ''}" onclick="setTab('${t.id}')">${t.label}</button>`).join('');
  
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  const activePanel = document.getElementById(`tab-${activeTab}`);
  if (activePanel) activePanel.classList.remove('hidden');

  if (activeTab === 'dashboard') renderDashboard();
  if (activeTab === 'bills') renderBills();
  if (activeTab === 'schedule') renderSchedule();
  if (activeTab === 'budget') renderBudget();
  if (activeTab === 'spending') renderSpending();
  if (activeTab === 'deposits') renderDeposits();
  if (activeTab === 'settings') renderSettings();
}

window.onload = renderApp;
