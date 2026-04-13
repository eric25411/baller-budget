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

// --- UTILS ---
function clone(obj) { return JSON.parse(JSON.stringify(obj)); }
function makeId(prefix) { return prefix + '-' + Math.random().toString(36).slice(2, 8) + '-' + Date.now().toString(36); }
function formatMoney(v) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v || 0); }

// --- STATE ---
const defaultData = {
  userName: 'Baller',
  bills: [],
  spending: [],
  deposits: [],
  budgetPeriods: [],
  schedule: []
};

let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || clone(defaultData);
let activeTab = 'dashboard';

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderApp();
}

// --- NAVIGATION ---
function setTab(id) {
  activeTab = id;
  renderApp();
}

// --- TAB RENDERING ---

function renderDashboard() {
  const container = document.getElementById('tab-dashboard');
  const totalBills = state.bills.reduce((sum, b) => sum + b.amount, 0);
  const totalSpending = state.spending.reduce((sum, s) => sum + s.amount, 0);
  
  container.innerHTML = `
    <div class="stats">
      <div class="stat">
        <div class="label">Monthly Bills</div>
        <div class="value">${formatMoney(totalBills)}</div>
      </div>
      <div class="stat">
        <div class="label">Extra Spending</div>
        <div class="value">${formatMoney(totalSpending)}</div>
      </div>
    </div>
    <div class="panel"><div class="panel-body"><h3>Welcome, ${state.userName}</h3><p>Your budget is synced.</p></div></div>`;
}

function renderBills() {
  const container = document.getElementById('tab-bills');
  let html = `
    <div class="panel"><div class="panel-head"><h2>Manage Bills</h2></div>
      <div class="panel-body stack">
        <input type="text" id="billName" class="field" placeholder="Bill Name">
        <input type="number" id="billAmount" class="field" placeholder="Amount">
        <button class="btn" onclick="addBill()">Add Bill</button>
      </div>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>Name</th><th>Amount</th><th>Actions</th></tr></thead>
      <tbody>`;
  state.bills.forEach(b => {
    html += `<tr><td data-label="Name"><strong>${b.name}</strong></td><td data-label="Amount">${formatMoney(b.amount)}</td>
    <td data-label="Actions"><button class="mini-btn danger-btn" onclick="deleteItem('bills','${b.id}')">Delete</button></td></tr>`;
  });
  container.innerHTML = html + '</tbody></table></div>';
}

function renderSpending() {
  const container = document.getElementById('tab-spending');
  let html = `
    <div class="panel"><div class="panel-head"><h2>Other Spending</h2></div>
      <div class="panel-body stack">
        <input type="text" id="spendDesc" class="field" placeholder="Description">
        <input type="number" id="spendAmt" class="field" placeholder="Amount">
        <button class="btn" onclick="addSpending()">Add Expense</button>
      </div>
    </div>
    <div class="table-wrap"><table><thead><tr><th>Description</th><th>Amount</th><th>Actions</th></tr></thead><tbody>`;
  state.spending.forEach(s => {
    html += `<tr><td data-label="Description"><strong>${s.description}</strong></td><td data-label="Amount">${formatMoney(s.amount)}</td>
    <td data-label="Actions"><button class="mini-btn danger-btn" onclick="deleteItem('spending','${s.id}')">Delete</button></td></tr>`;
  });
  container.innerHTML = html + '</tbody></table></div>';
}

function renderDeposits() {
  const container = document.getElementById('tab-deposits');
  let html = `
    <div class="panel"><div class="panel-head"><h2>Income & Deposits</h2></div>
      <div class="panel-body stack">
        <input type="text" id="depDesc" class="field" placeholder="Source">
        <input type="number" id="depAmt" class="field" placeholder="Amount">
        <button class="btn" onclick="addDeposit()">Add Deposit</button>
      </div>
    </div>
    <div class="table-wrap"><table><thead><tr><th>Source</th><th>Amount</th><th>Actions</th></tr></thead><tbody>`;
  state.deposits.forEach(d => {
    html += `<tr><td data-label="Source"><strong>${d.description}</strong></td><td data-label="Amount">${formatMoney(d.amount)}</td>
    <td data-label="Actions"><button class="mini-btn danger-btn" onclick="deleteItem('deposits','${d.id}')">Delete</button></td></tr>`;
  });
  container.innerHTML = html + '</tbody></table></div>';
}

function renderBudget() {
    const container = document.getElementById('tab-budget');
    container.innerHTML = `
      <div class="panel">
        <div class="panel-head"><h2>Budget Tracker</h2></div>
        <div class="panel-body"><p>Budgeting logic active. Track your monthly limits here.</p></div>
      </div>`;
}

function renderSettings() {
  const container = document.getElementById('tab-settings');
  container.innerHTML = `
    <div class="panel"><div class="panel-head"><h2>Settings</h2></div>
      <div class="panel-body stack">
        <label>User Name</label>
        <input type="text" id="setUserName" class="field" value="${state.userName}" onchange="updateName(this.value)">
        <button class="danger-btn" onclick="clearAllData()">Reset App</button>
      </div>
    </div>`;
}

// --- ACTIONS ---
function addBill() {
  const name = document.getElementById('billName').value;
  const amt = parseFloat(document.getElementById('billAmount').value);
  if (!name || isNaN(amt)) return;
  state.bills.push({ id: makeId('bill'), name, amount: amt });
  saveState();
}

function addSpending() {
  const desc = document.getElementById('spendDesc').value;
  const amt = parseFloat(document.getElementById('spendAmt').value);
  if (!desc || isNaN(amt)) return;
  state.spending.push({ id: makeId('spend'), description: desc, amount: amt });
  saveState();
}

function addDeposit() {
  const desc = document.getElementById('depDesc').value;
  const amt = parseFloat(document.getElementById('depAmt').value);
  if (!desc || isNaN(amt)) return;
  state.deposits.push({ id: makeId('dep'), description: desc, amount: amt });
  saveState();
}

function deleteItem(coll, id) {
  state[coll] = state[coll].filter(i => i.id !== id);
  saveState();
}

function updateName(val) { state.userName = val; saveState(); }

function clearAllData() {
  if (confirm("Clear everything?")) {
    state = clone(defaultData);
    saveState();
  }
}

// --- INIT ---
function renderApp() {
  const nav = document.getElementById('tabs');
  nav.innerHTML = TABS.map(t => `<button class="tab-btn ${activeTab === t.id ? 'active' : ''}" onclick="setTab('${t.id}')">${t.label}</button>`).join('');
  
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  document.getElementById(`tab-${activeTab}`).classList.remove('hidden');

  if (activeTab === 'dashboard') renderDashboard();
  if (activeTab === 'bills') renderBills();
  if (activeTab === 'spending') renderSpending();
  if (activeTab === 'deposits') renderDeposits();
  if (activeTab === 'budget') renderBudget();
  if (activeTab === 'settings') renderSettings();
  if (activeTab === 'schedule') { /* Reuse the schedule logic from before */ }
}

window.onload = renderApp;
