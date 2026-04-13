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

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderApp();
}

function setTab(id) {
  activeTab = id;
  renderApp();
}

// --- RENDERING TABS ---

function renderBills() {
  const container = document.getElementById('tab-bills');
  container.innerHTML = `
    <div class="panel">
      <div class="panel-head"><h2>Recurring Bills</h2></div>
      <div class="panel-body stack">
        <input type="text" id="billName" class="field" placeholder="Bill Name (e.g. Netflix)">
        <input type="number" id="billAmount" class="field" placeholder="Amount">
        <input type="date" id="billDate" class="field">
        <select id="billFreq" class="field">
          <option value="Monthly">Monthly</option>
          <option value="Bi-Weekly">Bi-Weekly</option>
          <option value="Weekly">Weekly</option>
        </select>
        <button class="btn" onclick="addBill()">Add Bill & Schedule</button>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Name</th><th>Amount</th><th>Next Date</th><th>Freq</th><th>Actions</th></tr></thead>
        <tbody>
          ${state.bills.map(b => `
            <tr>
              <td data-label="Name"><strong>${b.name}</strong></td>
              <td data-label="Amount">${formatMoney(b.amount)}</td>
              <td data-label="Next Date">${b.date || '---'}</td>
              <td data-label="Freq">${b.frequency}</td>
              <td data-label="Actions"><button class="mini-btn danger-btn" onclick="deleteItem('bills','${b.id}')">Delete</button></td>
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
          ${state.spending.map(s => `
            <tr>
              <td data-label="Date">${s.date || '---'}</td>
              <td data-label="Description"><strong>${s.description}</strong></td>
              <td data-label="Amount">${formatMoney(s.amount)}</td>
              <td data-label="Actions"><button class="mini-btn danger-btn" onclick="deleteItem('spending','${s.id}')">Delete</button></td>
            </tr>`).join('')}
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
        <button class="btn" onclick="addDeposit()">Add Deposit</button>
      </div>
    </div>
    <div class="table-wrap">
      <table><thead><tr><th>Date</th><th>Source</th><th>Amount</th><th>Actions</th></tr></thead>
        <tbody>
          ${state.deposits.map(d => `
            <tr>
              <td data-label="Date">${d.date || '---'}</td>
              <td data-label="Source"><strong>${d.description}</strong></td>
              <td data-label="Amount">${formatMoney(d.amount)}</td>
              <td data-label="Actions"><button class="mini-btn danger-btn" onclick="deleteItem('deposits','${d.id}')">Delete</button></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderSchedule() {
  const container = document.getElementById('tab-schedule');
  container.innerHTML = `
    <div class="panel-head"><h2>Payment Schedule</h2></div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          ${state.schedule.map(item => `
            <tr>
              <td data-label="Date">${item.date}</td>
              <td data-label="Description"><strong>${item.description}</strong></td>
              <td data-label="Amount">${formatMoney(item.amount)}</td>
              <td data-label="Status"><span class="status ${item.status.toLowerCase()}">${item.status}</span></td>
              <td data-label="Actions"><button class="mini-btn danger-btn" onclick="deleteItem('schedule','${item.id}')">Delete</button></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

// --- LOGIC ---

function addBill() {
  const name = document.getElementById('billName').value;
  const amt = parseFloat(document.getElementById('billAmount').value);
  const date = document.getElementById('billDate').value;
  const freq = document.getElementById('billFreq').value;

  if (!name || isNaN(amt) || !date) return alert("Please fill in Name, Amount, and Date");

  const id = makeId('bill');
  state.bills.push({ id, name, amount: amt, date, frequency: freq });
  
  // Automatically add to schedule
  state.schedule.push({ 
    id: makeId('sch'), 
    description: name, 
    amount: amt, 
    date: date, 
    status: 'Soon' 
  });

  saveState();
}

function addSpending() {
  const desc = document.getElementById('spendDesc').value;
  const amt = parseFloat(document.getElementById('spendAmt').value);
  const date = document.getElementById('spendDate').value;
  if (!desc || isNaN(amt)) return;
  
  state.spending.push({ id: makeId('spend'), description: desc, amount: amt, date });
  saveState();
}

function addDeposit() {
  const desc = document.getElementById('depDesc').value;
  const amt = parseFloat(document.getElementById('depAmt').value);
  const date = document.getElementById('depDate').value;
  if (!desc || isNaN(amt)) return;

  state.deposits.push({ id: makeId('dep'), description: desc, amount: amt, date });
  saveState();
}

function deleteItem(coll, id) {
  state[coll] = state[coll].filter(i => i.id !== id);
  saveState();
}

function renderApp() {
  const nav = document.getElementById('tabs');
  nav.innerHTML = TABS.map(t => `<button class="tab-btn ${activeTab === t.id ? 'active' : ''}" onclick="setTab('${t.id}')">${t.label}</button>`).join('');
  
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  const activePanel = document.getElementById(`tab-${activeTab}`);
  if (activePanel) activePanel.classList.remove('hidden');

  if (activeTab === 'bills') renderBills();
  if (activeTab === 'schedule') renderSchedule();
  if (activeTab === 'spending') renderSpending();
  if (activeTab === 'deposits') renderDeposits();
  // Simplified Dashboard for now
  if (activeTab === 'dashboard') {
    document.getElementById('tab-dashboard').innerHTML = `<div class="panel-body"><h3>Welcome back!</h3><p>Manage your flow using the tabs above.</p></div>`;
  }
}

window.onload = renderApp;
