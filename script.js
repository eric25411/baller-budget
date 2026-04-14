const STORAGE_KEY = 'budgetflow-v5';

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'bills', label: 'Bills' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'spending', label: 'Spending' },
  { id: 'deposits', label: 'Deposits' },
  { id: 'settings', label: 'Settings' }
];

// --- STYLES ---
const style = document.createElement('style');
style.textContent = `
    :root { --primary: #5fa8e6; --secondary: #2ecc71; --danger: #e74c3c; --bg: #f4f6f9; --card-bg: #ffffff; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); margin: 0; padding-bottom: 80px; color: #333; }
    #header { background: var(--primary); color: white; padding: 25px 15px 15px; text-align: center; }
    #header h1 { margin: 0; font-size: 1.5rem; font-weight: 800; }
    #tabs-container { overflow-x: auto; white-space: nowrap; padding: 12px; background: #fff; border-bottom: 1px solid #eee; position: sticky; top: 0; z-index: 100; display: flex; gap: 8px; }
    #tabs-container::-webkit-scrollbar { display: none; }
    .tab-btn { padding: 8px 16px; border-radius: 20px; border: none; background: #f0f2f5; cursor: pointer; font-weight: 600; font-size: 0.85rem; }
    .tab-btn.active { background: var(--primary); color: white; }
    .panel { background: var(--card-bg); border-radius: 16px; padding: 15px; margin: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.03); }
    .btn { background: var(--primary); color: white; border: none; padding: 12px; border-radius: 10px; font-weight: 700; width: 100%; cursor: pointer; margin-top: 5px; }
    .btn-outline { background: transparent; border: 1px solid var(--primary); color: var(--primary); }
    .field { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #ddd; box-sizing: border-box; margin-bottom: 8px; font-size: 1rem; }
    .flex-between { display: flex; justify-content: space-between; align-items: center; }
    .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .mini-btn { padding: 4px 8px; border-radius: 5px; border: none; font-size: 0.75rem; cursor: pointer; }
    .paid { color: var(--secondary); font-weight: bold; }
`;
document.head.appendChild(style);

// --- APP STATE ---
document.body.innerHTML = `<div id="header"><h1>BudgetFlow</h1><p id="p-label" style="margin:5px 0 0; font-size:0.8rem; opacity:0.9"></p></div><div id="tabs-container"></div><div id="main-content"></div>`;

const defaultData = {
    userName: 'Baller',
    settings: { initialBalance: 0, anchorDate: '2026-04-11', periodDays: 14, themeColor: '#5fa8e6' },
    bills: [], spending: [], deposits: [], scheduleMeta: {}
};

let state;
try {
    state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultData;
} catch (e) { state = defaultData; }

// Reliability Patch
state.bills = state.bills || [];
state.spending = state.spending || [];
state.deposits = state.deposits || [];
state.scheduleMeta = state.scheduleMeta || {};

let activeTab = 'dashboard';
let periodOffset = 0;

const save = () => { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); render(); };
const format = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v || 0);

function getPeriod() {
    const anchor = new Date((state.settings.anchorDate || '2026-04-11') + 'T00:00:00');
    const start = new Date(anchor);
    start.setDate(anchor.getDate() + (periodOffset * (state.settings.periodDays || 14)));
    const end = new Date(start);
    end.setDate(start.getDate() + ((state.settings.periodDays || 14) - 1));
    return { 
        startStr: start.toISOString().split('T')[0], 
        endStr: end.toISOString().split('T')[0],
        label: `${start.toLocaleDateString('en-US', {month:'short', day:'numeric'})} - ${end.toLocaleDateString('en-US', {month:'short', day:'numeric'})}`
    };
}

