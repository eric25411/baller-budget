const STORAGE_KEY = 'budgetflow-v4';

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'bills', label: 'Bills' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'budget', label: 'Budget Tracker' },
  { id: 'spending', label: 'Other Spending' },
  { id: 'deposits', label: 'Deposits' },
  { id: 'settings', label: 'Settings' }
];

// --- STYLES ---
const style = document.createElement('style');
style.textContent = `
    :root { --primary: #5fa8e6; --secondary: #2ecc71; --danger: #e74c3c; --bg: #f4f6f9; --card-bg: #ffffff; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); margin: 0; padding-bottom: 50px; color: #333; }
    
    #header { background: var(--primary); color: white; padding: 25px 15px 20px; text-align: center; transition: background 0.3s; }
    #header h1 { margin: 0; font-size: 1.8rem; font-weight: 800; letter-spacing: -0.5px; }
    #user-greeting { margin: 5px 0 0; opacity: 0.9; font-size: 0.9rem; font-weight: 500; }
    
    #tabs-container { overflow-x: auto; white-space: nowrap; padding: 12px; background: #fff; border-bottom: 1px solid #eee; position: sticky; top: 0; z-index: 100; display: flex; gap: 8px; }
    #tabs-container::-webkit-scrollbar { display: none; }
    .tab-btn { padding: 10px 18px; border-radius: 20px; border: none; background: #f0f2f5; cursor: pointer; font-weight: 600; font-size: 0.85rem; color: #555; transition: 0.2s; }
    .tab-btn.active { background: var(--primary); color: white; }

    .panel { background: var(--card-bg); border-radius: 16px; padding: 20px; margin: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.03); }
    .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 0 15px; }
    .stat-card { background: var(--card-bg); padding: 15px; border-radius: 12px; text-align: center; box-shadow: 0 4px 15px rgba(0,0,0,0.03); }
    .hero-val { font-size: 2.2rem; font-weight: 800; color: var(--primary); margin: 8px 0; }
    
    .stack { display: flex; flex-direction: column; gap: 12px; }
    .field { width: 100%; padding: 14px; border-radius: 10px; border: 1px solid #e1e4e8; box-sizing: border-box; font-size: 1rem; background: #fafbfc; }
    .btn { background: var(--primary); color: white; border: none; padding: 14px; border-radius: 10px; font-weight: 700; width: 100%; font-size: 1rem; cursor: pointer; }
    .mini-btn { padding: 6px 12px; border-radius: 6px; border: none; font-size: 0.8rem; cursor: pointer; font-weight: 600; }
    .flex-between { display: flex; justify-content: space-between; align-items: center; }
    .hidden { display: none; }
    
    hr { border: 0; border-top: 1px solid #eee; margin: 15px 0; }
    .text-green { color: #2ecc71; }
    .text-red { color: #e74c3c; }
    .text-blue { color: var(--primary); }
`;
document.head.appendChild(style);

// --- APP SHELL ---
document.body.innerHTML = `
    <div id="header">
        <h1>BudgetFlow</h1>
        <p id="user-greeting"></p>
    </div>
    <div id="tabs-container"></div>
    <div id="main-content"></div>
`;

// --- DATA HANDLERS & AUTO-HEAL ---
const defaultData = {
    userName: 'Baller',
    settings: { initialBalance: 0, anchorDate: '2026-04-11', periodDays: 14, themeColor: '#5fa8e6' },
    bills: [], spending: [], deposits: [], scheduleMeta: {}
};

let state;
try {
    state = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!state) state = defaultData;
} catch (e) {
    state = defaultData;
}

if (!state.bills) state.bills = [];
if (!state.spending) state.spending = [];
if (!state.deposits) state.deposits = [];
if (!state.scheduleMeta) state.scheduleMeta = {};
if (!state.settings) state.settings = defaultData.settings;
if (!state.settings.themeColor) state.settings.themeColor = '#5fa8e6';
if (!state.userName) state.userName = defaultData.userName;

let activeTab = 'dashboard';
let periodOffset = 0;
let scheduleMode = 'period';

function save() { 
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); 
    render(); 
}

// --- UTILS & LOGIC ---
const format = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v || 0);
function makeId() { return Math.random().toString(36).slice(2, 9); }

