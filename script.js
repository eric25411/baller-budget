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
    #tabs-container { overflow-x: auto; white-space: nowrap; padding: 12px; background: #fff; border-bottom: 1px solid #eee; position: sticky; top: 0; z-index: 100; display: flex; gap: 8px; }
    #tabs-container::-webkit-scrollbar { display: none; }
    .tab-btn { padding: 10px 18px; border-radius: 20px; border: none; background: #f0f2f5; cursor: pointer; font-weight: 600; font-size: 0.85rem; color: #555; }
    .tab-btn.active { background: var(--primary); color: white; }
    .panel { background: var(--card-bg); border-radius: 16px; padding: 20px; margin: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.03); }
    .btn { background: var(--primary); color: white; border: none; padding: 14px; border-radius: 10px; font-weight: 700; width: 100%; font-size: 1rem; cursor: pointer; }
    .field { width: 100%; padding: 14px; border-radius: 10px; border: 1px solid #e1e4e8; box-sizing: border-box; margin-bottom: 10px; }
    .flex-between { display: flex; justify-content: space-between; align-items: center; }
    .mini-btn { padding: 6px 12px; border-radius: 6px; border: none; font-size: 0.8rem; cursor: pointer; font-weight: 600; }
`;
document.head.appendChild(style);

// --- APP INITIALIZATION ---
document.body.innerHTML = `<div id="header"><h1>BudgetFlow</h1><p id="user-greeting"></p></div><div id="tabs-container"></div><div id="main-content"></div>`;

const defaultData = {
    userName: 'Baller',
    settings: { initialBalance: 0, anchorDate: '2026-04-11', periodDays: 14, themeColor: '#5fa8e6' },
    bills: [], spending: [], deposits: [], scheduleMeta: {}
};

let state;
try {
    state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultData;
} catch (e) {
    state = defaultData;
}

// Ensure all keys exist to prevent crashes
state.bills = state.bills || [];
state.spending = state.spending || [];
state.deposits = state.deposits || [];
state.scheduleMeta = state.scheduleMeta || {};
state.settings = { ...defaultData.settings, ...state.settings };

let activeTab = 'dashboard';
let periodOffset = 0;

function save() { 
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); 
    render(); 
}

const format = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v || 0);

function getPeriod() {
    const anchor = new Date((state.settings.anchorDate || '2026-04-11') + 'T00:00:00');
    if (isNaN(anchor.getTime())) return { startStr: '?', endStr: '?' };
    const start = new Date(anchor);
    start.setDate(anchor.getDate() + (periodOffset * (state.settings.periodDays || 14)));
    const end = new Date(start);
    end.setDate(start.getDate() + ((state.settings.periodDays || 14) - 1));
    return { startStr: start.toISOString().split('T')[0], endStr: end.toISOString().split('T')[0] };
}

function getSchedule() {
    const rows = [];
    const limit = new Date();
    limit.setDate(limit.getDate() + 365);
    
    state.bills.forEach(b => {
        if (!b.date) return;
        let curr = new Date(b.date + 'T00:00:00');
        let safety = 0; // Infinite loop protection
        while (curr <= limit && safety < 100) {
            safety++;
            const dStr = curr.toISOString().split('T')[0];
            const key = `${b.id}_${dStr}`;
            const meta = state.scheduleMeta[key] || {};
            rows.push({ id: key, date: dStr, name: b.name, amount: meta.actual ?? b.amount, paid: !!meta.paid });
            
            if (b.freq === 'Weekly') curr.setDate(curr.getDate() + 7);
            else if (b.freq === 'Bi-Weekly') curr.setDate(curr.getDate() + 14);
            else if (b.freq === 'Monthly') curr.setMonth(curr.getMonth() + 1);
            else if (b.freq === 'Custom' && parseInt(b.customDays) > 0) curr.setDate(curr.getDate() + parseInt(b.customDays));
            else break;
        }
    });
    return rows.sort((a, b) => a.date.localeCompare(b.date));
}

function render() {
    try {
        document.documentElement.style.setProperty('--primary', state.settings.themeColor);
        document.getElementById('user-greeting').textContent = `Welcome, ${state.userName}`;
        
        const tabsBox = document.getElementById('tabs-container');
        tabsBox.innerHTML = TABS.map(t => `<button class="tab-btn ${activeTab === t.id ? 'active' : ''}" onclick="activeTab='${t.id}';render()">${t.label}</button>`).join('');

        const content = document.getElementById('main-content');
        const p = getPeriod();

        if (activeTab === 'dashboard') {
            const periodBills = state.bills.filter(b => b.date >= p.startStr && b.date <= p.endStr).reduce((s, b) => s + b.amount, 0);
            content.innerHTML = `<div class="panel" style="text-align:center"><h3>Balance</h3><div style="font-size:2rem; font-weight:800; color:var(--primary)">${format(state.settings.initialBalance - periodBills)}</div></div>`;
        } 
        else if (activeTab === 'bills') {
            content.innerHTML = `
                <div class="panel">
                    <h3>Add Bill</h3>
                    <input id="bn" placeholder="Name" class="field">
                    <input id="ba" type="number" placeholder="Amount" class="field">
                    <input id="bd" type="date" class="field">
                    <select id="bf" class="field">
                        <option value="Monthly">Monthly</option>
                        <option value="Weekly">Weekly</option>
                        <option value="Custom">Custom Days</option>
                    </select>
                    <input id="bc" type="number" placeholder="Days (if Custom)" class="field">
                    <button class="btn" onclick="addBill()">Save</button>
                </div>
                ${state.bills.map((b, i) => `<div class="panel flex-between"><div>${b.name}<br><small>${b.freq}</small></div><button class="mini-btn" style="background:var(--danger);color:white" onclick="state.bills.splice(${i},1);save()">Del</button></div>`).join('')}`;
        }
        else if (activeTab === 'schedule') {
            const rows = getSchedule().filter(r => r.date >= p.startStr && r.date <= p.endStr);
            content.innerHTML = `
                <div class="flex-between" style="padding:15px">
                    <button onclick="periodOffset--;render()">❮</button>
                    <strong>${p.startStr} to ${p.endStr}</strong>
                    <button onclick="periodOffset++;render()">❯</button>
                </div>
                ${rows.map(r => `<div class="panel flex-between"><div>${r.date}<br><strong>${r.name}</strong></div><div>${format(r.amount)}</div></div>`).join('')}`;
        }
        else if (activeTab === 'settings') {
            content.innerHTML = `
                <div class="panel">
                    <h3>Settings</h3>
                    <label>Start Balance</label><input type="number" class="field" value="${state.settings.initialBalance}" onchange="state.settings.initialBalance=parseFloat(this.value);save()">
                    <label>Anchor Date</label><input type="date" class="field" value="${state.settings.anchorDate}" onchange="state.settings.anchorDate=this.value;save()">
                    <button class="btn" style="background:var(--danger); margin-top:20px;" onclick="if(confirm('Wipe everything?')){state=defaultData;save();}">Hard Reset App</button>
                </div>`;
        }
        else {
            content.innerHTML = `<div class="panel">Tab "${activeTab}" coming soon...</div>`;
        }
    } catch (err) {
        document.getElementById('main-content').innerHTML = `
            <div class="panel" style="text-align:center; border: 2px solid var(--danger);">
                <h3 class="text-red">App Error Detected</h3>
                <p>A data conflict caused the crash. You can try to reset the app to fix it.</p>
                <button class="btn" style="background:var(--danger)" onclick="localStorage.clear(); location.reload();">Emergency Reset (Wipe Data)</button>
            </div>`;
        console.error(err);
    }
}

window.addBill = () => {
    const n = document.getElementById('bn').value, a = parseFloat(document.getElementById('ba').value), d = document.getElementById('bd').value;
    const f = document.getElementById('bf').value, c = document.getElementById('bc').value;
    if(n && a && d) { state.bills.push({ id: Math.random().toString(36).substr(2,9), name: n, amount: a, date: d, freq: f, customDays: c }); save(); }
};

render();
