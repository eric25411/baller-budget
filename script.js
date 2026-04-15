<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>BudgetFlow Pro</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        :root {
            --primary: #74b9ff;
            --secondary: #55efc4;
            --danger: #ff7675;
            --bg: #f1f2f6;
            --panel: #ffffff;
            --text: #2d3436;
            --border: #dfe6e9;
        }

        body.dark {
            --bg: #0f172a;
            --panel: #1e293b;
            --text: #f8fafc;
            --border: #334155;
        }

        body { 
            background-color: var(--bg); 
            color: var(--text); 
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            margin: 0; 
            transition: background 0.2s;
            min-height: 100vh;
        }

        #main-content { padding-bottom: 50px; }
        
        .panel { 
            background: var(--panel); 
            margin: 15px 12px; 
            padding: 20px; 
            border-radius: 16px; 
            box-shadow: 0 4px 12px rgba(0,0,0,0.08);
            border: 1px solid var(--border);
        }

        .field { 
            width: 100%; 
            padding: 14px; 
            margin: 10px 0; 
            border-radius: 10px; 
            border: 1px solid var(--border); 
            background: var(--bg); 
            color: var(--text);
            box-sizing: border-box;
            font-size: 16px;
        }

        .tab-btn {
            padding: 10px 18px; 
            border-radius: 25px; 
            border: 1px solid var(--border); 
            background: var(--panel); 
            color: var(--text); 
            white-space: nowrap;
            font-weight: 600;
            cursor: pointer;
        }

        .tab-btn.active { 
            background: var(--primary); 
            color: white; 
            border-color: var(--primary);
        }

        .btn {
            width: 100%;
            padding: 15px;
            border-radius: 12px;
            border: none;
            font-weight: bold;
            font-size: 16px;
            cursor: pointer;
        }

        .item-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 0;
            border-bottom: 1px solid var(--border);
        }
    </style>
</head>
<body>

<div id="app-root"></div>

