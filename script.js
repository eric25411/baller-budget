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
            --bg: #0f172a;
            --panel: #1e293b;
            --text: #f8fafc;
            --border: #334155;
            --input-bg: #0f172a;
        }

        body { 
            background-color: var(--bg); 
            color: var(--text); 
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            margin: 0; 
            min-height: 100vh;
            padding-bottom: 50px;
        }

        #header { background: var(--primary); color: white; padding: 25px 20px; text-align: center; }
        
        #tabs-container { 
            display: flex; 
            overflow-x: auto; 
            background: var(--panel); 
            padding: 12px; 
            gap: 10px; 
            border-bottom: 1px solid var(--border); 
            position: sticky;
            top: 0;
            z-index: 100;
            scrollbar-width: none;
        }
        #tabs-container::-webkit-scrollbar { display: none; }

        .panel { 
            background: var(--panel); 
            margin: 15px 12px; 
            padding: 20px; 
            border-radius: 16px; 
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            border: 1px solid var(--border);
        }

        .field { 
            width: 100%; 
            padding: 14px; 
            margin: 8px 0; 
            border-radius: 10px; 
            border: 1px solid var(--border); 
            background: var(--input-bg); 
            color: var(--text);
            box-sizing: border-box;
            font-size: 16px;
        }

        .tab-btn {
            padding: 8px 18px; 
            border-radius: 20px; 
            border: 1px solid var(--border); 
            background: var(--panel); 
            color: var(--text); 
            white-space: nowrap;
            font-weight: 600;
        }

        .tab-btn.active { background: var(--primary); color: white; border-color: var(--primary); }

        .btn {
            width: 100%;
            padding: 15px;
            border-radius: 12px;
            border: none;
            font-weight: bold;
            font-size: 16px;
            margin-top: 10px;
            cursor: pointer;
        }

        .item-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 15px 0;
            border-bottom: 1px solid var(--border);
        }

        .action-link { color: var(--primary); font-size: 14px; font-weight: 600; cursor: pointer; }
    </style>
</head>
<body>

<div id="app-root"></div>

