const STORAGE_KEY = 'budgetflow_data_v2';

// 1. Initial State & Data Loading
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

// 2. Core Functions
const save = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render();
};

const render = () => {
    const root = document.getElementById('app-root');
    if (!root) return; // Safety check
    
    document.body.classList.toggle('dark', state.darkMode);

    root.innerHTML = `
        <div id="header">
            <h1 style="margin:0; font-size: 24px;">BudgetFlow</h1>
            <div style="opacity:0.9; margin-top:4px;">Welcome, ${state.userName}</div>
        </div>
        <div id="tabs-container">
            ${['Dashboard', 'Bills', 'Spending', 'Deposits', 'Settings'].map(t => `
                <button class="tab-btn ${activeTab === t.toLowerCase() ? 'active' : ''}" 
                        onclick="switchTab('${t.toLowerCase()}')">
                    ${t}
                </button>
            `).join('')}
        </div>
        <div id="content">${renderTabContent()}</div>
    `;
};

window.switchTab = (tab) => {
    activeTab = tab;
    editingIndex = null;
    render();
};

// 3. Tab Rendering Logic
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
                ${billToEdit ? `<button class="btn" style="background:transparent; color:var(--text)" onclick="editingIndex=null;render()">Cancel</button>` : ''}
            </div>
            <div class="panel">
                ${state.bills.map((b, i) => `
                    <div class="item-row">
                        <div><strong>${b.name}</strong><br><small>${b.freq}</small></div>
                        <div style="text-align:right">
                            <strong>$${b.amount.toFixed(2)}</strong><br>
                            <span style="color:var(--primary); cursor:pointer;" onclick="startEdit(${i})">Edit</span> | 
                            <span style="color:var(--danger); cursor:pointer;" onclick="deleteItem('bills', ${i})">Delete</span>
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
                            <span style="color:var(--danger); cursor:pointer;" onclick="deleteItem('${type}', ${i})">Delete</span>
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

// 4. Action Handlers
window.startEdit = (index) => {
    editingIndex = index;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.saveBill = () => {
    const name = document.getElementById('bName').value;
    const amount = parseFloat(document.getElementById('bAmount').value);
    const freq = document.getElementById('bFreq').value;
    if (!name || isNaN(amount)) return alert("Please enter name and amount");

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
    if (!name || isNaN(amount)) return alert("Please enter description and amount");
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
};

// 5. Initialize
document.addEventListener('DOMContentLoaded', render);
