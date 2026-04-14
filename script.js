const STORAGE_KEY = 'budgetflow-v2';const STORAGE_KEY = 'budgetflow-v3';

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'bills', label: 'Bills' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'budget', label: 'Budget Tracker' },
  { id: 'spending', label: 'Other Spending' },
  { id: 'deposits', label: 'Deposits' },
  { id: 'settings', label: 'Settings' },
];

// --- STYLES ---
const style = document.createElement('style');
style.textContent = `
    :root { --primary: #3498db; --secondary: #2ecc71; --danger: #e74c3c; --bg: #f8f9fa; --card-bg: #ffffff; }
    body { font-family: -apple-system, sans-serif; background: var(--bg); margin: 0; padding-bottom: 50px; }
    #header { background: var(--primary); color: white; padding: 20px; text-align: center; }
    #header h1 { margin: 0; font-size: 1.5rem; }
    #header p { margin: 5px 0 0; opacity: 0.9; font-size: 0.9rem; }
    
    #tabs-container { overflow-x: auto; white-space: nowrap; padding: 12px; background: #fff; border-bottom: 1px solid #eee; position: sticky; top: 0; z-index: 100; }
    .tab-btn { display: inline-block; padding: 8px 16px; border-radius: 20px; border: none; background: #eee; cursor: pointer; font-weight: 600; margin-right: 8px; font-size: 0.8rem; }
    .tab-btn.active { background: var(--primary); color: white; }

    .panel { background: var(--card-bg); border-radius: 12px; padding: 15px; margin: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
    .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
    .stat-card { background: #f1f2f6; padding: 10px; border-radius: 8px; text-align: center; }
    .hero-val { font-size: 1.8rem; font-weight: 800; color: var(--primary); margin: 5px 0; }
    
    .stack { display: flex; flex-direction: column; gap: 10px; }
    .field { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #ddd; box-sizing: border-box; }
    .btn { background: var(--primary); color: white; border: none; padding: 12px; border-radius: 8px; font-weight: 700; width: 100%; }
    .flex-between { display: flex; justify-content: space-between; align-items: center; }
    .hidden { display: none; }
`;
document.head.appendChild(style);

// --- APP SHELL ---
document.body.innerHTML = `
    <div id="header">
        <h1>BudgetFlow</h1>
        <p id="user-greeting">Welcome</p>
    </div>
    <div id="tabs-container"></div>
    <div id="main-content"></div>
`;

// --- DATA HANDLERS ---
const defaultData = {
    userName: 'Baller',
    settings: { initialBalance: 0, anchorDate: new Date().toISOString().split('T')[0], periodDays: 14 },
    bills: [], spending: [], deposits: [], scheduleMeta: {}
};

let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultData;
let activeTab = 'dashboard', periodOffset = 0;

function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); render(); }

// --- LOGIC ---
function getPeriod() {
    const anchor = new Date(state.settings.anchorDate + 'T00:00:00');
    const start = new Date(anchor);
    start.setDate(anchor.getDate() + (periodOffset * state.settings.periodDays));
    const end = new Date(start);
    end.setDate(start.getDate() + (state.settings.periodDays - 1));
    return { start, end, startStr: start.toISOString().split('T')[0], endStr: end.toISOString().split('T')[0] };
}