<script>
    const STORAGE_KEY = 'budgetflow_data_v2';
    
    let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {
        userName: 'Manny',
        darkMode: true,
        bills: [],
        spending: [],
        deposits: [],
        settings: { initialBalance: 56.85 }
    };

    let activeTab = 'dashboard';
    let editingIndex = null;

    function save() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        render();
    }

    function render() {
        const root = document.getElementById('app-root');
        root.innerHTML = `
            <div id="header">
                <h1 style="margin:0; font-size: 24px;">BudgetFlow</h1>
                <div style="opacity:0.9; margin-top:4px;">Welcome, ${state.userName}</div>
            </div>
            <div id="tabs-container">
                ${['Dashboard', 'Bills', 'Spending', 'Deposits', 'Settings'].map(t => `
                    <button class="tab-btn ${activeTab === t.toLowerCase() ? 'active' : ''}" 
                            onclick="activeTab='${t.toLowerCase()}'; editingIndex=null; render()">
                        ${t}
                    </button>
                `).join('')}
            </div>
            <div id="content">${renderTabContent()}</div>
        `;
    }

    function renderTabContent() {
        if (activeTab === 'dashboard') {
            const totalSpent = state.spending.reduce((acc, s) => acc + s.amount, 0);
            const totalIncome = state.deposits.reduce((acc, d) => acc + d.amount, 0);
            const balance = state.settings.initialBalance + totalIncome - totalSpent;

            return `
                <div class="panel" style="text-align:center">
                    <div style="font-size:14px; opacity:0.6; text-transform:uppercase; letter-spacing:1px;">Current Balance</div>
                    <div style="font-size:36px; font-weight:800; color:var(--primary); margin:10px 0;">$${balance.toFixed(2)}</div>
                </div>
                <div class="panel">
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; text-align:center;">
                        <div><small>Spent</small><br><strong>$${totalSpent.toFixed(2)}</strong></div>
                        <div><small>Income</small><br><strong>$${totalIncome.toFixed(2)}</strong></div>
                    </div>
                </div>
            `;
        }

        if (activeTab === 'bills') {
            const billToEdit = editingIndex !== null ? state.bills[editingIndex] : null;
            return `
                <div class="panel">
                    <h3>${billToEdit ? 'Edit Bill' : 'Add Recurring Bill'}</h3>
                    <input id="bName" class="field" placeholder="Name" value="${billToEdit ? billToEdit.name : ''}">
                    <input id="bAmount" type="number" class="field" placeholder="Amount" value="${billToEdit ? billToEdit.amount : ''}">
                    <select id="bFreq" class="field">
                        <option ${billToEdit?.freq === 'Monthly' ? 'selected' : ''}>Monthly</option>
                        <option ${billToEdit?.freq === 'Weekly' ? 'selected' : ''}>Weekly</option>
                        <option ${billToEdit?.freq === 'Bi-Weekly' ? 'selected' : ''}>Bi-Weekly</option>
                    </select>
                    <button class="btn" style="background:var(--primary); color:white" onclick="saveBill()">
                        ${billToEdit ? 'Update Bill' : 'Add Bill'}
                    </button>
                </div>
                <div class="panel">
                    ${state.bills.map((b, i) => `
                        <div class="item-row">
                            <div><strong>${b.name}</strong><br><small>${b.freq}</small></div>
                            <div style="text-align:right">
                                <strong>$${b.amount.toFixed(2)}</strong><br>
                                <span class="action-link" onclick="editingIndex=${i};render()">Edit</span> | 
                                <span class="action-link" style="color:var(--danger)" onclick="deleteItem('bills', ${i})">Delete</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        if (activeTab === 'spending' || activeTab === 'deposits') {
            const type = activeTab;
            return `
                <div class="panel">
                    <h3>Add ${type.charAt(0).toUpperCase() + type.slice(1)}</h3>
                    <input id="transName" class="field" placeholder="Description">
                    <input id="transAmount" type="number" class="field" placeholder="Amount">
                    <button class="btn" style="background:var(--primary); color:white" onclick="addTransaction('${type}')">Save Entry</button>
                </div>
                <div class="panel">
                    ${state[type].map((t, i) => `
                        <div class="item-row">
                            <div><strong>${t.name}</strong></div>
                            <div style="text-align:right">
                                <strong>$${t.amount.toFixed(2)}</strong><br>
                                <span class="action-link" style="color:var(--danger)" onclick="deleteItem('${type}', ${i})">Delete</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        if (activeTab === 'settings') {
            return `
                <div class="panel">
                    <h3>Settings</h3>
                    <label><small>Starting Balance</small></label>
                    <input type="number" class="field" value="${state.settings.initialBalance}" onchange="state.settings.initialBalance=parseFloat(this.value);save()">
                    <button class="btn" style="background:var(--border); color:var(--text); margin-top:20px;" onclick="clearData()">Reset All Data</button>
                </div>
            `;
        }
    }

    // --- Logic ---
    window.saveBill = () => {
        const name = document.getElementById('bName').value;
        const amount = parseFloat(document.getElementById('bAmount').value);
        const freq = document.getElementById('bFreq').value;
        if (!name || isNaN(amount)) return;

        if (editingIndex !== null) {
            state.bills[editingIndex] = { name, amount, freq };
            editingIndex = null;
        } else {
            state.bills.push({ name, amount, freq });
        }
        save();
    };

    window.addTransaction = (type) => {
        const name = document.getElementById('transName').value;
        const amount = parseFloat(document.getElementById('transAmount').value);
        if (!name || isNaN(amount)) return;
        state[type].push({ name, amount, date: new Date().toISOString() });
        save();
    };

    window.deleteItem = (type, index) => {
        if(confirm("Delete this entry?")) {
            state[type].splice(index, 1);
            save();
        }
    };

    window.clearData = () => {
        if(confirm("Warning: This will wipe all your entries. Proceed?")) {
            localStorage.removeItem(STORAGE_KEY);
            location.reload();
        }
    }

    document.addEventListener('DOMContentLoaded', render);
</script>
</body>
</html>
