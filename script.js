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
        transition: background 0.2s, color 0.2s;
        min-height: 100vh;
    }

    /* Force visibility of the main container */
    #main-content { 
        display: block !important; 
        min-height: 200px;
        padding-bottom: 50px;
    }
    
    .panel { 
        display: block;
        background: var(--panel); 
        color: var(--text);
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
        font-size: 16px; /* Prevents iOS zoom on focus */
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
</style>

<div id="app-root"></div>

<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
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

    // Persistence & State Management
    let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {
        userName: 'Manny',
        darkMode: false,
        settings: { initialBalance: 56.85, rollover: 0, anchorDate: '2026-02-05', periodDays: 14 },
        bills: [],
        spending: [],
        deposits: [],
        scheduleMeta: {},
        goals: []
    };

    let activeTab = 'dashboard';
    let periodOffset = 0;
    let myChart = null;

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
        if (state.darkMode) document.body.classList.add('dark'); else document.body.classList.remove('dark');

        const p = getPeriod();

        root.innerHTML = `
            <div id="header" style="background:var(--primary); color:white; padding:25px 20px; text-align:center;">
                <h1 style="margin:0; font-size: 24px;">BudgetFlow</h1>
                <div style="opacity:0.9; margin-top:4px;">Welcome, ${state.userName}</div>
            </div>
            <div id="tabs-container" style="display:flex; overflow-x:auto; background:var(--panel); padding:12px; gap:10px; border-bottom:1px solid var(--border); scrollbar-width: none;">
                ${TABS.map(t => `<button class="tab-btn ${activeTab === t.id ? 'active' : ''}" onclick="activeTab='${t.id}';render()">${t.label}</button>`).join('')}
            </div>
            <div id="main-content">
                ${renderContent(activeTab, p)}
            </div>
        `;

        if (activeTab === 'dashboard') {
            setTimeout(initChart, 50);
        }
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
                </div>
                <div class="panel">
                    <h3 style="margin-top:0">Quick Actions</h3>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                        <button class="field" style="margin:0; background:var(--danger); color:white; border:none;" onclick="quickAdd('spending')">− Spend</button>
                        <button class="field" style="margin:0; background:var(--secondary); color:white; border:none;" onclick="quickAdd('deposits')">+ Income</button>
                    </div>
                </div>`;
        }

        if (tab === 'settings') {
            return `
                <div class="panel">
                    <h3 style="margin-top:0">User Profile</h3>
                    <label><small>Display Name</small></label>
                    <input class="field" value="${state.userName}" onchange="state.userName=this.value;save()">
                </div>
                <div class="panel">
                    <h3>Pay Cycle</h3>
                    <label><small>Starting Balance</small></label>
                    <input type="number" class="field" value="${state.settings.initialBalance}" onchange="state.settings.initialBalance=parseFloat(this.value);save()">
                    <label><small>Anchor Date</small></label>
                    <input type="date" class="field" value="${state.settings.anchorDate}" onchange="state.settings.anchorDate=this.value;save()">
                </div>
                <div class="panel">
                    <h3>Appearance</h3>
                    <button class="field" onclick="state.darkMode=!state.darkMode;save()">
                        ${state.darkMode ? '☀️ Switch to Light Mode' : '🌙 Switch to Dark Mode'}
                    </button>
                </div>
                <div class="panel" style="border-color:var(--primary)">
                    <h3>Data Backup</h3>
                    <button class="field" style="border-color:var(--primary); color:var(--primary)" onclick="exportJSON()">Backup JSON</button>
                </div>`;
        }

        return nav + `<div class="panel"><p>Section <b>${tab}</b> is ready for data entry.</p></div>`;
    }

    function initChart() {
        const ctx = document.getElementById('budgetChart')?.getContext('2d');
        if (!ctx) return;
        if (myChart) myChart.destroy();
        myChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Bills', 'Spending', 'Income'],
                datasets: [{
                    data: [300, 150, 1200], // Example data
                    backgroundColor: ['#ff7675', '#fdcb6e', '#55efc4'],
                    hoverOffset: 4,
                    borderWidth: 0
                }]
            },
            options: { maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    }

    window.quickAdd = (type) => {
        const val = prompt(`Enter ${type} amount:`);
        if (val) {
            state[type].push({ amount: parseFloat(val), date: new Date().toISOString().split('T')[0], name: 'Quick Entry' });
            save();
        }
    };

    window.exportJSON = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "budgetflow_backup.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };

    // Boot app
    document.addEventListener('DOMContentLoaded', render);
    // Fallback if DOMContentLoaded already fired
    if (document.readyState === "complete" || document.readyState === "interactive") {
        render();
    }
</script>