function getPeriod() {
    const anchor = new Date(state.settings.anchorDate + 'T00:00:00');
    const start = new Date(anchor);
    start.setDate(anchor.getDate() + (periodOffset * state.settings.periodDays));
    const end = new Date(start);
    end.setDate(start.getDate() + (state.settings.periodDays - 1));
    return { start, end, startStr: start.toISOString().split('T')[0], endStr: end.toISOString().split('T')[0] };
}

function getSchedule() {
    const rows = [];
    const limit = new Date();
    limit.setDate(limit.getDate() + 365);
    
    state.bills.forEach(b => {
        if (!b.date) return;
        let curr = new Date(b.date + 'T00:00:00');
        while (curr <= limit) {
            const dStr = curr.toISOString().split('T')[0];
            const key = `${b.id}_${dStr}`;
            const meta = state.scheduleMeta[key] || {};
            rows.push({
                id: key, date: dStr, name: b.name,
                amount: meta.actual !== undefined ? meta.actual : b.amount,
                paid: !!meta.paid
            });
            if (b.freq === 'Weekly') curr.setDate(curr.getDate() + 7);
            else if (b.freq === 'Bi-Weekly') curr.setDate(curr.getDate() + 14);
            else if (b.freq === 'Monthly') curr.setMonth(curr.getMonth() + 1);
            else if (b.freq === 'Custom' && b.customDays) curr.setDate(curr.getDate() + parseInt(b.customDays));
            else break;
        }
    });
    return rows.sort((a, b) => a.date.localeCompare(b.date));
}