function render() {
    document.getElementById('user-greeting').textContent = `Welcome back, ${state.userName}`;
    
    const tabsBox = document.getElementById('tabs-container');
    tabsBox.innerHTML = TABS.map(t => `<button class="tab-btn ${activeTab === t.id ? 'active' : ''}" onclick="activeTab='${t.id}';render()">${t.label}</button>`).join('');

    const content = document.getElementById('main-content');
    const p = getPeriod();
    const format = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v || 0);

    // Filter data for current period
    const periodBills = state.bills.filter(b => b.date >= p.startStr && b.date <= p.endStr).reduce((s, b) => s + b.amount, 0);
    const periodSpend = state.spending.filter(s => s.date >= p.startStr && s.date <= p.endStr).reduce((s, x) => s + x.amount, 0);
    const periodDep = state.deposits.filter(d => d.date >= p.startStr && d.date <= p.endStr).reduce((s, d) => s + d.amount, 0);
    const remaining = (state.settings.initialBalance + periodDep) - (periodBills + periodSpend);

    if (activeTab === 'dashboard') {
        content.innerHTML = `
            <div class="panel" style="text-align:center">
                <small>Available Balance</small>
                <div class="hero-val">${format(remaining)}</div>
            </div>
            <div class="stat-grid">
                <div class="panel stat-card"><small>Bills</small><br><strong>${format(periodBills)}</strong></div>
                <div class="panel stat-card"><small>Income</small><br><strong>${format(periodDep)}</strong></div>
            </div>`;
    }

    if (activeTab === 'budget') {
        content.innerHTML = `
            <div class="panel">
                <h3>Budget Analysis</h3>
                <small>${p.startStr} to ${p.endStr}</small>
                <hr style="border:0; border-top:1px solid #eee; margin:15px 0;">
                <div class="stack">
                    <div class="flex-between"><span>Start Balance</span> <strong>${format(state.settings.initialBalance)}</strong></div>
                    <div class="flex-between"><span>Total Deposits</span> <span style="color:green">+${format(periodDep)}</span></div>
                    <div class="flex-between"><span>Expected Bills</span> <span style="color:red">-${format(periodBills)}</span></div>
                    <div class="flex-between"><span>Other Spending</span> <span style="color:red">-${format(periodSpend)}</span></div>
                    <div class="flex-between" style="font-size:1.2rem; margin-top:10px; border-top:2px solid #eee; padding-top:10px;">
                        <strong>Remaining</strong> <strong>${format(remaining)}</strong>
                    </div>
                </div>
            </div>`;
    }

    if (activeTab === 'spending' || activeTab === 'deposits') {
        const isDep = activeTab === 'deposits';
        const list = isDep ? state.deposits : state.spending;
        content.innerHTML = `
            <div class="panel">
                <h3>Add ${isDep ? 'Deposit' : 'Spending'}</h3>
                <div class="stack">
                    <input id="add-n" placeholder="Description" class="field">
                    <input id="add-a" type="number" placeholder="Amount" class="field">
                    <input id="add-d" type="date" class="field" value="${new Date().toISOString().split('T')[0]}">
                    <button class="btn" onclick="addItem('${activeTab}')">Save Entry</button>
                </div>
            </div>
            ${list.map((item, idx) => `
                <div class="panel flex-between">
                    <div><strong>${item.name}</strong><br><small>${item.date}</small></div>
                    <div><strong>${format(item.amount)}</strong> <button onclick="deleteItem('${activeTab}', ${idx})" style="border:none; background:none; color:red; margin-left:10px;">✕</button></div>
                </div>`).join('')}`;
    }

    if (activeTab === 'settings') {
        content.innerHTML = `
            <div class="panel">
                <h3>Configuration</h3>
                <div class="stack">
                    <label><small>Your Name</small></label>
                    <input class="field" value="${state.userName}" onchange="state.userName=this.value;save()">
                    <label><small>Start Balance</small></label>
                    <input type="number" class="field" value="${state.settings.initialBalance}" onchange="state.settings.initialBalance=parseFloat(this.value);save()">
                    <label><small>Pay Period Anchor Date</small></label>
                    <input type="date" class="field" value="${state.settings.anchorDate}" onchange="state.settings.anchorDate=this.value;save()">
                    <label><small>Days Per Period</small></label>
                    <input type="number" class="field" value="${state.settings.periodDays}" onchange="state.settings.periodDays=parseInt(this.value);save()">
                    <button class="btn" style="background:var(--danger); margin-top:20px;" onclick="if(confirm('Clear all data?')){state=defaultData;save()}">Reset App</button>
                </div>
            </div>`;
    }
    // (Other tabs like Bills/Schedule use similar patterns as previous working versions)
}

window.addItem = (type) => {
    const n = document.getElementById('add-n').value, a = parseFloat(document.getElementById('add-a').value), d = document.getElementById('add-d').value;
    if(n && a && d) { state[type].push({name:n, amount:a, date:d}); save(); }
};
window.deleteItem = (type, idx) => { state[type].splice(idx, 1); save(); };

render();


const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'bills', label: 'Bills' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'budget', label: 'Budget Tracker' },
  { id: 'spending', label: 'Other Spending' },
  { id: 'deposits', label: 'Deposits' },
  { id: 'settings', label: 'Settings' },
];

