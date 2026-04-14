const STORAGE_KEY = 'budgetflow-v12';

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'bills', label: 'Bills' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'spending', label: 'Spending' },
  { id: 'deposits', label: 'Deposits' },
  { id: 'goals', label: 'Goals' },
  { id: 'settings', label: 'Settings' }
];

// --- STYLES (Light & Carolina Dark Mode) ---
const style = document.createElement('style');
style.textContent = `
    :root { 
        --primary: #7BAFD4; /* Carolina Blue */
        --secondary: #2ecc71; 
        --danger: #e74c3c; 
        --bg: #f4f6f9; 
        --card-bg: #ffffff; 
        --text: #333;
        --border: #eee;
    }

    body.dark {
        --bg: #12171e; /* Deep Navy Charcoal */
        --card-bg: #1e252e; 
        --text: #e0e0e0;
        --border: #2d3743;
    }

    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); margin: 0; padding-bottom: 80px; color: var(--text); transition: background 0.3s; }
    #header { background: var(--primary); color: white; padding: 20px 15px 10px; text-align: center; }
    #header h1 { margin: 0; font-size: 1.5rem; font-weight: 800; }
    #greeting { font-size: 0.9rem; margin-top: 5px; opacity: 0.9; }
    
    #tabs-container { overflow-x: auto; white-space: nowrap; padding: 12px; background: var(--card-bg); border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 100; display: flex; gap: 8px; }
    #tabs-container::-webkit-scrollbar { display: none; }
    
    .tab-btn { padding: 8px 16px; border-radius: 20px; border: none; background: var(--border); color: var(--text); cursor: pointer; font-weight: 600; font-size: 0.85rem; flex-shrink: 0; }
    .tab-btn.active { background: var(--primary); color: white; }
    
    .nav-bar { display: flex; justify-content: space-between; align-items: center; padding: 10px 15px; background: var(--card-bg); margin-bottom: 5px; border-bottom: 1px solid var(--border); }
    .panel { background: var(--card-bg); border-radius: 16px; padding: 15px; margin: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); border: 1px solid var(--border); }
    
    .btn { background: var(--primary); color: white; border: none; padding: 12px; border-radius: 10px; font-weight: 700; width: 100%; cursor: pointer; margin-top: 5px; }
    .btn-outline { background: transparent; border: 1px solid var(--primary); color: var(--primary); }
    
    .field { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--text); box-sizing: border-box; margin-bottom: 8px; font-size: 1rem; }
    .flex-between { display: flex; justify-content: space-between; align-items: center; }
    .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    
    .mini-btn { padding: 6px 12px; border-radius: 8px; border: none; font-size: 0.8rem; cursor: pointer; background: var(--border); color: var(--text); font-weight: 600; }
    .progress-bg { background: var(--border); border-radius: 10px; height: 10px; width: 100%; margin: 10px 0; overflow: hidden; }
    .progress-fill { background: var(--secondary); height: 100%; transition: width 0.3s; }
    
    .paid { color: var(--secondary); font-weight: bold; }
    .clickable-amount { cursor: pointer; transition: opacity 0.2s; }
    .clickable-amount:hover { opacity: 0.7; }
`;
document.head.appendChild(style);

// --- APP INITIALIZATION ---
const defaultData = {
    userName: 'Baller',
    darkMode: false,
    settings: { initialBalance: 0, rollover: 0, anchorDate: '2026-03-29', periodDays: 14, themeColor: '#7BAFD4' },
    bills: [], spending: [], deposits: [], scheduleMeta: {}, goals: []
};

let state;
try {
    state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || 
            JSON.parse(localStorage.getItem('budgetflow-v11')) || 
            JSON.parse(localStorage.getItem('budgetflow-v10')) || 
            defaultData;
} catch (e) { state = defaultData; }

state.userName = state.userName || 'Baller';
state.darkMode = !!state.darkMode;
state.goals = state.goals || [];
state.settings = { ...defaultData.settings, ...state.settings };