// --- RENDERING ROUTINE ---
function render() {
    // Apply Theme
    document.documentElement.style.setProperty('--primary', state.settings.themeColor);

    document.getElementById('user-greeting').textContent = `Welcome back, ${state.userName}`;
    
    const tabsBox = document.getElementById('tabs-container');
    tabsBox.innerHTML = TABS.map(t => `<button class="tab-btn ${activeTab === t.id ? 'active' : ''}" onclick="activeTab='${t.id}';render()">${t.label}</button>`).join('');

    const content = document.getElementById('main-content');
    const p = getPeriod();

    const periodBills = state.bills.filter(b => b.date >= p.startStr && b.date <= p.endStr).reduce((s, b) => s + b.amount, 0);
    const periodSpend = state.spending.filter(s => s.date >= p.startStr && s.date <= p.endStr).reduce((s, x) => s + x.amount, 0);
    const periodDep = state.deposits.filter(d => d.date >= p.startStr && d.date <= p.endStr).reduce((s, d) => s + d.amount, 0);
    const remaining = (state.settings.initialBalance + periodDep) - (periodBills + periodSpend);

    if (activeTab === 'dashboard') {
        content.innerHTML = `
            <div class="panel" style="text-align:center">
                <strong style="color:#7f8c8d; font-size:0.9rem; text-transform:uppercase;">Total Available</strong>
                <div class="hero-val">${format(remaining)}</div>
            </div>
            <div class="stat-grid">
                <div class="stat-card"><small style="color:#7f8c8d; font-weight:bold;">INCOME</small><br><strong style="font-size:1.2rem;">${format(periodDep)}</strong></div>
                <div class="stat-card"><small style="color:#7f8c8d; font-weight:bold;">SPENT</small><br><strong style="font-size:1.2rem;">${format(periodSpend + periodBills)}</strong></div>
            </div>`;
    }

    else if (activeTab === 'bills') {
        content.innerHTML = `
            <div class="panel">
                <h3>Manage Bills</h3>
                <div class="stack">
                    <input id="bn" placeholder="Name" class="field">
                    <input id="ba" type="number" placeholder="$ Amount" class="field">
                    <input id="bd" type="date" class="field">
                    <select id="bf" class="field" onchange="document.getElementById('bcWrap').style.display = this.value === 'Custom' ? 'block' : 'none'">
                        <option value="Monthly">Monthly</option>
                        <option value="Weekly">Weekly</option>
                        <option value="Bi-Weekly">Bi-Weekly</option>
                        <option value="Custom">Custom Days</option>
                    </select>
                    <div id="bcWrap" style="display:none;">
                        <input id="bc" type="number" placeholder="Every X Days" class="field">
                    </div>
                    <button class="btn" onclick="addBill()">Save Bill</button>
                </div>
            </div>
            ${state.bills.map((b, idx) => `
                <div class="panel flex-between" style="padding: 15px;">
                    <div><strong style="font-size:1.1rem;">${b.name}</strong><br><small style="color:#7f8c8d;">${b.freq}${b.freq==='Custom'? ` (${b.customDays} days)` : ''} • Starts: ${b.date}</small></div>
                    <div style="text-align:right;">
                        <strong>${format(b.amount)}</strong><br>
                        <div style="margin-top:5px; display:flex; gap:5px; justify-content:flex-end;">
                            <button class="mini-btn" style="background:#e0e0e0; color:#333;" onclick="editBill('${b.id}')">Edit</button>
                            <button class="mini-btn" style="background:var(--danger); color:white;" onclick="state.bills.splice(${idx}, 1);save()">Del</button>
                        </div>
                    </div>
                </div>`).join('')}`;
    }

    else if (activeTab === 'schedule') {
        let rows = getSchedule();
        if (scheduleMode === 'period') {
            rows = rows.filter(r => r.date >= p.startStr && r.date <= p.endStr);
        } else {
            const end30 = new Date(); end30.setDate(end30.getDate() + 30);
            rows = rows.filter(r => r.date >= new Date().toISOString().split('T')[0] && r.date <= end30.toISOString().split('T')[0]);
        }
        
        content.innerHTML = `
            <div class="flex-between" style="padding: 10px 15px; margin-bottom: 5px;">
                <button class="mini-btn ${scheduleMode==='period'?'btn':''}" style="${scheduleMode==='period'?'':'background:#e0e0e0; color:#333'}" onclick="scheduleMode='period';render()">Pay Period</button>
                <button class="mini-btn ${scheduleMode==='all'?'btn':''}" style="${scheduleMode==='all'?'':'background:#e0e0e0; color:#333'}" onclick="scheduleMode='all';render()">Next 30 Days</button>
            </div>
            ${scheduleMode === 'period' ? `
            <div class="flex-between" style="padding: 0 20px 15px;">
                <button class="mini-btn" style="background:#ddd" onclick="periodOffset--;render()">❮ Prev</button>
                <strong>${p.startStr} to ${p.endStr}</strong>
                <button class="mini-btn" style="background:#ddd" onclick="periodOffset++;render()">Next ❯</button>
            </div>` : ''}
            
            ${rows.length === 0 ? '<div class="panel" style="text-align:center; color:#7f8c8d;">No bills in this timeframe.</div>' : ''}
            
            ${rows.map(r => `
                <div class="panel flex-between" style="opacity:${r.paid?0.5:1}; transition: 0.3s; margin-top: 5px;">
                    <div><small style="color:#7f8c8d; font-weight:bold;">${r.date}</small><br><strong style="font-size:1.1rem;">${r.name}</strong></div>
                    <div style="text-align:right">
                        <input type="number" style="width:70px;text-align:right; border:1px solid #ddd; padding:4px; border-radius:4px;" value="${r.amount}" onchange="state.scheduleMeta['${r.id}']={...state.scheduleMeta['${r.id}'], actual:parseFloat(this.value)};save()">
                        <br><button class="mini-btn" style="margin-top:8px; background:${r.paid?'var(--secondary)':'#e0e0e0'}; color:${r.paid?'white':'#333'};" onclick="state.scheduleMeta['${r.id}']={...state.scheduleMeta['${r.id}'], paid:!${r.paid}};save()">${r.paid?'Paid ✓':'Mark Paid'}</button>
                    </div>
                </div>`).join('')}`;
    }

    else if (activeTab === 'budget') {
        content.innerHTML = `
            <div class="panel">
                <h3 style="margin-top:0; color:var(--primary); display:flex; justify-content:space-between;">Budget Analysis <span style="background:#eee; padding:4px 8px; border-radius:8px; font-size:0.8rem; color:#555;">${p.startStr} - ${p.endStr}</span></h3>
                <hr>
                <div class="stack">
                    <div class="flex-between"><span>Carryover Balance</span> <strong>${format(state.settings.initialBalance)}</strong></div>
                    <div class="flex-between"><span>Planned Income</span> <strong class="text-green">+${format(periodDep)}</strong></div>
                    <div class="flex-between"><span>Expected Bills</span> <strong class="text-red">-${format(periodBills)}</strong></div>
                    <div class="flex-between"><span>Other Spending</span> <strong class="text-red">-${format(periodSpend)}</strong></div>
                    <hr>
                    <div class="flex-between" style="font-size:1.2rem;">
                        <strong>Remaining</strong> <strong class="text-blue">${format(remaining)}</strong>
                    </div>
                </div>
            </div>`;
    }

    else if (activeTab === 'spending' || activeTab === 'deposits') {
        const isDep = activeTab === 'deposits';
        const list = isDep ? state.deposits : state.spending;
        content.innerHTML = `
            <div class="panel">
                <h3>Add ${isDep ? 'Deposit' : 'Spending'}</h3>
                <div class="stack">
                    <input id="add-n" placeholder="Description" class="field">
                    <input id="add-a" type="number" placeholder="$ Amount" class="field">
                    <input id="add-d" type="date" class="field" value="${new Date().toISOString().split('T')[0]}">
                    <button class="btn" onclick="addItem('${activeTab}')">Save Entry</button>
                </div>
            </div>
            ${list.map((item, idx) => `
                <div class="panel flex-between" style="padding: 15px;">
                    <div><strong style="font-size:1.1rem;">${item.name}</strong><br><small style="color:#7f8c8d;">${item.date}</small></div>
                    <div style="text-align:right;"><strong>${format(item.amount)}</strong><br><button class="mini-btn" style="background:var(--danger); color:white; margin-top:5px;" onclick="deleteItem('${activeTab}', ${idx})">Del</button></div>
                </div>`).join('')}`;
    }

    else if (activeTab === 'settings') {
        content.innerHTML = `
            <div class="panel">
                <h3>Configuration</h3>
                <div class="stack">
                    <label><small style="color:#7f8c8d; font-weight:bold;">Your Name</small></label>
                    <input class="field" value="${state.userName}" onchange="state.userName=this.value;save()">
                    
                    <label><small style="color:#7f8c8d; font-weight:bold;">App Theme Color</small></label>
                    <input type="color" class="field" value="${state.settings.themeColor}" style="height:50px; padding:5px;" onchange="state.settings.themeColor=this.value;save()">
                    
                    <label><small style="color:#7f8c8d; font-weight:bold;">Start Balance</small></label>
                    <input type="number" class="field" value="${state.settings.initialBalance}" onchange="state.settings.initialBalance=parseFloat(this.value);save()">
                    
                    <label><small style="color:#7f8c8d; font-weight:bold;">Pay Period Anchor Date</small></label>
                    <input type="date" class="field" value="${state.settings.anchorDate}" onchange="state.settings.anchorDate=this.value;save()">
                    
                    <label><small style="color:#7f8c8d; font-weight:bold;">Days Per Period</small></label>
                    <input type="number" class="field" value="${state.settings.periodDays}" onchange="state.settings.periodDays=parseInt(this.value);save()">
                </div>
            </div>
            <div class="panel">
                <h3>Data Tools</h3>
                <div class="stack">
                    <button class="btn" style="background:#2ecc71;" onclick="exportCSV()">Export to CSV</button>
                    <button class="btn" style="background:var(--danger);" onclick="if(confirm('Are you completely sure you want to clear all data?')){state=defaultData;save();}">Wipe Data & Reset</button>
                </div>
            </div>`;
    }
}

