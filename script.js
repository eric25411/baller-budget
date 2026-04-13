const STORAGE_KEY = 'budgetflow-v1';
const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'bills', label: 'Bills' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'budget', label: 'Budget Tracker' },
  { id: 'spending', label: 'Other Spending' },
  { id: 'deposits', label: 'Deposits' },
];

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function makeId(prefix) {
  return prefix + '-' + Math.random().toString(36).slice(2, 8) + '-' + Date.now().toString(36);
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function parseISODate(value) {
  if (!value) return null;
  const p = value.split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2]);
}

function toISODate(date) {
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysInMonth(y, m) {
  return new Date(y, m + 1, 0).getDate();
}

function makeMonthDate(y, m, day) {
  return new Date(y, m, Math.min(day, daysInMonth(y, m)));
}

function addMonthsSafe(date, months) {
  const n = new Date(date.getFullYear(), date.getMonth() + months, 1);
  return makeMonthDate(n.getFullYear(), n.getMonth(), date.getDate());
}

function numberOrZero(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function sortByDate(a, b) {
  return a.localeCompare(b);
}

function getTodayISO() {
  return toISODate(new Date());
}

function formatDate(value) {
  if (!value) return '—';
  const d = typeof value === 'string' ? parseISODate(value) : value;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCompactDate(value) {
  if (!value) return '—';
  const d = typeof value === 'string' ? parseISODate(value) : value;
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
}

function formatMoney(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getDaysUntil(dateString) {
  const today = startOfDay(new Date());
  const due = startOfDay(parseISODate(dateString));
  return Math.round((due - today) / 86400000);
}

function getStatus(dateString, paid) {
  if (paid) return 'Paid';
  const days = getDaysUntil(dateString);
  if (days < 0) return 'Overdue';
  if (days <= 30) return 'Due Soon';
  return 'Later';
}

function getStatusClass(status) {
  if (status === 'Paid') return 'paid';
  if (status === 'Overdue') return 'overdue';
  if (status === 'Due Soon') return 'soon';
  return 'later';
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const defaultData = {
  settings: { openingBalance: 0, scheduleMonthsForward: 12 },
  bills: [],
  payPeriods: [
    { id: 'period-1', payDate: getTodayISO(), income: 0, bankBalance: '', reconciled: false, startingBalanceOverride: '' }
  ],
  spending: [],
  deposits: [],
  scheduleMeta: {}
};

let state = loadState();
let activeTab = 'dashboard';
let scheduleSearch = '';
let next30Only = true;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : clone(defaultData);
  } catch (e) {
    return clone(defaultData);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function setState(updater) {
  state = updater(state);
  saveState();
  renderApp();
}

function getPayPeriodForDate(dateString, payPeriods) {
  const sorted = payPeriods.slice().sort((a, b) => sortByDate(a.payDate, b.payDate));
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    const start = p.payDate;
    const end = toISODate(addDays(parseISODate(p.payDate), 13));
    if (dateString >= start && dateString <= end) return p;
  }
  return null;
}

function getScheduleRows() {
  const bills = state.bills || [];
  const scheduleMeta = state.scheduleMeta || {};
  const settings = state.settings || defaultData.settings;
  const start = addDays(new Date(), -45);
  const end = addMonthsSafe(new Date(), settings.scheduleMonthsForward || 12);
  const rows = [];

  bills.forEach(function (bill) {
    if (!bill.active) return;

    if (bill.frequency === 'monthly') {
      const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
      const lastMonth = new Date(end.getFullYear(), end.getMonth(), 1);
      while (cursor <= lastMonth) {
        const due = makeMonthDate(cursor.getFullYear(), cursor.getMonth(), bill.dueDay || 1);
        if (due >= start && due <= end) {
          const date = toISODate(due);
          const key = bill.id + '|' + date;
          const meta = scheduleMeta[key] || {};
          rows.push({
            key,
            billId: bill.id,
            billName: bill.name,
            date,
            amount: numberOrZero(meta.customAmount != null ? meta.customAmount : bill.defaultAmount),
            paid: Boolean(meta.paid),
            paidDate: meta.paidDate || '',
            amountPaid: meta.amountPaid != null ? meta.amountPaid : '',
            note: meta.note || '',
            status: getStatus(date, Boolean(meta.paid)),
            daysUntilDue: getDaysUntil(date)
          });
        }
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }

    if (bill.frequency === 'biweekly' && bill.anchorDate) {
      let due = parseISODate(bill.anchorDate);
      while (due < start) due = addDays(due, 14);
      while (due <= end) {
        const date = toISODate(due);
        const key = bill.id + '|' + date;
        const meta = scheduleMeta[key] || {};
        rows.push({
          key,
          billId: bill.id,
          billName: bill.name,
          date,
          amount: numberOrZero(meta.customAmount != null ? meta.customAmount : bill.defaultAmount),
          paid: Boolean(meta.paid),
          paidDate: meta.paidDate || '',
          amountPaid: meta.amountPaid != null ? meta.amountPaid : '',
          note: meta.note || '',
          status: getStatus(date, Boolean(meta.paid)),
          daysUntilDue: getDaysUntil(date)
        });
        due = addDays(due, 14);
      }
    }

    if (bill.frequency === 'semiannual') {
      const months = bill.dueMonths || [];
      for (let year = start.getFullYear(); year <= end.getFullYear(); year++) {
        months.forEach(function (month) {
          const due = makeMonthDate(year, month - 1, bill.dueDay || 1);
          if (due >= start && due <= end) {
            const date = toISODate(due);
            const key = bill.id + '|' + date;
            const meta = scheduleMeta[key] || {};
            rows.push({
              key,
              billId: bill.id,
              billName: bill.name,
              date,
              amount: numberOrZero(meta.customAmount != null ? meta.customAmount : bill.defaultAmount),
              paid: Boolean(meta.paid),
              paidDate: meta.paidDate || '',
              amountPaid: meta.amountPaid != null ? meta.amountPaid : '',
              note: meta.note || '',
              status: getStatus(date, Boolean(meta.paid)),
              daysUntilDue: getDaysUntil(date)
            });
          }
        });
      }
    }
  });

  rows.sort(function (a, b) {
    return a.date.localeCompare(b.date) || a.billName.localeCompare(b.billName);
  });
  return rows;
}

function getFilteredScheduleRows() {
  return getScheduleRows().filter(function (row) {
    const matchesSearch = !scheduleSearch || row.billName.toLowerCase().includes(scheduleSearch.toLowerCase());
    const matchesWindow = !next30Only || (row.daysUntilDue >= 0 && row.daysUntilDue <= 30 && !row.paid);
    return matchesSearch && matchesWindow;
  });
}

function getBudgetRows() {
  const payPeriods = (state.payPeriods || []).slice().sort((a, b) => sortByDate(a.payDate, b.payDate));
  const scheduleRows = getScheduleRows();
  const spending = state.spending || [];
  const deposits = state.deposits || [];
  let runningBalance = numberOrZero(state.settings.openingBalance);

  return payPeriods.map(function (period) {
    const start = period.payDate;
    const end = toISODate(addDays(parseISODate(period.payDate), 13));
    const scheduledBills = scheduleRows.filter(r => r.date >= start && r.date <= end).reduce((s, r) => s + numberOrZero(r.amount), 0);
    const billsPaid = scheduleRows.filter(function (r) {
      if (!r.paid) return false;
      const actualDate = r.paidDate || r.date;
      return actualDate >= start && actualDate <= end;
    }).reduce((s, r) => s + numberOrZero(r.amountPaid || r.amount), 0);
    const periodSpending = spending.filter(i => i.charged && i.date >= start && i.date <= end).reduce((s, i) => s + numberOrZero(i.amount), 0);
    const periodDeposits = deposits.filter(i => i.date >= start && i.date <= end).reduce((s, i) => s + numberOrZero(i.amount), 0);
    const totalOut = scheduledBills + periodSpending;
    const manualStart = period.startingBalanceOverride === '' || period.startingBalanceOverride == null ? null : numberOrZero(period.startingBalanceOverride);
    const actualStartingBalance = manualStart == null ? runningBalance : manualStart;
    const endingBalance = actualStartingBalance + numberOrZero(period.income) + periodDeposits - totalOut;
    const variance = period.bankBalance === '' ? '' : numberOrZero(period.bankBalance) - endingBalance;

    const result = {
      id: period.id,
      payDate: period.payDate,
      income: period.income,
      bankBalance: period.bankBalance,
      reconciled: period.reconciled,
      windowStart: start,
      windowEnd: end,
      startingBalance: actualStartingBalance,
      startingBalanceOverride: period.startingBalanceOverride,
      deposits: periodDeposits,
      billsScheduled: scheduledBills,
      billsPaid,
      otherSpending: periodSpending,
      totalOut,
      endingBalance,
      rollover: endingBalance,
      variance
    };

    runningBalance = endingBalance;
    return result;
  });
}

function getSummary() {
  const bills = state.bills || [];
  const scheduleRows = getScheduleRows();
  const budgetRows = getBudgetRows();
  const activeBills = bills.filter(b => b.active).length;
  const next30 = scheduleRows.filter(r => !r.paid && r.daysUntilDue >= 0 && r.daysUntilDue <= 30);
  const overdue = scheduleRows.filter(r => !r.paid && r.daysUntilDue < 0);
  const today = getTodayISO();
  const currentPeriod = budgetRows.find(r => today >= r.windowStart && today <= r.windowEnd) || budgetRows[0] || null;
  const monthlyRunRate = bills.reduce(function (sum, bill) {
    if (!bill.active) return sum;
    if (bill.frequency === 'monthly') return sum + numberOrZero(bill.defaultAmount);
    if (bill.frequency === 'biweekly') return sum + (numberOrZero(bill.defaultAmount) * 26 / 12);
    if (bill.frequency === 'semiannual') return sum + (numberOrZero(bill.defaultAmount) / 6);
    return sum;
  }, 0);

  return {
    activeBills,
    next30Count: next30.length,
    next30Amount: next30.reduce((s, r) => s + numberOrZero(r.amount), 0),
    overdueCount: overdue.length,
    overdueAmount: overdue.reduce((s, r) => s + numberOrZero(r.amount), 0),
    monthlyRunRate,
    currentPeriod,
    nextBills: next30.slice(0, 8)
  };
}

function setTab(tabId) {
  activeTab = tabId;
  document.querySelectorAll('.tab-panel').forEach(function (panel) {
    panel.classList.toggle('hidden', panel.id !== 'tab-' + tabId);
  });
  document.querySelectorAll('.tab-btn').forEach(function (btn) {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
}

function renderTabs() {
  const el = document.getElementById('tabs');
  el.innerHTML = TABS.map(tab => '<button class="tab-btn ' + (activeTab === tab.id ? 'active' : '') + '" data-tab="' + tab.id + '">' + tab.label + '</button>').join('');
  el.querySelectorAll('.tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      setTab(btn.dataset.tab);
    });
  });
}

function renderDashboard() {
  const summary = getSummary();
  const current = summary.currentPeriod;
  const nextBillsHtml = summary.nextBills.length ? summary.nextBills.map(function (row) {
    return '<div class="next-item"><div>' + escapeHtml(formatDate(row.date)) + '</div><div>' + escapeHtml(row.billName) + '</div><div>' + escapeHtml(formatMoney(row.amount)) + '</div><div><span class="status ' + getStatusClass(row.status) + '">' + escapeHtml(row.status) + '</span></div></div>';
  }).join('') : '<div class="note-box">No bills due in the next 30 days right now.</div>';

  document.getElementById('tab-dashboard').innerHTML =
    '<div class="stats">' +
    '<div class="stat"><div class="label">Active bills</div><div class="value">' + summary.activeBills + '</div><div class="sub">Pulled from the Bills tab</div></div>' +
    '<div class="stat"><div class="label">Due in next 30 days</div><div class="value">' + summary.next30Count + '</div><div class="sub">' + formatMoney(summary.next30Amount) + '</div></div>' +
    '<div class="stat"><div class="label">Overdue</div><div class="value">' + summary.overdueCount + '</div><div class="sub">' + formatMoney(summary.overdueAmount) + '</div></div>' +
    '<div class="stat"><div class="label">Monthly run rate</div><div class="value">' + formatMoney(summary.monthlyRunRate) + '</div><div class="sub">Monthly plus converted recurring items</div></div>' +
    '</div>' +
    '<div class="grid-two">' +
    '<div class="panel"><div class="panel-head"><div><h2>Current pay period snapshot</h2><p>The same biweekly flow as the workbook, just cleaner.</p></div></div><div class="panel-body">' +
    (current ?
      '<div class="stats" style="grid-template-columns: repeat(4, minmax(0, 1fr)); margin-bottom: 0;">' +
      '<div class="stat"><div class="label">Pay date</div><div class="value" style="font-size:24px;">' + formatCompactDate(current.payDate) + '</div><div class="sub">' + formatCompactDate(current.windowStart) + ' to ' + formatCompactDate(current.windowEnd) + '</div></div>' +
      '<div class="stat"><div class="label">Bills scheduled</div><div class="value" style="font-size:24px;">' + formatMoney(current.billsScheduled) + '</div><div class="sub">Bills paid so far: ' + formatMoney(current.billsPaid) + '</div></div>' +
      '<div class="stat"><div class="label">Other spending</div><div class="value" style="font-size:24px;">' + formatMoney(current.otherSpending) + '</div><div class="sub">Deposits: ' + formatMoney(current.deposits) + '</div></div>' +
      '<div class="stat"><div class="label">Projected ending</div><div class="value" style="font-size:24px;">' + formatMoney(current.endingBalance) + '</div><div class="sub">Income: ' + formatMoney(current.income) + '</div></div>' +
      '</div>'
      : '<div class="note-box">No pay periods yet.</div>') +
    '</div></div>' +
    '<div class="panel"><div class="panel-head"><div><h2>App settings</h2><p>Small controls that shape the whole tracker.</p></div></div><div class="panel-body stack">' +
    '<div><label class="muted" style="display:block;margin-bottom:8px;">Opening balance</label><input class="field" id="openingBalanceInput" type="number" step="0.01" value="' + state.settings.openingBalance + '" /></div>' +
    '<div><label class="muted" style="display:block;margin-bottom:8px;">Schedule horizon, months forward</label><input class="field" id="monthsForwardInput" type="number" min="1" max="24" value="' + state.settings.scheduleMonthsForward + '" /></div>' +
    '<div class="note-box">The schedule is generated from active bills. The budget tracker then rolls the scheduled bills, spending, and deposits into each biweekly window.</div>' +
    '</div></div>' +
    '</div>' +
    '<div class="panel"><div class="panel-head"><div><h2>Next bills coming up</h2><p>This is the app version of your next 30 days view.</p></div></div><div class="panel-body"><div class="next-list">' + nextBillsHtml + '</div></div></div>';

  const opening = document.getElementById('openingBalanceInput');
  if (opening) {
    opening.addEventListener('change', function (e) {
      setState(function (currentState) {
        const copy = clone(currentState);
        copy.settings.openingBalance = numberOrZero(e.target.value);
        return copy;
      });
    });
  }

  const months = document.getElementById('monthsForwardInput');
  if (months) {
    months.addEventListener('change', function (e) {
      setState(function (currentState) {
        const copy = clone(currentState);
        copy.settings.scheduleMonthsForward = Math.max(1, numberOrZero(e.target.value));
        return copy;
      });
    });
  }
}

function renderBills() {
  document.getElementById('tab-bills').innerHTML =
    '<div class="panel"><div class="panel-head"><div><h2>Bills</h2><p>Your recurring bill list.</p></div><div class="controls"><button class="btn" id="addBillBtn">Add bill</button></div></div><div class="panel-body"><div class="table-wrap"><table><thead><tr><th>Name</th><th>Amount</th><th>Frequency</th><th>Due day</th><th>Anchor date</th><th>Active</th><th>Notes</th><th></th></tr></thead><tbody>' +
    (state.bills || []).map(function (bill) {
      return '<tr>' +
        '<td><input class="field bill-name" data-id="' + bill.id + '" value="' + escapeHtml(bill.name) + '" /></td>' +
        '<td><input class="field bill-amount" data-id="' + bill.id + '" type="number" step="0.01" value="' + bill.defaultAmount + '" /></td>' +
        '<td><select class="select bill-frequency" data-id="' + bill.id + '">' +
        '<option value="monthly" ' + (bill.frequency === 'monthly' ? 'selected' : '') + '>Monthly</option>' +
        '<option value="biweekly" ' + (bill.frequency === 'biweekly' ? 'selected' : '') + '>Biweekly</option>' +
        '<option value="semiannual" ' + (bill.frequency === 'semiannual' ? 'selected' : '') + '>Semiannual</option>' +
        '</select></td>' +
        '<td><input class="field bill-due-day" data-id="' + bill.id + '" type="number" min="1" max="31" value="' + (bill.dueDay || '') + '" /></td>' +
        '<td><input class="field bill-anchor" data-id="' + bill.id + '" type="date" value="' + (bill.anchorDate || '') + '" /></td>' +
        '<td><input class="bill-active" data-id="' + bill.id + '" type="checkbox" ' + (bill.active ? 'checked' : '') + ' /></td>' +
        '<td><input class="field bill-notes" data-id="' + bill.id + '" value="' + escapeHtml(bill.notes || '') + '" /></td>' +
        '<td><button class="danger-btn delete-bill" data-id="' + bill.id + '">Remove</button></td>' +
        '</tr>';
    }).join('') +
    '</tbody></table></div></div></div>';

  const addBillBtn = document.getElementById('addBillBtn');
  if (addBillBtn) {
    addBillBtn.addEventListener('click', function () {
      setState(function (currentState) {
        const copy = clone(currentState);
        copy.bills.push({ id: makeId('bill'), name: 'New Bill', defaultAmount: 0, frequency: 'monthly', dueDay: 1, active: true, notes: '' });
        return copy;
      });
    });
  }

  document.querySelectorAll('.bill-name').forEach(el => el.addEventListener('change', e => updateBillField(e.target.dataset.id, 'name', e.target.value)));
  document.querySelectorAll('.bill-amount').forEach(el => el.addEventListener('change', e => updateBillField(e.target.dataset.id, 'defaultAmount', numberOrZero(e.target.value))));
  document.querySelectorAll('.bill-frequency').forEach(el => el.addEventListener('change', e => updateBillField(e.target.dataset.id, 'frequency', e.target.value)));
  document.querySelectorAll('.bill-due-day').forEach(el => el.addEventListener('change', e => updateBillField(e.target.dataset.id, 'dueDay', e.target.value === '' ? '' : numberOrZero(e.target.value))));
  document.querySelectorAll('.bill-anchor').forEach(el => el.addEventListener('change', e => updateBillField(e.target.dataset.id, 'anchorDate', e.target.value)));
  document.querySelectorAll('.bill-active').forEach(el => el.addEventListener('change', e => updateBillField(e.target.dataset.id, 'active', e.target.checked)));
  document.querySelectorAll('.bill-notes').forEach(el => el.addEventListener('change', e => updateBillField(e.target.dataset.id, 'notes', e.target.value)));
  document.querySelectorAll('.delete-bill').forEach(el => el.addEventListener('click', e => {
    const id = e.target.dataset.id;
    setState(function (currentState) {
      const copy = clone(currentState);
      copy.bills = copy.bills.filter(b => b.id !== id);
      return copy;
    });
  }));
}

function renderSchedule() {
  const rows = getFilteredScheduleRows();
  document.getElementById('tab-schedule').innerHTML =
    '<div class="panel"><div class="panel-head"><div><h2>Schedule</h2><p>Generated from active bills, with paid tracking, custom amounts, and notes.</p></div><div class="controls"><input class="field inline-field" id="scheduleSearch" placeholder="Search bills" value="' + escapeHtml(scheduleSearch) + '" /><label class="checkbox-wrap"><input type="checkbox" id="next30OnlyToggle" ' + (next30Only ? 'checked' : '') + ' />Next 30 days only</label></div></div><div class="panel-body"><div class="table-wrap"><table><thead><tr><th>Due date</th><th>Bill</th><th>Amount</th><th>Paid?</th><th>Paid date</th><th>Amount paid</th><th>Note</th><th>Days</th><th>Status</th></tr></thead><tbody>' +
    rows.map(function (row) {
      return '<tr>' +
        '<td>' + escapeHtml(formatDate(row.date)) + '</td>' +
        '<td>' + escapeHtml(row.billName) + '</td>' +
        '<td><input class="field schedule-amount" data-key="' + row.key + '" type="number" step="0.01" value="' + row.amount + '" /></td>' +
        '<td><input class="schedule-paid" data-key="' + row.key + '" type="checkbox" ' + (row.paid ? 'checked' : '') + ' /></td>' +
        '<td><input class="field schedule-paid-date" data-key="' + row.key + '" type="date" value="' + escapeHtml(row.paidDate || '') + '" /></td>' +
        '<td><input class="field schedule-amount-paid" data-key="' + row.key + '" type="number" step="0.01" value="' + escapeHtml(row.amountPaid) + '" /></td>' +
        '<td><input class="field schedule-note" data-key="' + row.key + '" value="' + escapeHtml(row.note || '') + '" /></td>' +
        '<td>' + row.daysUntilDue + '</td>' +
        '<td><span class="status ' + getStatusClass(row.status) + '">' + escapeHtml(row.status) + '</span></td>' +
        '</tr>';
    }).join('') +
    '</tbody></table></div></div></div>';

  const search = document.getElementById('scheduleSearch');
  if (search) search.addEventListener('input', function (e) { scheduleSearch = e.target.value; renderSchedule(); });
  const toggle = document.getElementById('next30OnlyToggle');
  if (toggle) toggle.addEventListener('change', function (e) { next30Only = e.target.checked; renderSchedule(); });
  document.querySelectorAll('.schedule-amount').forEach(el => el.addEventListener('change', e => updateScheduleMeta(e.target.dataset.key, { customAmount: numberOrZero(e.target.value) })));
  document.querySelectorAll('.schedule-paid').forEach(el => el.addEventListener('change', e => updateScheduleMeta(e.target.dataset.key, { paid: e.target.checked, paidDate: e.target.checked ? getTodayISO() : '' })));
  document.querySelectorAll('.schedule-paid-date').forEach(el => el.addEventListener('change', e => updateScheduleMeta(e.target.dataset.key, { paidDate: e.target.value })));
  document.querySelectorAll('.schedule-amount-paid').forEach(el => el.addEventListener('change', e => updateScheduleMeta(e.target.dataset.key, { amountPaid: e.target.value })));
  document.querySelectorAll('.schedule-note').forEach(el => el.addEventListener('change', e => updateScheduleMeta(e.target.dataset.key, { note: e.target.value })));
}

function renderBudget() {
  const rows = getBudgetRows().slice().sort((a, b) => b.payDate.localeCompare(a.payDate));
  const today = getTodayISO();

  function renderBudgetPeriod(row, options) {
    const openAttr = options && options.open ? ' open' : '';
    return '<details class="budget-period"' + openAttr + '>' +
      '<summary class="budget-summary">' +
      '<div class="budget-summary-main">' +
      '<h3>' + formatCompactDate(row.payDate) + ' pay period</h3>' +
      '<p class="muted">' + formatCompactDate(row.windowStart) + ' to ' + formatCompactDate(row.windowEnd) + '</p>' +
      '</div>' +
      '<div class="budget-kpis">' +
      '<div class="budget-kpi"><div class="label">Income</div><div class="value">' + formatMoney(row.income) + '</div></div>' +
      '<div class="budget-kpi"><div class="label">Bills</div><div class="value">' + formatMoney(row.billsScheduled) + '</div></div>' +
      '<div class="budget-kpi"><div class="label">Spending</div><div class="value">' + formatMoney(row.otherSpending) + '</div></div>' +
      '<div class="budget-kpi"><div class="label">Leftover</div><div class="value">' + formatMoney(row.endingBalance) + '</div></div>' +
      '</div>' +
      '</summary>' +
      '<div class="budget-detail">' +
      '<div class="table-wrap"><table><thead><tr><th>Pay date</th><th>Window</th><th>Starting balance</th><th>Income</th><th>Deposits</th><th>Bills scheduled</th><th>Bills paid</th><th>Other spending</th><th>Total out</th><th>Ending balance</th><th>Rollover</th><th>Bank balance</th><th>Variance</th><th>Reconciled?</th></tr></thead><tbody>' +
      '<tr>' +
      '<td><input class="field pay-date" data-id="' + row.id + '" type="date" value="' + row.payDate + '" /></td>' +
      '<td>' + formatCompactDate(row.windowStart) + ' to ' + formatCompactDate(row.windowEnd) + '</td>' +
      '<td><input class="field pay-starting-balance" data-id="' + row.id + '" type="number" step="0.01" value="' + escapeHtml(row.startingBalanceOverride === '' || row.startingBalanceOverride == null ? '' : row.startingBalanceOverride) + '" placeholder="' + row.startingBalance.toFixed(2) + '" /></td>' +
      '<td><input class="field pay-income" data-id="' + row.id + '" type="number" step="0.01" value="' + row.income + '" /></td>' +
      '<td>' + formatMoney(row.deposits) + '</td>' +
      '<td>' + formatMoney(row.billsScheduled) + '</td>' +
      '<td>' + formatMoney(row.billsPaid) + '</td>' +
      '<td>' + formatMoney(row.otherSpending) + '</td>' +
      '<td>' + formatMoney(row.totalOut) + '</td>' +
      '<td>' + formatMoney(row.endingBalance) + '</td>' +
      '<td>' + formatMoney(row.rollover) + '</td>' +
      '<td><input class="field pay-bank-balance" data-id="' + row.id + '" type="number" step="0.01" value="' + escapeHtml(row.bankBalance) + '" /></td>' +
      '<td>' + (row.variance === '' ? '—' : formatMoney(row.variance)) + '</td>' +
      '<td><input class="pay-reconciled" data-id="' + row.id + '" type="checkbox" ' + (row.reconciled ? 'checked' : '') + ' /></td>' +
      '</tr>' +
      '</tbody></table></div>' +
      '</div>' +
      '</details>';
  }

  const stackMarkup = rows.length ? rows.map(function (row) {
    const isCurrent = today >= row.windowStart && today <= row.windowEnd;
    return renderBudgetPeriod(row, { open: isCurrent });
  }).join('') : '<div class="note-box">No pay periods yet.</div>';

  document.getElementById('tab-budget').innerHTML =
    '<div class="panel"><div class="panel-head"><div><h2>Budget Tracker</h2><p>Newest periods stay at the top, and the current period opens by default.</p></div><div class="controls"><button class="btn" id="addPayPeriodBtn">Start New Period</button></div></div><div class="panel-body">' +
    '<div class="budget-stack">' + stackMarkup + '</div>' +
    '</div></div>';

  const add = document.getElementById('addPayPeriodBtn');
  if (add) add.addEventListener('click', function () {
    setState(function (currentState) {
      const copy = clone(currentState);
      const sorted = copy.payPeriods.slice().sort((a, b) => sortByDate(a.payDate, b.payDate));
      const last = sorted[sorted.length - 1];
      const nextDate = last ? toISODate(addDays(parseISODate(last.payDate), 14)) : getTodayISO();
      const lastIncome = last ? numberOrZero(last.income) : 0;
      copy.payPeriods.push({ id: makeId('period'), payDate: nextDate, income: lastIncome, bankBalance: '', reconciled: false, startingBalanceOverride: '' });
      return copy;
    });
  });

  document.querySelectorAll('.pay-date').forEach(el => el.addEventListener('change', e => updatePayPeriodField(e.target.dataset.id, 'payDate', e.target.value)));
  document.querySelectorAll('.pay-income').forEach(el => el.addEventListener('change', e => updatePayPeriodField(e.target.dataset.id, 'income', numberOrZero(e.target.value))));
  document.querySelectorAll('.pay-starting-balance').forEach(el => el.addEventListener('change', e => updatePayPeriodField(e.target.dataset.id, 'startingBalanceOverride', e.target.value)));
  document.querySelectorAll('.pay-bank-balance').forEach(el => el.addEventListener('change', e => updatePayPeriodField(e.target.dataset.id, 'bankBalance', e.target.value)));
  document.querySelectorAll('.pay-reconciled').forEach(el => el.addEventListener('change', e => updatePayPeriodField(e.target.dataset.id, 'reconciled', e.target.checked)));
}

function renderSpending() {
  const rows = (state.spending || []).slice().sort((a, b) => sortByDate(a.date, b.date));
  const payPeriods = (state.payPeriods || []).slice().sort((a, b) => b.payDate.localeCompare(a.payDate));
  const groups = payPeriods.map(function (period) {
    const start = period.payDate;
    const end = toISODate(addDays(parseISODate(period.payDate), 13));
    const items = rows.filter(item => item.date >= start && item.date <= end);
    const total = items.reduce((sum, item) => item.charged ? sum + numberOrZero(item.amount) : sum, 0);
    return { id: period.id, payDate: period.payDate, windowStart: start, windowEnd: end, items, total };
  });
  const outsideRange = rows.filter(item => !getPayPeriodForDate(item.date, payPeriods));

  document.getElementById('tab-spending').innerHTML =
    '<div class="panel"><div class="panel-head"><div><h2>Other Spending</h2><p>Spending is grouped by each pay period so it is easier to track what belongs where.</p></div></div><div class="panel-body"><div class="period-list">' +
    groups.map(function (group) {
      return '<div class="period-card">' +
        '<div class="period-head"><div><h3>' + formatCompactDate(group.payDate) + ' pay period</h3><p class="muted">' + formatCompactDate(group.windowStart) + ' to ' + formatCompactDate(group.windowEnd) + '</p></div><div class="controls"><div class="muted">Tracked spending: ' + formatMoney(group.total) + '</div><button class="mini-btn add-spending-for-period" data-period-id="' + group.id + '">+ Add spending</button></div></div>' +
        (group.items.length ?
          '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Company</th><th>Amount</th><th>Charged?</th><th>Comments</th><th></th></tr></thead><tbody>' +
          group.items.map(function (item) {
            return '<tr>' +
              '<td><input class="field spend-date" data-id="' + item.id + '" type="date" value="' + item.date + '" /></td>' +
              '<td><input class="field spend-company" data-id="' + item.id + '" value="' + escapeHtml(item.company) + '" /></td>' +
              '<td><input class="field spend-amount" data-id="' + item.id + '" type="number" step="0.01" value="' + item.amount + '" /></td>' +
              '<td><input class="spend-charged" data-id="' + item.id + '" type="checkbox" ' + (item.charged ? 'checked' : '') + ' /></td>' +
              '<td><input class="field spend-comments" data-id="' + item.id + '" value="' + escapeHtml(item.comments || '') + '" /></td>' +
              '<td><button class="danger-btn delete-spend" data-id="' + item.id + '">Remove</button></td>' +
              '</tr>';
          }).join('') + '</tbody></table></div>'
          : '<div class="note-box">No extra spending added for this pay period yet.</div>') +
        '</div>';
    }).join('') +
    (outsideRange.length ? '<div class="period-card"><div class="period-head"><div><h3>Outside current pay periods</h3><p class="muted">These entries do not currently land inside one of the pay period windows.</p></div></div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Company</th><th>Amount</th><th>Charged?</th><th>Comments</th><th></th></tr></thead><tbody>' +
      outsideRange.map(function (item) {
        return '<tr>' +
          '<td><input class="field spend-date" data-id="' + item.id + '" type="date" value="' + item.date + '" /></td>' +
          '<td><input class="field spend-company" data-id="' + item.id + '" value="' + escapeHtml(item.company) + '" /></td>' +
          '<td><input class="field spend-amount" data-id="' + item.id + '" type="number" step="0.01" value="' + item.amount + '" /></td>' +
          '<td><input class="spend-charged" data-id="' + item.id + '" type="checkbox" ' + (item.charged ? 'checked' : '') + ' /></td>' +
          '<td><input class="field spend-comments" data-id="' + item.id + '" value="' + escapeHtml(item.comments || '') + '" /></td>' +
          '<td><button class="danger-btn delete-spend" data-id="' + item.id + '">Remove</button></td>' +
          '</tr>';
      }).join('') + '</tbody></table></div></div>' : '') +
    '</div></div></div>';

  document.querySelectorAll('.add-spending-for-period').forEach(function (el) {
    el.addEventListener('click', function (e) {
      const periodId = e.target.dataset.periodId;
      const period = (state.payPeriods || []).find(p => p.id === periodId);
      if (!period) return;
      setState(function (currentState) {
        const copy = clone(currentState);
        copy.spending.push({ id: makeId('sp'), date: period.payDate, company: '', amount: 0, charged: true, comments: '' });
        return copy;
      });
    });
  });

  document.querySelectorAll('.spend-date').forEach(el => el.addEventListener('change', e => updateSpendingField(e.target.dataset.id, 'date', e.target.value)));
  document.querySelectorAll('.spend-company').forEach(el => el.addEventListener('change', e => updateSpendingField(e.target.dataset.id, 'company', e.target.value)));
  document.querySelectorAll('.spend-amount').forEach(el => el.addEventListener('change', e => updateSpendingField(e.target.dataset.id, 'amount', numberOrZero(e.target.value))));
  document.querySelectorAll('.spend-charged').forEach(el => el.addEventListener('change', e => updateSpendingField(e.target.dataset.id, 'charged', e.target.checked)));
  document.querySelectorAll('.spend-comments').forEach(el => el.addEventListener('change', e => updateSpendingField(e.target.dataset.id, 'comments', e.target.value)));
  document.querySelectorAll('.delete-spend').forEach(el => el.addEventListener('click', e => {
    const id = e.target.dataset.id;
    setState(function (currentState) {
      const copy = clone(currentState);
      copy.spending = copy.spending.filter(item => item.id !== id);
      return copy;
    });
  }));
}

function renderDeposits() {
  const rows = (state.deposits || []).slice().sort((a, b) => sortByDate(a.date, b.date));
  const payPeriods = (state.payPeriods || []).slice().sort((a, b) => b.payDate.localeCompare(a.payDate));
  const groups = payPeriods.map(function (period) {
    const start = period.payDate;
    const end = toISODate(addDays(parseISODate(period.payDate), 13));
    const items = rows.filter(item => item.date >= start && item.date <= end);
    const total = items.reduce((sum, item) => sum + numberOrZero(item.amount), 0);
    return { id: period.id, payDate: period.payDate, windowStart: start, windowEnd: end, items, total };
  });
  const outsideRange = rows.filter(item => !getPayPeriodForDate(item.date, payPeriods));

  document.getElementById('tab-deposits').innerHTML =
    '<div class="panel"><div class="panel-head"><div><h2>Deposits</h2><p>Deposits are grouped by pay period for easier tracking.</p></div></div><div class="panel-body"><div class="period-list">' +
    groups.map(function (group) {
      return '<div class="period-card">' +
        '<div class="period-head"><div><h3>' + formatCompactDate(group.payDate) + ' pay period</h3><p class="muted">' + formatCompactDate(group.windowStart) + ' to ' + formatCompactDate(group.windowEnd) + '</p></div><div class="controls"><div class="muted">Tracked deposits: ' + formatMoney(group.total) + '</div><button class="mini-btn add-deposit-for-period" data-period-id="' + group.id + '">+ Add deposit</button></div></div>' +
        (group.items.length ?
          '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Amount</th><th>Comments</th><th></th></tr></thead><tbody>' +
          group.items.map(function (item) {
            return '<tr>' +
              '<td><input class="field deposit-date" data-id="' + item.id + '" type="date" value="' + item.date + '" /></td>' +
              '<td><input class="field deposit-amount" data-id="' + item.id + '" type="number" step="0.01" value="' + item.amount + '" /></td>' +
              '<td><input class="field deposit-comments" data-id="' + item.id + '" value="' + escapeHtml(item.comments || '') + '" /></td>' +
              '<td><button class="danger-btn delete-deposit" data-id="' + item.id + '">Remove</button></td>' +
              '</tr>';
          }).join('') + '</tbody></table></div>'
          : '<div class="note-box">No deposits added for this pay period yet.</div>') +
        '</div>';
    }).join('') +
    (outsideRange.length ? '<div class="period-card"><div class="period-head"><div><h3>Outside current pay periods</h3><p class="muted">These entries do not currently land inside one of the pay period windows.</p></div></div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Amount</th><th>Comments</th><th></th></tr></thead><tbody>' +
      outsideRange.map(function (item) {
        return '<tr>' +
          '<td><input class="field deposit-date" data-id="' + item.id + '" type="date" value="' + item.date + '" /></td>' +
          '<td><input class="field deposit-amount" data-id="' + item.id + '" type="number" step="0.01" value="' + item.amount + '" /></td>' +
          '<td><input class="field deposit-comments" data-id="' + item.id + '" value="' + escapeHtml(item.comments || '') + '" /></td>' +
          '<td><button class="danger-btn delete-deposit" data-id="' + item.id + '">Remove</button></td>' +
          '</tr>';
      }).join('') + '</tbody></table></div></div>' : '') +
    '</div></div></div>';

  document.querySelectorAll('.add-deposit-for-period').forEach(function (el) {
    el.addEventListener('click', function (e) {
      const periodId = e.target.dataset.periodId;
      const period = (state.payPeriods || []).find(p => p.id === periodId);
      if (!period) return;
      setState(function (currentState) {
        const copy = clone(currentState);
        copy.deposits.push({ id: makeId('dep'), date: period.payDate, amount: 0, comments: '' });
        return copy;
      });
    });
  });

  document.querySelectorAll('.deposit-date').forEach(el => el.addEventListener('change', e => updateDepositField(e.target.dataset.id, 'date', e.target.value)));
  document.querySelectorAll('.deposit-amount').forEach(el => el.addEventListener('change', e => updateDepositField(e.target.dataset.id, 'amount', numberOrZero(e.target.value))));
  document.querySelectorAll('.deposit-comments').forEach(el => el.addEventListener('change', e => updateDepositField(e.target.dataset.id, 'comments', e.target.value)));
  document.querySelectorAll('.delete-deposit').forEach(el => el.addEventListener('click', e => {
    const id = e.target.dataset.id;
    setState(function (currentState) {
      const copy = clone(currentState);
      copy.deposits = copy.deposits.filter(item => item.id !== id);
      return copy;
    });
  }));
}

function updateBillField(id, key, value) {
  setState(function (currentState) {
    const copy = clone(currentState);
    copy.bills = copy.bills.map(b => b.id === id ? Object.assign({}, b, { [key]: value }) : b);
    return copy;
  });
}

function updateScheduleMeta(key, patch) {
  setState(function (currentState) {
    const copy = clone(currentState);
    copy.scheduleMeta[key] = Object.assign({}, copy.scheduleMeta[key] || {}, patch);
    return copy;
  });
}

function updatePayPeriodField(id, key, value) {
  setState(function (currentState) {
    const copy = clone(currentState);
    copy.payPeriods = copy.payPeriods.map(p => p.id === id ? Object.assign({}, p, { [key]: value }) : p);
    return copy;
  });
}

function updateSpendingField(id, key, value) {
  setState(function (currentState) {
    const copy = clone(currentState);
    copy.spending = copy.spending.map(i => i.id === id ? Object.assign({}, i, { [key]: value }) : i);
    return copy;
  });
}

function updateDepositField(id, key, value) {
  setState(function (currentState) {
    const copy = clone(currentState);
    copy.deposits = copy.deposits.map(i => i.id === id ? Object.assign({}, i, { [key]: value }) : i);
    return copy;
  });
}

function renderApp() {
  renderTabs();
  renderDashboard();
  renderBills();
  renderSchedule();
  renderBudget();
  renderSpending();
  renderDeposits();
  setTab(activeTab);
}

document.getElementById('exportBtn').addEventListener('click', function () {
  downloadJson('budgetflow-backup.json', state);
});

document.getElementById('seedBtn').addEventListener('click', function () {
  localStorage.removeItem(STORAGE_KEY);
  state = clone(defaultData);
  saveState();
  renderApp();
});

document.getElementById('importFile').addEventListener('change', async function (e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    state = JSON.parse(text);
    saveState();
    renderApp();
  } catch (err) {
    alert('That backup file could not be read.');
  }
  e.target.value = '';
});

renderApp();