function getSchedule() {
    const rows = [];
    const limit = new Date(); limit.setFullYear(limit.getFullYear() + 1);
    
    state.bills.forEach(b => {
        let curr = new Date(b.date + 'T00:00:00');
        let safety = 0;
        while (curr <= limit && safety < 100) {
            safety++;
            const dStr = curr.toISOString().split('T')[0];
            const key = `${b.id}_${dStr}`;
            const meta = state.scheduleMeta[key] || {};
            rows.push({ id: b.id, rowKey: key, date: dStr, name: b.name, amount: b.amount, actual: meta.actual, paid: meta.paid });
            
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
        const p = getPeriod();
        document.getElementById('p-label').textContent = p.label;
        document.getElementById('tabs-container').innerHTML = TABS.map(t => `<button class="tab-btn ${activeTab === t.id ? 'active' : ''}" onclick="activeTab='${t.id}';render()">${t.label}</button>`).join('');
        
        const content = document.getElementById('main-content');
        
        if (activeTab === 'dashboard') {
            const sched = getSchedule().filter(r => r.date >= p.startStr && r.date <= p.endStr);
            const billsTotal = sched.reduce((s, r) => s + (r.actual ?? r.amount), 0);
            const spentTotal = state.spending.filter(s => s.date >= p.startStr && s.date <= p.endStr).reduce((s, x) => s + x.amount, 0);
            const depositTotal = state.deposits.filter(d => d.date >= p.startStr && d.date <= p.endStr).reduce((s, x) => s + x.amount, 0);
            
            content.innerHTML = `
                <div class="panel" style="text-align:center">
                    <small>AVAILABLE NOW</small>
                    <div style="font-size:2.2rem; font-weight:800; color:var(--primary)">${format(state.settings.initialBalance + depositTotal - billsTotal - spentTotal)}</div>
                </div>
                <div class="stat-grid" style="margin: 0 12px;">
                    <div class="panel" style="margin:0">
                        <small>Period Bills</small>
                        <div style="font-weight:700; color:var(--danger)">${format(billsTotal)}</div>
                    </div>
                    <div class="panel" style="margin:0">
                        <small>Deposits</small>
                        <div style="font-weight:700; color:var(--secondary)">${format(depositTotal)}</div>
                    </div>
                </div>
            `;
        }
        else if (activeTab === 'bills') {
            content.innerHTML = `
                <div class="panel">
                    <h3>Manage Bills</h3>
                    <input id="bn" placeholder="Bill Name" class="field">
                    <input id="ba" type="number" placeholder="Amount" class="field">
                    <input id="bd" type="date" class="field">
                    <select id="bf" class="field">
                        <option value="Monthly">Monthly</option><option value="Weekly">Weekly</option><option value="Bi-Weekly">Bi-Weekly</option>
                    </select>
                    <button class="btn" onclick="addBill()">Add Bill</button>
                </div>
                ${state.bills.map((b, i) => `
                    <div class="panel flex-between">
                        <div><strong>${b.name}</strong><br><small>${format(b.amount)} • ${b.freq}</small></div>
                        <div>
                            <button class="mini-btn btn-outline" onclick="editBill('${b.id}')">Edit</button>
                            <button class="mini-btn" style="background:#ffdede;color:var(--danger)" onclick="state.bills.splice(${i},1);save()">Del</button>
                        </div>
                    </div>`).join('')}`;
        }
        else if (activeTab === 'schedule') {
            const rows = getSchedule().filter(r => r.date >= p.startStr && r.date <= p.endStr);
            content.innerHTML = `
                <div class="flex-between" style="padding:10px 15px">
                    <button class="mini-btn" onclick="periodOffset--;render()">❮ Prev</button>
                    <strong>Schedule</strong>
                    <button class="mini-btn" onclick="periodOffset++;render()">Next ❯</button>
                </div>
                ${rows.map(r => `
                    <div class="panel flex-between" style="${r.paid ? 'opacity:0.6' : ''}">
                        <div><small>${r.date}</small><br><strong>${r.name}</strong></div>
                        <div style="text-align:right">
                            <div onclick="updateActual('${r.rowKey}', ${r.amount})" style="cursor:pointer">
                                ${r.actual ? `<span class="paid">${format(r.actual)}</span>` : format(r.amount)}
                            </div>
                            <button class="mini-btn ${r.paid ? '' : 'btn-outline'}" onclick="togglePaid('${r.rowKey}')">
                                ${r.paid ? '✓ Paid' : 'Mark Paid'}
                            </button>
                        </div>
                    </div>`).join('')}`;
        }
        else if (activeTab === 'spending' || activeTab === 'deposits') {
            const isSpend = activeTab === 'spending';
            const list = state[activeTab];
            content.innerHTML = `
                <div class="panel">
                    <h3>Add ${activeTab}</h3>
                    <input id="tx-n" placeholder="Note" class="field">
                    <input id="tx-a" type="number" placeholder="Amount" class="field">
                    <input id="tx-d" type="date" class="field" value="${new Date().toISOString().split('T')[0]}">
                    <button class="btn" onclick="addTx('${activeTab}')">Add Entry</button>
                </div>
                ${list.filter(x => x.date >= p.startStr && x.date <= p.endStr).map((x, i) => `
                    <div class="panel flex-between">
                        <div><strong>${x.name}</strong><br><small>${x.date}</small></div>
                        <div style="color:${isSpend ? 'var(--danger)' : 'var(--secondary)'}">${format(x.amount)}</div>
                    </div>`).join('')}`;
        }
        else if (activeTab === 'settings') {
            content.innerHTML = `
                <div class="panel">
                    <h3>Config</h3>
                    <label>Start Balance</label><input type="number" class="field" value="${state.settings.initialBalance}" onchange="state.settings.initialBalance=parseFloat(this.value);save()">
                    <label>Anchor Date</label><input type="date" class="field" value="${state.settings.anchorDate}" onchange="state.settings.anchorDate=this.value;save()">
                </div>
                <div class="panel">
                    <h3>Data Management</h3>
                    <button class="btn btn-outline" onclick="exportData()">Export to CSV (Excel)</button>
                    <button class="btn btn-outline" style="margin-top:10px" onclick="promptImport()">Import/Restore JSON</button>
                    <button class="btn" style="background:var(--danger); margin-top:20px;" onclick="if(confirm('Wipe everything?')){state=defaultData;save();}">Hard Reset App</button>
                </div>`;
        }
    } catch (err) {
        content.innerHTML = `<div class="panel" style="border:2px solid var(--danger)"><h3>Crash Prevented</h3><button class="btn" onclick="localStorage.clear();location.reload()">Clear Corrupted Data</button></div>`;
    }
}

// --- LOGIC FUNCTIONS ---
window.addBill = () => {
    const n = document.getElementById('bn').value, a = parseFloat(document.getElementById('ba').value), d = document.getElementById('bd').value, f = document.getElementById('bf').value;
    if(n && a && d) { state.bills.push({ id: Math.random().toString(36).substr(2,9), name: n, amount: a, date: d, freq: f }); save(); }
};

window.editBill = (id) => {
    const b = state.bills.find(x => x.id === id);
    const newAmt = prompt(`New amount for ${b.name}:`, b.amount);
    if (newAmt) { b.amount = parseFloat(newAmt); save(); }
};

window.togglePaid = (key) => {
    state.scheduleMeta[key] = state.scheduleMeta[key] || { paid: false };
    state.scheduleMeta[key].paid = !state.scheduleMeta[key].paid;
    save();
};

window.updateActual = (key, current) => {
    const val = prompt("Enter actual amount paid:", current);
    if (val) {
        state.scheduleMeta[key] = state.scheduleMeta[key] || {};
        state.scheduleMeta[key].actual = parseFloat(val);
        state.scheduleMeta[key].paid = true;
        save();
    }
};

window.addTx = (type) => {
    const n = document.getElementById('tx-n').value, a = parseFloat(document.getElementById('tx-a').value), d = document.getElementById('tx-d').value;
    if(n && a && d) { state[type].push({ name: n, amount: a, date: d }); save(); }
};

window.exportData = () => {
    let csv = "Type,Date,Name,Amount\n";
    state.bills.forEach(b => csv += `Bill,${b.date},${b.name},${b.amount}\n`);
    state.spending.forEach(s => csv += `Spend,${s.date},${s.name},${s.amount}\n`);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'budget_export.csv'; a.click();
};

window.promptImport = () => {
    const data = prompt("Paste your JSON backup here:");
    if (data) { try { state = JSON.parse(data); save(); } catch(e) { alert("Invalid data"); } }
};

render();