if (state.darkMode) document.body.classList.add('dark');

let activeTab = 'dashboard';
let periodOffset = 0;
let lastTabScroll = 0; // The "Memory" variable

const save = () => { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); render(); };
const format = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v || 0);

function getPeriod() {
    const anchor = new Date((state.settings.anchorDate || '2026-03-29') + 'T00:00:00');
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

// Fixed Render with Scroll Memory
function render() {
    // Capture current scroll before wiping UI
    const container = document.getElementById('tabs-container');
    if (container) lastTabScroll = container.scrollLeft;

    document.body.innerHTML = `
        <div id="header">
            <h1>BudgetFlow</h1>
            <div id="greeting">Welcome, ${state.userName}</div>
        </div>
        <div id="tabs-container">
            ${TABS.map(t => `<button class="tab-btn ${activeTab === t.id ? 'active' : ''}" onclick="activeTab='${t.id}';render()">${t.label}</button>`).join('')}
        </div>
        <div id="main-content"></div>
    `;

    // Restore scroll immediately
    const newContainer = document.getElementById('tabs-container');
    if (newContainer) newContainer.scrollLeft = lastTabScroll;

    const content = document.getElementById('main-content');
    const p = getPeriod();
    const periodNav = `
        <div class="nav-bar">
            <button class="mini-btn" onclick="periodOffset--;render()">❮ Prev</button>
            <strong style="font-size:0.9rem; color:var(--primary)">${p.label}</strong>
            <button class="mini-btn" onclick="periodOffset++;render()">Next ❯</button>
        </div>`;

    if (activeTab === 'dashboard') {
        const sched = getSchedule().filter(r => r.date >= p.startStr && r.date <= p.endStr);
        const billsTotal = sched.reduce((s, r) => s + (r.actual ?? r.amount), 0);
        const spentTotal = state.spending.filter(s => s.date >= p.startStr && s.date <= p.endStr).reduce((s, x) => s + x.amount, 0);
        const depositTotal = state.deposits.filter(d => d.date >= p.startStr && d.date <= p.endStr).reduce((s, x) => s + x.amount, 0);
        const currentBalance = state.settings.initialBalance + state.settings.rollover;
        
        content.innerHTML = periodNav + `
            <div class="panel" style="text-align:center">
                <small style="opacity:0.6; font-weight:bold">PROJECTED REMAINING</small>
                <div style="font-size:2.2rem; font-weight:800; color:var(--primary)">${format(currentBalance + depositTotal - billsTotal - spentTotal)}</div>
            </div>
            <div style="display: flex; gap: 10px; margin: 0 12px 12px;">
                <button class="btn btn-outline" style="margin:0; flex:1;" onclick="quickAdd('spending')">− Quick Spend</button>
                <button class="btn btn-outline" style="margin:0; flex:1; border-color: var(--secondary); color: var(--secondary)" onclick="quickAdd('deposits')">+ Quick Income</button>
            </div>
            <div class="stat-grid" style="margin: 0 12px;">
                <div class="panel" style="margin:0"><small>Period Bills</small><div style="font-weight:700; color:var(--danger)">${format(billsTotal)}</div></div>
                <div class="panel" style="margin:0"><small>Period Income</small><div style="font-weight:700; color:var(--secondary)">${format(depositTotal)}</div></div>
            </div>`;
    }
    else if (activeTab === 'goals') {
        content.innerHTML = `
            <div class="panel">
                <h3>New Saving Goal</h3>
                <input id="gn" placeholder="Goal Name" class="field">
                <input id="gt" type="number" placeholder="Target Amount" class="field">
                <button class="btn" onclick="addGoal()">Create Goal</button>
            </div>
            ${state.goals.map((g, i) => {
                const percent = Math.min(Math.round((g.current / g.target) * 100), 100);
                return `
                <div class="panel">
                    <div class="flex-between"><strong>${g.name}</strong><button class="mini-btn" style="color:var(--danger)" onclick="state.goals.splice(${i},1);save()">✕</button></div>
                    <div class="progress-bg"><div class="progress-fill" style="width:${percent}%"></div></div>
                    <div class="flex-between"><small>${format(g.current)} / ${format(g.target)}</small><small>${percent}%</small></div>
                    <button class="btn btn-outline" style="margin-top:10px" onclick="fundGoal('${g.id}')">+ Add Funds</button>
                </div>`;
            }).join('')}`;
    }
    else if (activeTab === 'bills') {
        content.innerHTML = `
            <div class="panel">
                <h3>New Recurring Bill</h3>
                <input id="bn" placeholder="Bill Name" class="field">
                <input id="ba" type="number" placeholder="Amount" class="field">
                <input id="bd" type="date" class="field">
                <select id="bf" class="field" onchange="document.getElementById('cw').style.display = this.value === 'Custom' ? 'block' : 'none'">
                    <option value="Monthly">Monthly</option><option value="Weekly">Weekly</option><option value="Bi-Weekly">Bi-Weekly</option><option value="Custom">Custom Days</option>
                </select>
                <div id="cw" style="display:none"><input id="bc" type="number" placeholder="Every X Days" class="field"></div>
                <button class="btn" onclick="addBill()">Add Bill</button>
            </div>
            ${state.bills.map((b, i) => `
                <div class="panel flex-between">
                    <div><strong>${b.name}</strong><br><small>${format(b.amount)} • ${b.freq}</small></div>
                    <div style="display:flex; gap:5px">
                        <button class="mini-btn btn-outline" onclick="editBill('${b.id}')">Edit</button>
                        <button class="mini-btn" style="color:var(--danger)" onclick="state.bills.splice(${i},1);save()">✕</button>
                    </div>
                </div>`).join('')}`;
    }
    else if (activeTab === 'schedule' || activeTab === 'spending' || activeTab === 'deposits') {
        const isSpend = activeTab === 'spending';
        const isSched = activeTab === 'schedule';
        const list = isSched ? getSchedule().filter(r => r.date >= p.startStr && r.date <= p.endStr) : state[activeTab].filter(x => x.date >= p.startStr && x.date <= p.endStr);
        
        content.innerHTML = periodNav + (isSched ? '' : `
            <div class="panel">
                <h3>Add ${activeTab}</h3>
                <input id="tx-n" placeholder="Note" class="field">
                <input id="tx-a" type="number" placeholder="Amount" class="field">
                <input id="tx-d" type="date" class="field" value="${p.startStr}">
                <button class="btn" onclick="addTx('${activeTab}')">Save Entry</button>
            </div>`) + 
            list.map((x, i) => {
                let amountDisplay = isSched ? 
                    `<div onclick="updateActual('${x.rowKey}', ${x.amount})" class="clickable-amount" style="font-weight:bold;">${x.actual ? `<span class="paid">${format(x.actual)}</span>` : format(x.amount)}</div>` :
                    `<div style="font-weight:bold; color:${isSpend ? 'var(--danger)' : 'var(--secondary)'}">${format(x.amount)}</div>`;

                return `
                <div class="panel flex-between" style="${isSched && x.paid ? 'opacity:0.6' : ''}">
                    <div><strong>${x.name}</strong><br><small>${x.date}</small></div>
                    <div style="text-align:right">
                        ${amountDisplay}
                        ${isSched ? `<button class="mini-btn ${x.paid ? '' : 'btn-outline'}" style="margin-top:5px" onclick="togglePaid('${x.rowKey}')">${x.paid ? '✓ Paid' : 'Mark Paid'}</button>` : ''}
                    </div>
                </div>`;
            }).join('');
    }
    else if (activeTab === 'settings') {
        content.innerHTML = `
            <div class="panel flex-between">
                <h3>Appearance</h3>
                <button class="mini-btn ${state.darkMode ? 'active' : ''}" onclick="toggleDarkMode()">
                    ${state.darkMode ? '🌙 Dark' : '☀️ Light'}
                </button>
            </div>
            <div class="panel">
                <h3>User Profile</h3>
                <label><small>Your Name</small></label>
                <input type="text" class="field" value="${state.userName}" onchange="state.userName=this.value;save()">
            </div>
            <div class="panel">
                <h3>Pay Cycle Config</h3>
                <label><small>Starting Bank Balance</small></label>
                <input type="number" class="field" value="${state.settings.initialBalance}" onchange="state.settings.initialBalance=parseFloat(this.value);save()">
                <label><small>Manual Rollover Amount</small></label>
                <input type="number" class="field" value="${state.settings.rollover}" onchange="state.settings.rollover=parseFloat(this.value);save()">
                <label><small>Next Payday (Anchor Date)</small></label>
                <input type="date" class="field" value="${state.settings.anchorDate}" onchange="state.settings.anchorDate=this.value;save()">
            </div>
            <div class="panel">
                <h3>Data Management</h3>
                <button class="btn btn-outline" onclick="exportExcel()">Export CSV for Excel</button>
                <button class="btn btn-outline" style="margin-top:10px" onclick="exportJSON()">Backup Data (JSON)</button>
                <button class="btn btn-outline" style="margin-top:10px" onclick="importJSON()">Import Backup Data</button>
                <button class="btn" style="background:var(--danger); margin-top:20px;" onclick="if(confirm('Wipe all data?')){state=defaultData;save();}">Reset All</button>
            </div>`;
    }
}

// --- LOGIC FUNCTIONS ---
window.toggleDarkMode = () => {
    state.darkMode = !state.darkMode;
    document.body.classList.toggle('dark', state.darkMode);
    save();
};

window.quickAdd = (type) => {
    const label = type === 'spending' ? 'Expense' : 'Income';
    const note = prompt(`Enter ${label} description:`);
    if (!note) return;
    const amount = parseFloat(prompt(`Enter ${label} amount:`));
    if (isNaN(amount) || amount <= 0) return;
    const today = new Date().toISOString().split('T')[0];
    state[type].push({ name: note, amount: amount, date: today });
    save();
};

window.addGoal = () => {
    const n = document.getElementById('gn').value, t = parseFloat(document.getElementById('gt').value);
    if(n && t) { state.goals.push({ id: Math.random().toString(36).substr(2,9), name: n, target: t, current: 0 }); save(); }
};

window.fundGoal = (id) => {
    const amt = parseFloat(prompt("Contribution amount?"));
    if (!amt || isNaN(amt)) return;
    const g = state.goals.find(x => x.id === id);
    g.current += amt;
    state.spending.push({ name: `Goal Fund: ${g.name}`, amount: amt, date: new Date().toISOString().split('T')[0] });
    save();
};

window.addBill = () => {
    const n = document.getElementById('bn').value, a = parseFloat(document.getElementById('ba').value), d = document.getElementById('bd').value, f = document.getElementById('bf').value, c = document.getElementById('bc')?.value || 0;
    if(n && a && d) { state.bills.push({ id: Math.random().toString(36).substr(2,9), name: n, amount: a, date: d, freq: f, customDays: c }); save(); }
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
    const val = prompt("Actual amount paid:", current);
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

window.exportExcel = () => {
    let csv = "Type,Date,Name,Amount\n";
    state.bills.forEach(b => csv += `Bill,${b.date},"${b.name}",${b.amount}\n`);
    state.spending.forEach(s => csv += `Spend,${s.date},"${s.name}",${s.amount}\n`);
    state.deposits.forEach(d => csv += `Deposit,${d.date},"${d.name}",${d.amount}\n`);
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'budget_export.csv'; a.click();
};

window.exportJSON = () => {
    const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'budget_backup.json'; a.click();
};

window.importJSON = () => {
    const json = prompt("Paste JSON backup:");
    if (json) { try { state = JSON.parse(json); save(); } catch(e) { alert("Invalid data"); } }
};

render();
