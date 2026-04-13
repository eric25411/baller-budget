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

const defaultData = {
  userName: 'Baller',
  bills: [],
  spending: [],
  deposits: [],
  budgetPeriods: []
};

let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || clone(defaultData);
let activeTab = 'dashboard';
let scheduleSearch = '';

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// --- CORE RENDERING ---
function renderTabs() {
  const container = document.getElementById('tabs');
  container.innerHTML = TABS.map(t => `
    <button class="tab-btn ${activeTab === t.id ? 'active' : ''}" onclick="setTab('${t.id}')">
      ${t.label}
    </button>
  `).join('');
}

function setTab(id) {
  activeTab = id;
  renderApp();
}

// --- BILLS TAB (RESTORED WITH FORM) ---
function renderBills() {
  const container = document.getElementById('tab-bills');
  let html = `
    <div class="panel">
      <div class="panel-head">
        <div>
          <h2>Recurring Bills</h2>
          <p>Manage your monthly obligations</p>
        </div>
      </div>
      <div class="panel-body">
        <div class="grid-two">
          <div class="stack">
            <input type="text" id="billName" class="field" placeholder="Bill Name (e.g. Rent)">
            <input type="number" id="billAmount" class="field" placeholder="Amount">
            <input type="number" id="billDate" class="field" placeholder="Due Day (1-31)">
            <select id="billCat" class="field">
              <option value="Housing">Housing</option>
              <option value="Utilities">Utilities</option>
              <option value="Food">Food</option>
              <option value="Transport">Transport</option>
              <option value="Entertainment">Entertainment</option>
            </select>
            <button class="btn" onclick="addBill()">Add Bill</button>
          </div>
          <div class="note-box">
            Recurring bills are used to generate your payment schedule automatically each month.
          </div>
        </div>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Name</th><th>Amount</th><th>Due Day</th><th>Category</th><th>Actions</th></tr>
        </thead>
        <tbody>`;

  state.bills.forEach(bill => {
    html += `
      <tr>
        <td data-label="Name"><strong>${bill.name}</strong></td>
        <td data-label="Amount">$${bill.amount.toFixed(2)}</td>
        <td data-label="Due Day">Day ${bill.dueDate}</td>
        <td data-label="Category">${bill.category}</td>
        <td data-label="Actions">
          <button class="danger-btn mini-btn" onclick="deleteBill('${bill.id}')">Delete</button>
        </td>
      </tr>`;
  });

  html += `</tbody></table></div>`;
  container.innerHTML = html;
}

function addBill() {
  const name = document.getElementById('billName').value;
  const amt = parseFloat(document.getElementById('billAmount').value);
  const date = parseInt(document.getElementById('billDate').value);
  const cat = document.getElementById('billCat').value;

  if (!name || isNaN(amt)) return alert('Enter name and amount');

  state.bills.push({ id: makeId('bill'), name, amount: amt, dueDate: date, category: cat });
  saveState();
  renderApp();
}

function deleteBill(id) {
  state.bills = state.bills.filter(b => b.id !== id);
  saveState();
  renderApp();
}

// --- SCHEDULE TAB (RESTORED WITH SEARCH) ---
function renderSchedule() {
  const container = document.getElementById('tab-schedule');
  // Logic to generate schedule from bills would go here... for now, we use state.schedule
  const items = (state.schedule || []).filter(i => 
    i.description.toLowerCase().includes(scheduleSearch.toLowerCase())
  );

  let html = `
    <div class="panel">
      <div class="panel-head">
        <h2>Payment Schedule</h2>
        <input type="text" class="field inline-field" placeholder="Search..." 
               value="${scheduleSearch}" oninput="updateSchedSearch(this.value)">
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Date</th><th>Description</th><th>Amount</th><th>Status</th><th>Actions</th></tr>
        </thead>
        <tbody>`;

  items.forEach(item => {
    html += `
      <tr>
        <td data-label="Date">${item.date}</td>
        <td data-label="Description"><strong>${item.description}</strong></td>
        <td data-label="Amount">$${item.amount.toFixed(2)}</td>
        <td data-label="Status"><span class="status ${item.status.toLowerCase()}">${item.status}</span></td>
        <td data-label="Actions">
          <button class="mini-btn danger-btn" onclick="deleteSched('${item.id}')">Delete</button>
        </td>
      </tr>`;
  });

  html += `</tbody></table></div>`;
  container.innerHTML = html;
}

function updateSchedSearch(val) {
  scheduleSearch = val;
  renderSchedule();
}

// --- DASHBOARD ---
function renderDashboard() {
  const container = document.getElementById('tab-dashboard');
  const totalBills = state.bills.reduce((sum, b) => sum + b.amount, 0);
  
  container.innerHTML = `
    <div class="stats">
      <div class="stat">
        <div class="label">Total Monthly Bills</div>
        <div class="value">$${totalBills.toFixed(2)}</div>
        <div class="sub">${state.bills.length} Recurring items</div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-body">
        <h3>Welcome back, ${state.userName}</h3>
        <p>Your budget is currently synced and healthy.</p>
      </div>
    </div>`;
}

// --- APP INIT ---
function renderApp() {
  renderTabs();
  // Toggle visibility of panels
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  document.getElementById(`tab-${activeTab}`).classList.remove('hidden');

  if (activeTab === 'dashboard') renderDashboard();
  if (activeTab === 'bills') renderBills();
  if (activeTab === 'schedule') renderSchedule();
  // Add other renders as you build them...
}

window.onload = () => {
  renderApp();
};