// --- STYLES ---
const style = document.createElement('style');
style.textContent = `
    :root {
        --primary: #3498db;
        --secondary: #2ecc71;
        --danger: #e74c3c;
        --bg: #f8f9fa;
        --card-bg: #ffffff;
        --text-main: #2d3436;
        --text-sub: #636e72;
    }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text-main); margin: 0; padding: 0; }
    
    #tabs-container {
        overflow-x: auto;
        white-space: nowrap;
        padding: 15px 10px;
        background: #fff;
        border-bottom: 1px solid #eee;
        position: sticky;
        top: 0;
        z-index: 100;
    }
    
    .tab-btn { 
        display: inline-block;
        padding: 10px 18px; 
        border-radius: 20px; 
        border: none; 
        background: #eee; 
        cursor: pointer; 
        font-weight: 600; 
        font-size: 0.85rem; 
        margin-right: 8px;
    }
    .tab-btn.active { background: var(--primary); color: white; }

    .panel { background: var(--card-bg); border-radius: 16px; padding: 20px; margin: 15px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .hero-value { font-size: 2.5rem; font-weight: 800; color: var(--primary); margin: 10px 0; }
    .stack { display: flex; flex-direction: column; gap: 12px; }
    .field { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #ddd; box-sizing: border-box; font-size: 1rem; }
    .btn { background: var(--primary); color: white; border: none; padding: 14px; border-radius: 8px; font-weight: 700; cursor: pointer; }
    .mini-btn { padding: 6px 12px; border-radius: 6px; border: none; font-size: 0.75rem; cursor: pointer; }
    .hidden { display: none; }
    .flex-between { display: flex; justify-content: space-between; align-items: center; }
    .arrow-btn { background: #eee; border: none; width: 36px; height: 36px; border-radius: 50%; cursor: pointer; font-weight: bold; }
`;
document.head.appendChild(style);

// --- APP HTML STRUCTURE ---
document.body.innerHTML = `
    <div id="tabs-container"></div>
    <div id="main-content">
        <div id="tab-dashboard" class="tab-panel"></div>
        <div id="tab-bills" class="tab-panel hidden"></div>
        <div id="tab-schedule" class="tab-panel hidden"></div>
        <div id="tab-budget" class="tab-panel hidden"></div>
        <div id="tab-spending" class="tab-panel hidden"></div>
        <div id="tab-deposits" class="tab-panel hidden"></div>
        <div id="tab-settings" class="tab-panel hidden"></div>
    </div>
`;

// --- UTILS ---
function makeId(p) { return p + '-' + Math.random().toString(36).slice(2, 9); }
function toISO(d) { return d.toISOString().split('T')[0]; }
function parseISO(s) { const b = s.split('-'); return new Date(b[0], b[1]-1, b[2]); }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function format(v) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v || 0); }

// --- DATA ---
const defaultData = {
  userName: 'Baller',
  settings: { initialBalance: 0, anchorDate: toISO(new Date()), periodDays: 14 },
  bills: [], spending: [], deposits: [], scheduleMeta: {}
};

let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultData;
let activeTab = 'dashboard', periodOffset = 0, scheduleMode = 'period';

function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); render(); }

// --- CALCULATIONS ---
function getPeriod() {
    const start = addDays(parseISO(state.settings.anchorDate), periodOffset * state.settings.periodDays);
    const end = addDays(start, state.settings.periodDays - 1);
    return { start, end };
}

function getSchedule() {
    const rows = [];
    const limit = addDays(new Date(), 365);
    state.bills.forEach(b => {
        let curr = parseISO(b.date);
        while (curr <= limit) {
            const dStr = toISO(curr);
            const key = `${b.id}_${dStr}`;
            const meta = state.scheduleMeta[key] || {};
            rows.push({
                id: key, date: dStr, name: b.name, 
                amount: meta.actual !== undefined ? meta.actual : b.amount,
                paid: !!meta.paid
            });
            if (b.freq === 'Weekly') curr = addDays(curr, 7);
            else if (b.freq === 'Bi-Weekly') curr = addDays(curr, 14);
            else if (b.freq === 'Monthly') { curr.setMonth(curr.getMonth() + 1); }
            else break;
        }
    });
    return rows.sort((a, b) => a.date.localeCompare(b.date));
}

