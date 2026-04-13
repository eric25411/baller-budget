// --- INITIAL STATE & STORAGE ---
const initialState = {
  bills: [],
  schedule: [],
  budget: [],
  deposits: [],
  settings: { currency: '$', userName: 'User' }
};

let state = JSON.parse(localStorage.getItem('budgetFlowState')) || initialState;

function saveState() {
  localStorage.setItem('budgetFlowState', JSON.stringify(state));
  renderAll();
}

// --- TAB SWITCHING ---
function initTabs() {
  const tabs = ['dashboard', 'bills', 'schedule', 'budget', 'deposits', 'settings'];
  const nav = document.getElementById('tabs');
  
  nav.innerHTML = tabs.map(tab => `
    <button class="tab-btn ${tab === 'dashboard' ? 'active' : ''}" 
            onclick="switchTab('${tab}')">
      ${tab.charAt(0).toUpperCase() + tab.slice(1)}
    </button>
  `).join('');
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.add('hidden');
  });
  document.getElementById(`tab-${tabId}`).classList.remove('hidden');
  
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.innerText.toLowerCase() === tabId);
  });
}

// --- RENDER FUNCTIONS ---
function renderSchedule() {
  const container = document.getElementById('tab-schedule');
  const items = state.schedule || [];

  if (items.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>No scheduled items</h3>
        <p>Add your first bill or paycheck to see your timeline.</p>
        <button class="btn" onclick="switchTab('bills')">Go to Bills</button>
      </div>`;
    return;
  }

  let html = `
    <div class="panel-head">
        <h2>Payment Schedule</h2>
        <p>Upcoming cash flow and obligations</p>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Description</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>`;

  items.forEach(item => {
    const amt = typeof item.amount === 'number' ? item.amount.toFixed(2) : '0.00';
    const status = item.status || 'Later';

    html += `
      <tr>
        <td data-label="Date">${item.date || '---'}</td>
        <td data-label="Description"><strong>${item.description || 'Untitled'}</strong></td>
        <td data-label="Amount">$${amt}</td>
        <td data-label="Status">
            <span class="status ${status.toLowerCase()}">${status}</span>
        </td>
        <td data-label="Actions">
          <button class="mini-btn danger-btn" onclick="deleteScheduleItem('${item.id}')">Delete</button>
        </td>
      </tr>`;
  });

  html += `</tbody></table></div>`;
  container.innerHTML = html;
}

// Placeholder for other renders to prevent errors
function renderDashboard() { document.getElementById('tab-dashboard').innerHTML = '<div class="panel-body"><h2>Dashboard</h2><p>Welcome back!</p></div>'; }
function renderBills() { document.getElementById('tab-bills').innerHTML = '<div class="panel-body"><h2>Bills</h2></div>'; }
function renderBudget() { document.getElementById('tab-budget').innerHTML = '<div class="panel-body"><h2>Budget Tracker</h2></div>'; }
function renderDeposits() { document.getElementById('tab-deposits').innerHTML = '<div class="panel-body"><h2>Deposits</h2></div>'; }
function renderSettings() { document.getElementById('tab-settings').innerHTML = '<div class="panel-body"><h2>Settings</h2></div>'; }

function deleteScheduleItem(id) {
    state.schedule = state.schedule.filter(item => item.id !== id);
    saveState();
}

function renderAll() {
  renderDashboard();
  renderBills();
  renderSchedule();
  renderBudget();
  renderDeposits();
  renderSettings();
}

// --- INITIALIZE ---
window.onload = () => {
  initTabs();
  renderAll();
  
  // Seed sample data if empty so you can see the cards!
  if (state.schedule.length === 0) {
      state.schedule = [
          { id: '1', date: '2024-05-01', description: 'Rent Payment', amount: 1200, status: 'Soon' },
          { id: '2', date: '2024-05-05', description: 'Paycheck', amount: 2500, status: 'Paid' }
      ];
      saveState();
  }
};