<script>
    const STORAGE_KEY = 'budgetflow-v12-7';
    const TABS = [
        { id: 'dashboard', label: 'Dashboard' },
        { id: 'bills', label: 'Bills' },
        { id: 'schedule', label: 'Schedule' },
        { id: 'spending', label: 'Spending' },
        { id: 'deposits', label: 'Deposits' },
        { id: 'goals', label: 'Goals' },
        { id: 'settings', label: 'Settings' }
    ];

    let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {
        userName: 'Manny',
        darkMode: false,
        settings: { initialBalance: 56.85, rollover: 0, anchorDate: '2026-03-05', periodDays: 14 },
        bills: [],
        spending: [],
        deposits: [],
        goals: []
    };

    let activeTab = 'dashboard';
    let periodOffset = 0;
    let myChart = null;
    let editingIndex = null;

    const save = () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        render();
    };

    const format = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v || 0);

    function getPeriod() {
        const anchor = new Date(state.settings.anchorDate + 'T00:00:00');
        const start = new Date(anchor);
        start.setDate(anchor.getDate() + (periodOffset * state.settings.periodDays));
        const end = new Date(start);
        end.setDate(start.getDate() + (state.settings.periodDays - 1));
        return {
            startStr: start.toISOString().split('T')[0],
            endStr: end.toISOString().split('T')[0],
            label: `${start.toLocaleDateString('en-US', {month:'short', day:'numeric'})} - ${end.toLocaleDateString('en-US', {month:'short', day:'numeric'})}`
        };
    }

    function render() {
        const root = document.getElementById('app-root');
        document.body.classList.toggle('dark', state.darkMode);
        const p = getPeriod();

        root.innerHTML = `
            <div id="header" style="background:var(--primary); color:white; padding:25px 20px; text-align:center;">
                <h1 style="margin:0; font-size: 24px;">BudgetFlow</h1>
                <div style="opacity:0.9; margin-top:4px;">Welcome back, ${state.userName}</div>
            </div>
            <div id="tabs-container" style="display:flex; overflow-x:auto; background:var(--panel); padding:12px; gap:10px; border-bottom:1px solid var(--border); scrollbar-width: none;">
                ${TABS.map(t => `<button class="tab-btn ${activeTab === t.id ? 'active' : ''}" onclick="activeTab='${t.id}'; editingIndex=null; render()">${t.label}</button>`).join('')}
            </div>
            <div id="main-content">
                ${renderContent(activeTab, p)}
            </div>
        `;

        if (activeTab === 'dashboard') setTimeout(initChart, 50);
    }

    function renderContent(tab, p) {
        const nav = `<div style="display:flex; justify-content:space-between; align-items:center; padding:15px 12px;">
            <button class="tab-btn" style="padding:5px 12px" onclick="periodOffset--;render()">❮ Prev</button>
            <strong style="font-size:1.1rem">${p.label}</strong>
            <button class="tab-btn" style="padding:5px 12px" onclick="periodOffset++;render()">Next ❯</button>
        </div>`;

        if (tab === 'dashboard') {
            return nav + `
                <div class="panel" style="text-align:center">
                    <div style="height:200px; margin-bottom:15px;"><canvas id="budgetChart"></canvas></div>
                    <small style="text-transform:uppercase; letter-spacing:1px; font-weight:700; opacity:0.6">Projected Remaining</small>
                    <div style="font-size:2.5rem; font-weight:800; color:var(--primary); margin:5px 0;">${format(state.settings.initialBalance)}</div>
                </div>`;
        }

        if (tab === 'bills') {
            const billToEdit = editingIndex !== null ? state.bills[editingIndex] : null;
            return `
                <div class="panel">
                    <h3>${billToEdit ? 'Edit Bill' : 'Add Bill'}</h3>
                    <input id="bName" class="field" placeholder="Name" value="${billToEdit ? billToEdit.name : ''}">
                    <input id="bAmount" type="number" class="field" placeholder="Amount" value="${billToEdit ? billToEdit.amount : ''}">
                    <select id="bFreq" class="field">
                        <option ${billToEdit?.freq === 'Monthly' ? 'selected' : ''}>Monthly</option>
                        <option ${billToEdit?.freq === 'Bi-Weekly' ? 'selected' : ''}>Bi-Weekly</option>
                    </select>
                    <button class="btn" style="background:var(--primary); color:white" onclick="handleSaveBill()">
                        ${billToEdit ? 'Update Bill' : 'Add Bill'}
                    </button>
                    ${billToEdit ? `<button class="btn" style="background:transparent; color:var(--text)" onclick="editingIndex=null;render()">Cancel</button>` : ''}
                </div>
                <div class="panel">
                    ${state.bills.map((b, i) => `
                        <div class="item-row">
                            <div><strong>${b.name}</strong><br><small>${b.freq}</small></div>
                            <div style="text-align:right">
                                <div>${format(b.amount)}</div>
                                <small style="color:var(--primary); cursor:pointer" onclick="startEdit(${i})">Edit</small> | 
                                <small style="color:var(--danger); cursor:pointer" onclick="deleteItem('bills', ${i})">Delete</small>
                            </div>
                        </div>
                    `).join('')}
                </div>`;
        }

        if (tab === 'settings') {
            return `
                <div class="panel">
                    <h3>User Profile</h3>
                    <input class="field" value="${state.userName}" onchange="state.userName=this.value;save()">
                </div>
                <div class="panel">
                    <h3>Finance Config</h3>
                    <label><small>Starting Balance</small></label>
                    <input type="number" class="field" value="${state.settings.initialBalance}" onchange="state.settings.initialBalance=parseFloat(this.value);save()">
                    <label><small>Anchor Date</small></label>
                    <input type="date" class="field" value="${state.settings.anchorDate}" onchange="state.settings.anchorDate=this.value;save()">
                </div>
                <div class="panel">
                    <h3>Appearance</h3>
                    <button class="btn" style="background:var(--border); color:var(--text)" onclick="state.darkMode=!state.darkMode;save()">
                        ${state.darkMode ? '☀️ Switch to Light Mode' : '🌙 Switch to Dark Mode'}
                    </button>
                </div>`;
        }

        return nav + `<div class="panel"><p>Section <b>${tab}</b> logic preserved for implementation.</p></div>`;
    }

    // --- Actions ---
    window.startEdit = (index) => {
        editingIndex = index;
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    window.handleSaveBill = () => {
        const name = document.getElementById('bName').value;
        const amount = parseFloat(document.getElementById('bAmount').value);
        const freq = document.getElementById('bFreq').value;
        if (!name || isNaN(amount)) return;

        const bill = { name, amount, freq };
        if (editingIndex !== null) {
            state.bills[editingIndex] = bill;
            editingIndex = null;
        } else {
            state.bills.push(bill);
        }
        save();
    };

    window.deleteItem = (type, index) => {
        if(confirm("Delete this?")) { state[type].splice(index, 1); save(); }
    };

    function initChart() {
        const ctx = document.getElementById('budgetChart')?.getContext('2d');
        if (!ctx) return;
        if (myChart) myChart.destroy();
        myChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Bills', 'Spending', 'Remaining'],
                datasets: [{
                    data: [300, 150, 500],
                    backgroundColor: ['#ff7675', '#fdcb6e', '#55efc4'],
                    borderWidth: 0
                }]
            },
            options: { maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    }

    document.addEventListener('DOMContentLoaded', render);
</script>
</body>
</html>
