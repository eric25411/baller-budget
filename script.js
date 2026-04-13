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

// --- HELPERS ---
function clone(obj) { return JSON.parse(JSON.stringify(obj)); }
function makeId(prefix) { return prefix + '-' + Math.random().toString(36).slice(2, 8) + '-' + Date.now().toString(36); }

// --- STATE ---
const defaultData = {
  userName: 'Baller',
  bills: [],
  spending: [],
  deposits: [],
  budgetPeriods: []
};

let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || clone(defaultData);
let activeTab = 'dashboard';

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// --- RENDERING ---

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
  renderTabs();
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  const target = document.getElementById(`tab-${id}`);
  if (target) target.classList.remove('hidden');
}

// Optimized Schedule Render (Mobile Friendly)
function renderSchedule() {
  const container = document.getElementById('tab-schedule');
  const items = state.schedule || [];

  if (items.length === 0) {
    container.innerHTML = '<div class="panel-body"><div class="empty-state"><h3>Schedule is empty</h3><p>Add bills to see them here.</p></div></div>';
    return;
  }

  let html = `
    <div class="panel-head"><h2>Payment Schedule</h2></div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Date</th><th>Description</th><th>Amount</th><th>Status</th><th>Actions</th></tr>
        </thead>
        <tbody>`;

  items.forEach(item => {
    html += `
      <tr>
        <td data-label="Date">${item.date || ''}</td>
        <td data-label="Description"><strong>${item.description || ''}</strong></td>
        <td data-label="Amount">$${(item.amount || 0).toFixed(2)}</td>
        <td data-label="Status"><span class="status ${(item.status || '').toLowerCase()}">${item.status || ''}</span></td>
        <td data-label="Actions"><button class="mini-btn danger-btn" onclick="deleteItem('schedule', '${item.id}')">Delete</button></td>
      </tr>`;
  });
  html += `</tbody></table></div>`;
  container.innerHTML = html;
}

// Updated Bills Render (Mobile Friendly)
function renderBills() {
  const container = document.getElementById('tab-bills');
  let html = `
    <div class="panel-head"><h2>Recurring Bills</h2></div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Name</th><th>Amount</th><th>Due Day</th><th>Category</th><th>Actions</th></tr>
        </thead>
        <tbody>`;

  (state.bills || []).forEach(bill => {
    html += `
      <tr>
        <td data-label="Name"><strong>${bill.name}</strong></td>
        <td data-label="Amount">$${(bill.amount || 0).toFixed(2)}</td>
        <td data-label="Due Day">Day ${bill.dueDate || ''}</td>
        <td data-label="Category">${bill.category || ''}</td>
        <td data-label="Actions"><button class="mini-btn danger-btn" onclick="deleteItem('bills', '${bill.id}')">Delete</button></td>
      </tr>`;
  });
  html += `</tbody></table></div>`;
  container.innerHTML = html;
}

// Generic Delete Helper
function deleteItem(collection, id) {
  state[collection] = state[collection].filter(i => i.id !== id);
  saveState();
  renderApp();
}

// Logic placeholders for remaining tabs (Restore your original logic here)
function renderDashboard() { document.getElementById('tab-dashboard').innerHTML = '<div class="panel-body"><h2>Welcome, ' + state.userName + '</h2><p>Select a tab to manage your flow.</p></div>'; }
function renderBudget() { document.getElementById('tab-budget').innerHTML = '<div class="panel-body"><h2>Budget Tracker</h2><p>Tracking enabled.</p></div>'; }
function renderSpending() { document.getElementById('tab-spending').innerHTML = '<div class="panel-body"><h2>Other Spending</h2></div>'; }
function renderDeposits() { document.getElementById('tab-deposits').innerHTML = '<div class="panel-body"><h2>Deposits</h2></div>'; }
function renderSettings() { document.getElementById('tab-settings').innerHTML = '<div class="panel-body"><h2>Settings</h2></div>'; }

function renderApp() {
  renderTabs();
  renderDashboard();
  renderBills();
  renderSchedule();
  renderBudget();
  renderSpending();
  renderDeposits();
  renderSettings();
  setTab(activeTab);
}

window.onload = () => {
  renderApp();
};