// --- GLOBAL ACTIONS ---
window.addBill = () => {
    const n = document.getElementById('bn').value, a = parseFloat(document.getElementById('ba').value), d = document.getElementById('bd').value;
    const f = document.getElementById('bf').value, c = document.getElementById('bc') ? document.getElementById('bc').value : null;
    if(n && a && d) { state.bills.push({ id: makeId(), name: n, amount: a, date: d, freq: f, customDays: c }); save(); }
};

window.editBill = (id) => {
    const b = state.bills.find(x => x.id === id);
    if (!b) return;
    const n = prompt("Edit Bill Name:", b.name);
    const a = prompt("Edit Amount ($):", b.amount);
    const d = prompt("Edit Start Date (YYYY-MM-DD):", b.date);
    if (n && a && d) { b.name = n; b.amount = parseFloat(a); b.date = d; save(); }
};

window.addItem = (type) => {
    const n = document.getElementById('add-n').value, a = parseFloat(document.getElementById('add-a').value), d = document.getElementById('add-d').value;
    if(n && a && d) { state[type].push({name:n, amount:a, date:d}); save(); }
};

window.deleteItem = (type, idx) => { state[type].splice(idx, 1); save(); };

window.exportCSV = () => {
    let csv = "Type,Date,Description,Amount\\n";
    state.spending.forEach(s => csv += \`Expense,\${s.date},"\${s.name}",\${s.amount}\\n\`);
    state.deposits.forEach(d => csv += \`Income,\${d.date},"\${d.name}",\${d.amount}\\n\`);
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'BudgetFlow_Data.csv';
    a.click();
};

// Boot App
render();
