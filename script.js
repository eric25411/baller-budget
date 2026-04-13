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
  settings: { openingBalance: 0, scheduleMonthsForward: 12 },
  userName: 'Baller',
  bills: [],
  spending: [],
  deposits: [],
  scheduleMeta: {}
};

let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || clone(defaultData);
let activeTab = 'dashboard';
let scheduleSearch = '';
let filter30Days = false; 

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderApp();
}

function setTab(id) {
  activeTab = id;
  renderApp();
}

// --- DATA MANAGEMENT HELPERS ---
function exportData() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
  const downloadAnchorNode = document.createElement('a');
  downloadAnchorNode.setAttribute("href", dataStr);
  downloadAnchorNode.setAttribute("download", "budgetflow-backup.json");
  document.body.appendChild(downloadAnchorNode);
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
}

function handleImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const parsed = JSON.parse(e.target.result);
      if (parsed && parsed.bills) { 
        state = parsed;
        saveState();
        alert('Data imported successfully!');
      } else {
        alert('Invalid backup format.');
      }
    } catch (err) {
      alert('Could not read the backup file.');
    }
  };
  reader.readAsText(file);
}

// --- DYNAMIC ENGINE ---
function getScheduleRows() {
  const rows = [];
  const start = new Date();
  const end = addDays(start, (state.settings.scheduleMonthsForward || 12) * 30);
  const thirtyDaysOut = addDays(start, 30);

  state.bills.forEach(bill => {
    let current = parseISODate(bill.date);
    if (!current) return;

    while (current <= end) {
      if (filter30Days && current > thirtyDaysOut) break; 

      const dateStr = toISODate(current);
      const key = `${bill.id}_${dateStr}`;
      const meta = state.scheduleMeta[key] || {};
      
      rows.push({
        id: key,
        description: bill.name,
        amount: bill.amount,
        date: dateStr,
        status: meta.paid ? 'Paid' : (current < new Date() ? 'Overdue' : 'Upcoming')
      });

      if (bill.frequency === 'Weekly') current = addDays(current, 7);
      else if (bill.frequency === 'Bi-Weekly') current = addDays(current, 14);
      else if (bill.frequency === 'Monthly') { current.setMonth(current.getMonth() + 1); }
      else if (bill.frequency === 'Custom' && bill.customDays) current = addDays(current, parseInt(bill.customDays));
      else break;
    }
  });
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

// --- RENDERING TABS ---

function renderDashboard() {
  const income = state.deposits.reduce((s, d) => s + d.amount, 0);
  const bills = state.bills.reduce((s, b) => s + b.amount, 0);
  const spending = state.spending.reduce((s, sp) => s + sp.amount, 0);
  const container = document.getElementById('tab-dashboard');
  container.innerHTML = `
    <div class="stats">
      <div class="stat"><div class="label">Total Income</div><div class="value" style="color:var(--good)">${formatMoney(income)}</div></div>
      <div class="stat"><div class="label">Outbound</div><div class="value" style="color:var(--bad)">${formatMoney(bills + spending)}</div></div>
      <div class="stat"><div class="label">Net Cash</div><div class="value" style="color:var(--accent)">${formatMoney(income - (bills + spending))}</div></div>
    </div>
    <div class="panel"><div class="panel-body"><h3>Welcome back, ${state.userName}</h3></div></div>`;
}

function renderBills() {
  const container = document.getElementById('tab-bills');
  container.innerHTML = `
    <div class="panel"><div class="panel-head"><h2>Manage Bills</h2></div>
      <div class="panel-body stack">
        <input type="text" id="billName" class="field" placeholder="Name">
        <input type="number" id="billAmount" class="field" placeholder="Amount">
        <input type="date" id="billDate" class="field" style="width: 100%; box-sizing: border-box;">
        <select id="billFreq" class="field" onchange="toggleCustomFreq(this.value)">
          <option value="Monthly">Monthly</option>
          <option value="Weekly">Weekly</option>
          <option value="Bi-Weekly">Bi-Weekly</option>
          <option value="Custom">Custom Days</option>
        </select>
        <input type="number" id="customDays" class="field hidden" placeholder="Every X Days">
        <button class="btn" onclick="addBill()">Add Bill</button>
      </div>
    </div>
    <div class="table-wrap"><table><thead><tr><th>Name</th><th>Amt</th><th>Freq</th><th>Actions</th></tr></thead><tbody>
    ${state.bills.map(b => `<tr><td data-label="Name">${b.name}</td><td data-label="Amt">${formatMoney(b.amount)}</td><td data-label="Freq">${b.frequency}</td>
    <td data-label="Actions"><button class="mini-btn danger-btn" onclick="deleteItem('bills','${b.id}')">Delete</button></td></tr>`).join('')}
    </tbody></table></div>`;
}

function renderSchedule() {
  const container = document.getElementById('tab-schedule');
  const rows = getScheduleRows().filter(r => r.description.toLowerCase().includes(scheduleSearch.toLowerCase()));
  container.innerHTML = `
    <div class="panel"><div class="panel-head"><h2>Schedule</h2>
      <div class="stack" style="gap:10px">
        <input type="text" class="field" placeholder="Search..." oninput="updateSearch(this.value)">
        <label><input type="checkbox" ${filter30Days ? 'checked' : ''} onchange="toggle30DayFilter(this.checked)"> Next 30 Days Only</label>
      </div>
    </div></div>
    <div class="table-wrap"><table><thead><tr><th>Date</th><th>Bill</th><th>Amt</th><th>Status</th><th>Action</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td data-label="Date">${r.date}</td><td data-label="Bill">${r.description}</td><td data-label="Amt">${formatMoney(r.amount)}</td>
    <td data-label="Status">${r.status}</td><td><button class="mini-btn" onclick="togglePaid('${r.id}')">${r.status === 'Paid' ? 'Unpay' : 'Pay'}</button></td></tr>`).join('')}
    </tbody></table></div>`;
}

function renderSpending() {
  const container = document.getElementById('tab-spending');
  container.innerHTML = `
    <div class="panel"><div class="panel-head"><h2>Other Spending</h2></div>
    <div class="panel-body stack">
      <input type="text" id="spDesc" class="field" placeholder="Description">
      <input type="number" id="spAmt" class="field" placeholder="Amount">
      <input type="date" id="spDate" class="field" style="width: 100%; box-sizing: border-box;">
      <button class="btn" onclick="addSpending()">Add Expense</button>
    </div></div>
    <div class="table-wrap"><table><thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Action</th></tr></thead><tbody>
    ${state.spending.map(s => `<tr><td data-label="Date">${s.date}</td><td data-label="Desc">${s.description}</td><td data-label="Amt">${formatMoney(s.amount)}</td>
    <td><button class="mini-btn danger-btn" onclick="deleteItem('spending','${s.id}')">Delete</button></td></tr>`).join('')}
    </tbody></table></div>`;
}

function renderDeposits() {
  const container = document.getElementById('tab-deposits');
  container.innerHTML = `
    <div class="panel"><div class="panel-head"><h2>Deposits & Income</h2></div>
    <div class="panel-body stack">
      <input type="text" id="dpDesc" class="field" placeholder="Source">
      <input type="number" id="dpAmt" class="field" placeholder="Amount">
      <input type="date" id="dpDate" class="field" style="width: 100%; box-sizing: border-box;">
      <button class="btn" onclick="addDeposit()">Add Deposit</button>
    </div></div>
    <div class="table-wrap"><table><thead><tr><th>Date</th><th>Source</th><th>Amount</th><th>Action</th></tr></thead><tbody>
    ${state.deposits.map(d => `<tr><td data-label="Date">${d.date}</td><td data-label="Source">${d.description}</td><td data-label="Amt">${formatMoney(d.amount)}</td>
    <td><button class="mini-btn danger-btn" onclick="deleteItem('deposits','${d.id}')">Delete</button></td></tr>`).join('')}
    </tbody></table></div>`;
}

function renderBudget() {
  const inc = state.deposits.reduce((s, d) => s + d.amount, 0);
  const bil = state.bills.reduce((s, b) => s + b.amount, 0);
  const spd = state.spending.reduce((s, sp) => s + sp.amount, 0);
  const container = document.getElementById('tab-budget');
  container.innerHTML = `
    <div class="panel-head"><h2>Budget Tracker</h2></div>
    <div class="summary-grid">
      <div class="summary-tile"><div class="label">Total Income</div><div class="value">${formatMoney(inc)}</div></div>
      <div class="summary-tile"><div class="label">Monthly Bills</div><div class="value">${formatMoney(bil)}</div></div>
      <div class="summary-tile"><div class="label">Extra Spending</div><div class="value">${formatMoney(spd)}</div></div>
      <div class="summary-tile"><div class="label">Projected Leftover</div><div class="value" style="color:var(--accent)">${formatMoney(inc - (bil + spd))}</div></div>
    </div>`;
}

function renderSettings() {
  const container = document.getElementById('tab-settings');
  container.innerHTML = `
    <div class="panel"><div class="panel-head"><h2>Settings & Profile</h2></div>
      <div class="panel-body stack">
        <label>User Name</label>
        <input type="text" class="field" value="${state.userName}" onchange="state.userName=this.value;saveState()">
      </div>
    </div>
    
    <div class="panel" style="margin-top: 20px;">
      <div class="panel-head"><h2>Data Management</h2></div>
      <div class="panel-body stack">
        <p style="font-size: 0.9em; color: #666; margin-bottom: 10px;">Back up your data or restore from a previous save.</p>
        
        <button class="btn" onclick="exportData()">Export Backup (JSON)</button>
        
        <div style="margin: 10px 0;">
          <label style="font-weight: bold; display: block; margin-bottom: 5px;">Import Backup</label>
          <input type="file" id="importFile" accept=".json" onchange="handleImport(event)" class="field" style="padding: 10px 5px; width: 100%; box-sizing: border-box;">
        </div>

        <button class="danger-btn" onclick="if(confirm('Are you absolutely sure? This will wipe all bills, income, and history.')){state=clone(defaultData);saveState()}" style="margin-top:20px">Wipe All Data</button>
      </div>
    </div>`;
}

// --- ACTIONS ---
function toggleCustomFreq(v) { document.getElementById('customDays').classList.toggle('hidden', v !== 'Custom'); }
function updateSearch(v) { scheduleSearch = v; renderSchedule(); }
function toggle30DayFilter(v) { filter30Days = v; renderSchedule(); }
function togglePaid(key) { state.scheduleMeta[key] = { paid: !state.scheduleMeta[key]?.paid }; saveState(); }
function deleteItem(coll, id) { state[coll] = state[coll].filter(i => i.id !== id); saveState(); }

function addBill() {
  const n = document.getElementById('billName').value, a = parseFloat(document.getElementById('billAmount').value), d = document.getElementById('billDate').value, f = document.getElementById('billFreq').value, c = document.getElementById('customDays').value;
  if (!n || isNaN(a) || !d) return;
  state.bills.push({ id: makeId('bill'), name: n, amount: a, date: d, frequency: f, customDays: c });
  saveState();
}

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

// --- INIT ---
function renderApp() {
  const nav = document.getElementById('tabs');
  nav.innerHTML = TABS.map(t => `<button class="tab-btn ${activeTab === t.id ? 'active' : ''}" onclick="setTab('${t.id}')">${t.label}</button>`).join('');
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  document.getElementById(`tab-${activeTab}`).classList.remove('hidden');

  if (activeTab === 'dashboard') renderDashboard();
  else if (activeTab === 'bills') renderBills();
  else if (activeTab === 'schedule') renderSchedule();
  else if (activeTab === 'budget') renderBudget();
  else if (activeTab === 'spending') renderSpending();
  else if (activeTab === 'deposits') renderDeposits();
  else if (activeTab === 'settings') renderSettings();
}

window.onload = renderApp;