// --- RENDERING ---
function render() {
    // Render Tabs (without wiping container to prevent snap)
    const tabsBox = document.getElementById('tabs-container');
    tabsBox.innerHTML = TABS.map(t => `<button class="tab-btn ${activeTab === t.id ? 'active' : ''}" onclick="activeTab='${t.id}';render()">${t.label}</button>`).join('');
    
    // Switch Visibility
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
    const currentPanel = document.getElementById(`tab-${activeTab}`);
    currentPanel.classList.remove('hidden');

    if (activeTab === 'dashboard') {
        const p = getPeriod();
        const sched = getSchedule().filter(r => r.date >= toISO(p.start) && r.date <= toISO(p.end));
        const totalBills = sched.reduce((s, r) => s + r.amount, 0);
        currentPanel.innerHTML = `
            <div class="panel" style="text-align:center;">
                <small>Welcome back, ${state.userName}</small>
                <div class="hero-value">${format(state.settings.initialBalance - totalBills)}</div>
                <small>Projected Remaining This Period</small>
            </div>`;
    }

    if (activeTab === 'schedule') {
        const p = getPeriod();
        let rows = getSchedule();
        if (scheduleMode === 'period') rows = rows.filter(r => r.date >= toISO(p.start) && r.date <= toISO(p.end));
        
        currentPanel.innerHTML = `
            <div class="flex-between" style="padding: 15px;">
                <button class="mini-btn ${scheduleMode==='period'?'active btn':''}" onclick="scheduleMode='period';render()">Period</button>
                <button class="mini-btn ${scheduleMode==='all'?'active btn':''}" onclick="scheduleMode='all';render()">Next 30 Days</button>
            </div>
            <div class="flex-between" style="padding: 0 15px 10px;">
                <button class="arrow-btn" onclick="periodOffset--;render()">❮</button>
                <strong>${toISO(p.start)} to ${toISO(p.end)}</strong>
                <button class="arrow-btn" onclick="periodOffset++;render()">❯</button>
            </div>
            ${rows.map(r => `
                <div class="panel flex-between" style="opacity:${r.paid?0.5:1}">
                    <div><small>${r.date}</small><br><strong>${r.name}</strong></div>
                    <div style="text-align:right">
                        <input type="number" style="width:60px;text-align:right;" value="${r.amount}" onchange="state.scheduleMeta['${r.id}']={...state.scheduleMeta['${r.id}'], actual:parseFloat(this.value)};save()">
                        <br><button class="mini-btn" style="margin-top:5px;background:${r.paid?'#2ecc71':'#eee'}" onclick="state.scheduleMeta['${r.id}']={...state.scheduleMeta['${r.id}'], paid:!${r.paid}};save()">${r.paid?'Paid':'Mark Paid'}</button>
                    </div>
                </div>`).join('')}`;
    }

    if (activeTab === 'bills') {
        currentPanel.innerHTML = `
            <div class="panel"><h3>Add Bill</h3>
                <div class="stack">
                    <input id="bn" placeholder="Name" class="field">
                    <input id="ba" type="number" placeholder="Amount" class="field">
                    <input id="bd" type="date" class="field">
                    <select id="bf" class="field"><option>Monthly</option><option>Weekly</option><option>Bi-Weekly</option></select>
                    <button class="btn" onclick="addBill()">Save Bill</button>
                </div>
            </div>
            ${state.bills.map(b => `<div class="panel flex-between"><div><strong>${b.name}</strong><br><small>${b.freq} - ${format(b.amount)}</small></div><button class="mini-btn" onclick="state.bills=state.bills.filter(x=>x.id!=='${b.id}');save()">Del</button></div>`).join('')}`;
    }

    if (activeTab === 'settings') {
        currentPanel.innerHTML = `
            <div class="panel"><h3>Config</h3>
                <div class="stack">
                    <label>User Name</label><input class="field" value="${state.userName}" onchange="state.userName=this.value;save()">
                    <label>Start Balance</label><input type="number" class="field" value="${state.settings.initialBalance}" onchange="state.settings.initialBalance=parseFloat(this.value);save()">
                    <label>Anchor Date</label><input type="date" class="field" value="${state.settings.anchorDate}" onchange="state.settings.anchorDate=this.value;save()">
                    <label>Days Per Period</label><input type="number" class="field" value="${state.settings.periodDays}" onchange="state.settings.periodDays=parseInt(this.value);save()">
                    <button class="btn" style="background:#e74c3c" onclick="if(confirm('Reset?')){state=defaultData;save()}">Reset All Data</button>
                </div>
            </div>`;
    }
}

function addBill() {
    const name = document.getElementById('bn').value, amt = parseFloat(document.getElementById('ba').value), dt = document.getElementById('bd').value, fr = document.getElementById('bf').value;
    if(name && amt && dt) { state.bills.push({ id: makeId('b'), name, amount: amt, date: dt, freq: fr }); save(); }
}

render();
