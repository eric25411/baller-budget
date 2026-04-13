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

// --- CORE UTILS (Preserved from your script) ---
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
function numberOrZero(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

// --- STATE MANAGEMENT ---
const defaultData = {
  settings: { openingBalance: 0, scheduleMonthsForward: 12, defaultIncome: 0 },
  userName: 'Baller',
  bills: [],
  spending: [],
  deposits: [],
  scheduleMeta: {} // For tracking "Paid" status on generated dates
};

let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || clone(defaultData);
let activeTab = 'dashboard';
let scheduleSearch = '';

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderApp();
}

// --- DYNAMIC SCHEDULE ENGINE (The "Sharing" Logic) ---
function getScheduleRows() {
  const rows = [];
  const start = new Date();
  const end = addDays(start, (state.settings.scheduleMonthsForward || 12) * 30);

  state.bills.forEach(bill => {
    if (!bill.active) return;
    
    // This logic ensures that as soon as a bill exists, it "shares" to the schedule
    let current = parseISODate(bill.date);
    if (!current) return;

    // Simple projection logic
    while (current <= end) {
      const dateStr = toISODate(current);
      const key = `${bill.id}_${dateStr}`;
      const meta = state.scheduleMeta[key] || {};
      
      rows.push({
        id: key,
        billId: bill.id,
        description: bill.name,
        amount: bill.amount,
        date: dateStr,
        status: meta.paid ? 'Paid' : (current < new Date() ? 'Overdue' : 'Upcoming')
      });

      // Advance date based on frequency
      if (bill.frequency === 'Weekly') current = addDays(current, 7);
      else if (bill.frequency === 'Bi-Weekly') current = addDays(current, 14);
      else if (bill.frequency === 'Monthly') { current.setMonth(current.getMonth() + 1); }
      else if (bill.customDays) current = addDays(current, parseInt(bill.customDays));
      else break; // Prevent infinite loops if no frequency matches
    }
  });
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

// --- RENDERING ---

function renderSchedule() {
  const container = document.getElementById('tab-schedule');
  const allRows = getScheduleRows();
  const filtered = allRows.filter(r => r.description.toLowerCase().includes(scheduleSearch.toLowerCase()));

  container.innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <h2>Schedule</h2>
        <input type="text" class="field inline-field" placeholder="Search..." value="${scheduleSearch}" oninput="updateSchedSearch(this.value)">
      </div>
    </div>
    <div class="table-wrap"> <table>
        <thead><tr><th>Date</th><th>Bill</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          ${filtered.map(r => `
            <tr>
              <td data-label="Date">${r.date}</td>
              <td data-label="Bill"><strong>${r.description}</strong></td>
              <td data-label="Amount">${formatMoney(r.amount)}</td>
              <td data-label="Status"><span class="status ${r.status.toLowerCase()}">${r.status}</span></td>
              <td data-label="Actions">
                <button class="mini-btn" onclick="togglePaid('${r.id}')">${r.status === 'Paid' ? 'Undo' : 'Mark Paid'}</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

// Add these to your script to handle the actions:
function updateSchedSearch(v) {
  scheduleSearch = v;
  renderSchedule();
}

function togglePaid(key) {
  if (!state.scheduleMeta) state.scheduleMeta = {};
  state.scheduleMeta[key] = { paid: !state.scheduleMeta[key]?.paid };
  saveState();
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
              <option value="Custom">Custom (Days)</option>
            </select>
            <input type="number" id="customDays" class="field hidden" placeholder="Every X Days">
            <button class="btn" onclick="addBill()" style="margin-top:auto">Add Bill</button>
          </div>
        </div>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Name</th><th>Amount</th><th>Frequency</th><th>Start Date</th><th>Actions</th></tr></thead>
        <tbody>
          ${state.bills.map(b => `
            <tr>
              <td data-label="Name"><strong>${b.name}</strong></td>
              <td data-label="Amount">${formatMoney(b.amount)}</td>
              <td data-label="Frequency">${b.frequency}</td>
              <td data-label="Start">${b.date}</td>
              <td data-label="Actions"><button class="mini-btn danger-btn" onclick="deleteItem('bills','${b.id}')">Delete</button></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function addBill() {
  const n = document.getElementById('billName').value;
  const a = parseFloat(document.getElementById('billAmount').value);
  const d = document.getElementById('billDate').value;
  const f = document.getElementById('billFreq').value;
  const c = document.getElementById('customDays').value;

  if (!n || isNaN(a) || !d) return alert("Please fill in all fields.");

  state.bills.push({
    id: makeId('bill'),
    name: n,
    amount: a,
    date: d,
    frequency: f,
    customDays: f === 'Custom' ? c : null,
    active: true
  });
  
  saveState();
}

// ... Include renderDashboard, renderBudget, renderSpending, renderDeposits, renderSettings from the previous Full Feature script ...

function renderApp() {
  // Logic to render nav and call specific tab functions
  const nav = document.getElementById('tabs');
  nav.innerHTML = TABS.map(t => `<button class="tab-btn ${activeTab === t.id ? 'active' : ''}" onclick="setTab('${t.id}')">${t.label}</button>`).join('');
  
  // Tab visibility
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  document.getElementById(`tab-${activeTab}`).classList.remove('hidden');

  if (activeTab === 'dashboard') renderDashboard();
  if (activeTab === 'bills') renderBills();
  if (activeTab === 'schedule') renderSchedule();
  // ... call others
}

window.onload = renderApp;
