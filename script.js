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

// --- CALCULATION ENGINE ---
function getBudgetStats() {
  const income = state.deposits.reduce((sum, d) => sum + (d.amount || 0), 0);
  const bills = state.bills.reduce((sum, b) => sum + (b.amount || 0), 0);
  const extra = state.spending.reduce((sum, s) => sum + (s.amount || 0), 0);
  const totalOut = bills + extra;
  return { income, bills, extra, totalOut, remaining: income - totalOut };
}

// --- RENDERING ---

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

function toggleCustomFreq(val) {
  const customInput = document.getElementById('customDays');
  if (val === 'Custom') {
    customInput.classList.remove('hidden');
  } else {
    customInput.classList.add('hidden');
  }
}

function renderBudget() {
  const stats = getBudgetStats();
  const container = document.getElementById('tab-budget');
  container.innerHTML = `
    <div class="panel-head"><h2>Budget Analysis</h2></div>
    <div class="summary-grid">
      <div class="summary-tile"><div class="label">Total Income</div><div class="value">${formatMoney(stats.income)}</div></div>
      <div class="summary-tile"><div class="label">Obligations</div><div class="value">${formatMoney(stats.bills)}</div></div>
      <div class="summary-tile"><div class="label">Leftover</div><div class="value" style="color:var(--accent)">${formatMoney(stats.remaining)}</div></div>
    </div>`;
}

function renderSchedule() {
  const container = document.getElementById('tab-schedule');
  // Sort schedule by date
  const sorted = [...state.schedule].sort((a, b) => new Date(a.date) - new Date(b.date));
  
  container.innerHTML = `
    <div class="panel-head"><h2>Upcoming Timeline</h2></div>
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

// --- ADD LOGIC ---

function addBill() {
  const name = document.getElementById('billName').value;
  const amt = parseFloat(document.getElementById('billAmount').value);
  const date = document.getElementById('billDate').value;
  const freq = document.getElementById('billFreq').value;
  const customDays = document.getElementById('customDays').value;

  if (!name || isNaN(amt) || !date) return alert("Fill in Name, Amount, and Start Date");

  const newBill = { 
    id: makeId('bill'), 
    name, 
    amount: amt, 
    date, 
    frequency: freq,
    customDays: freq === 'Custom' ? customDays : null
  };

  state.bills.push(newBill);
  
  // Also push to schedule
  state.schedule.push({ 
    id: makeId('sch'), 
    description: name, 
    amount: amt, 
    date: date, 
    status: 'Upcoming' 
  });

  saveState();
}

// --- SHARED FUNCTIONS ---
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

  if (activeTab === 'dashboard') {
    const stats = getBudgetStats();
    document.getElementById('tab-dashboard').innerHTML = `<div class="stats"><div class="stat"><div class="label">Income</div><div class="value">${formatMoney(stats.income)}</div></div><div class="stat"><div class="label">Expenses</div><div class="value">${formatMoney(stats.totalOut)}</div></div></div>`;
  }
  if (activeTab === 'bills') renderBills();
  if (activeTab === 'schedule') renderSchedule();
  if (activeTab === 'budget') renderBudget();
  // ... other renders (Spending, Deposits, Settings)
}

window.onload = renderApp;
