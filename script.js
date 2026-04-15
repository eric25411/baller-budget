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
        font-family: -apple-system, sans-serif; 
        margin: 0; 
        transition: background 0.3s;
    }

    #main-content { padding-bottom: 30px; }
    
    .panel { 
        background: var(--panel); 
        color: var(--text);
        margin: 12px; 
        padding: 15px; 
        border-radius: 12px; 
        box-shadow: 0 4px 6px rgba(0,0,0,0.05);
        border: 1px solid var(--border);
    }

    .field { 
        width: 100%; 
        padding: 12px; 
        margin: 8px 0; 
        border-radius: 8px; 
        border: 1px solid var(--border); 
        background: var(--bg); 
        color: var(--text);
        box-sizing: border-box;
    }

    .tab-btn.active { 
        background: var(--primary); 
        color: white; 
    }
    
    /* Ensure charts and text are legible */
    canvas { max-height: 200px; margin-bottom: 10px; }
</style>

<script>
    const STORAGE_KEY = 'budgetflow-v12-6';
    const TABS = [
        { id: 'dashboard', label: 'Dashboard' },
        { id: 'bills', label: 'Bills' },
        { id: 'schedule', label: 'Schedule' },
        { id: 'spending', label: 'Spending' },
        { id: 'deposits', label: 'Deposits' },
        { id: 'goals', label: 'Goals' },
        { id: 'settings', label: 'Settings' }
    ];

    const defaultData = { userName: 'Manny', darkMode: false, settings: { initialBalance: 0, rollover: 0, anchorDate: '2026-03-29', periodDays: 14 }, bills: [], spending: [], deposits: [], scheduleMeta: {}, goals: [] };
    let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || JSON.parse(localStorage.getItem('budgetflow-v12-5')) || defaultData;

    let activeTab = 'dashboard';
    let periodOffset = 0;
    let lastTabScroll = 0;
    let lastPageScroll = 0;
    let editingBillId = null;
    let myChart = null;

    const save = () => { 
        lastPageScroll = window.scrollY;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); 
        render(); 
        window.scrollTo(0, lastPageScroll);
    };

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

    function initChart(bills, spend, income) {
        const ctx = document.getElementById('budgetChart')?.getContext('2d');
        if (!ctx) return;
        if (myChart) myChart.destroy();
        myChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Bills', 'Spending', 'Income'],
                datasets: [{
                    data: [bills, spend, income],
                    backgroundColor: ['#e74c3c', '#ff9f43', '#2ecc71'],
                    borderWidth: 0
                }]
            },
            options: {
                maintainAspectRatio: false,
                plugins: { 
                    legend: { 
                        position: 'bottom', 
                        labels: { color: state.darkMode ? '#f8fafc' : '#2d3436' } 
                    } 
                }
            }
        });
    }

    function render() {
        if (state.darkMode) document.body.classList.add('dark'); else document.body.classList.remove('dark');
        
        const tabsContainer = document.getElementById('tabs-container');
        if (tabsContainer) lastTabScroll = tabsContainer.scrollLeft;

        document.body.innerHTML = `
            <div id="header" style="background:var(--primary); color:white; padding:20px; text-align:center;">
                <h1 style="margin:0">BudgetFlow</h1>
                <div id="greeting">Welcome, ${state.userName}</div>
            </div>
            <div id="tabs-container" style="display:flex; overflow-x:auto; background:var(--panel); padding:10px; gap:10px; border-bottom:1px solid var(--border);">
                ${TABS.map(t => `<button class="tab-btn ${activeTab === t.id ? 'active' : ''}" style="padding:8px 15px; border-radius:20px; border:1px solid var(--border); background:none; color:var(--text); white-space:nowrap;" onclick="activeTab='${t.id}';render()">${t.label}</button>`).join('')}
            </div>
            <div id="main-content"></div>
        `;

        const newTabs = document.getElementById('tabs-container');
        if (newTabs) newTabs.scrollLeft = lastTabScroll;

        const content = document.getElementById('main-content');
        const p = getPeriod();
        const periodNav = `<div class="nav-bar" style="display:flex; justify-content:space-between; align-items:center; padding:15px 12px;"><button class="mini-btn" onclick="periodOffset--;render()">❮ Prev</button><strong>${p.label}</strong><button class="mini-btn" onclick="periodOffset++;render()">Next ❯</button></div>`;

        if (activeTab === 'dashboard') {
            const totalBillsToDate = getSchedule().filter(r => r.date <= p.endStr).reduce((s, r) => s + (r.actual ?? r.amount), 0);
            const totalSpentToDate = state.spending.filter(s => s.date <= p.endStr).reduce((s, x) => s + x.amount, 0);
            const totalDepositsToDate = state.deposits.filter(d => d.date <= p.endStr).reduce((s, x) => s + x.amount, 0);
            const runningBalance = (state.settings.initialBalance || 0) + (state.settings.rollover || 0) + totalDepositsToDate - totalBillsToDate - totalSpentToDate;
            
            const pBills = getSchedule().filter(r => r.date >= p.startStr && r.date <= p.endStr).reduce((s, r) => s + (r.actual ?? r.amount), 0);
            const pSpent = state.spending.filter(s => s.date >= p.startStr && s.date <= p.endStr).reduce((s, x) => s + x.amount, 0);
            const pIncome = state.deposits.filter(d => d.date >= p.startStr && d.date <= p.endStr).reduce((s, x) => s + x.amount, 0);

            content.innerHTML = periodNav + `
                <div class="panel" style="text-align:center">
                    <div class="chart-container"><canvas id="budgetChart"></canvas></div>
                    <small style="font-weight:bold; opacity:0.7">PROJECTED REMAINING</small>
                    <div style="font-size:2.2rem; font-weight:800; color:var(--primary)">${format(runningBalance)}</div>
                </div>
                <div style="display: flex; gap: 10px; margin: 0 12px 12px;">
                    <button class="field" style="flex:1; cursor:pointer;" onclick="quickAdd('spending')">− Quick Spend</button>
                    <button class="field" style="flex:1; cursor:pointer; border-color:var(--secondary); color:var(--secondary)" onclick="quickAdd('deposits')">+ Quick Income</button>
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px; margin:0 12px;">
                    <div class="panel" style="margin:0; text-align:center;"><small>Bills</small><div style="color:var(--danger)">${format(pBills)}</div></div>
                    <div class="panel" style="margin:0; text-align:center;"><small>Spend</small><div style="color:var(--danger)">${format(pSpent)}</div></div>
                    <div class="panel" style="margin:0; text-align:center;"><small>Income</small><div style="color:var(--secondary)">${format(pIncome)}</div></div>
                </div>`;
            setTimeout(() => initChart(pBills, pSpent, pIncome), 50);

        } else if (activeTab === 'settings') {
            content.innerHTML = `
                <div class="panel"><h3>User</h3><input class="field" value="${state.userName}" onchange="state.userName=this.value;save()"></div>
                <div class="panel"><h3>Preferences</h3><button class="field" onclick="state.darkMode=!state.darkMode;save()">${state.darkMode ? '☀️ Switch to Light' : '🌙 Switch to Dark'}</button></div>
                <div class="panel"><h3>Data Management</h3>
                    <button class="field" onclick="exportCSV()">Export CSV for Excel</button>
                    <button class="field" onclick="exportJSON()">Backup Data (JSON)</button>
                    <button class="field" onclick="importJSON()">Import Backup Data</button>
                </div>`;
        } else {
            // Generic placeholder for other tabs to ensure they aren't blank
            content.innerHTML = periodNav + `<div class="panel">Content for ${activeTab} loading...</div>`;
        }
    }

    window.quickAdd = (type) => { 
        const note = prompt("Description:"); 
        if (!note) return; 
        const amt = parseFloat(prompt("Amount:")); 
        if (isNaN(amt)) return; 
        state[type].push({ name: note, amount: amt, date: new Date().toISOString().split('T')[0] }); 
        save(); 
    };

    window.exportCSV = () => {
        let csv = "Type,Name,Amount,Date\n";
        state.spending.forEach(s => csv += `Spending,${s.name},${s.amount},${s.date}\n`);
        state.deposits.forEach(d => csv += `Income,${d.name},${d.amount},${d.date}\n`);
        const blob = new Blob([csv], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'budget_export.csv';
        a.click();
    };

    render();
</script>
