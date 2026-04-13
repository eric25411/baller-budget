const STORAGE_KEY = 'budgetflow-v1';

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'bills', label: 'Bills' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'budget', label: 'Budget Tracker' },
  { id: 'spending', label: 'Other Spending' },
  { id: 'deposits', label: 'Deposits' },
  { id: 'settings', label: 'Settings' },
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
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(Number(value || 0));
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

function downloadText(filename, text, type = 'text/plain;charset=utf-8;') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  const str = String(value ?? '');
  if (str.includes('"') || str.includes(',') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function toCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.map(csvEscape).join(',')];
  rows.forEach(function (row) {
    lines.push(headers.map(function (header) {
      return csvEscape(row[header]);
    }).join(','));
  });
  return lines.join('\n');
}

const defaultData = {
  settings: {
    openingBalance: 0,
    scheduleMonthsForward: 12,
    defaultIncome: 0,
    copyPreviousIncome: true
  },
  bills: [],
  payPeriods: [
    {
      id: 'period-1',
      payDate: getTodayISO(),
      income: 0,
      bankBalance: '',
      reconciled: false,
      startingBalanceOverride: ''
    }
  ],
  spending: [],
  deposits: [],
  scheduleMeta: {}
};

function normalizeState(data) {
  const base = clone(defaultData);
  const merged = {
    ...base,
    ...(data || {}),
    settings: {
      ...base.settings,
      ...((data && data.settings) || {})
    },
    bills: ((data && data.bills) || []).map(function (bill) {
      return {
        id: bill.id || makeId('bill'),
        name: bill.name || '',
        defaultAmount: numberOrZero(bill.defaultAmount),
        frequency: bill.frequency || 'monthly',
        dueDay: bill.dueDay ?? '',
        anchorDate: bill.anchorDate || '',
        dueMonths: Array.isArray(bill.dueMonths) ? bill.dueMonths : [],
        active: bill.active !== false,
        notes: bill.notes || ''
      };
    }),
    payPeriods: ((data && data.payPeriods) || base.payPeriods).map(function (period) {
      return {
        id: period.id || makeId('period'),
        payDate: period.payDate || getTodayISO(),
        income: numberOrZero(period.income),
        bankBalance: period.bankBalance ?? '',
        reconciled: Boolean(period.reconciled),
        startingBalanceOverride: period.startingBalanceOverride ?? ''
      };
    }),
    spending: ((data && data.spending) || []).map(function (item) {
      return {
        id: item.id || makeId('sp'),
        date: item.date || getTodayISO(),
        company: item.company || '',
        amount: numberOrZero(item.amount),
        charged: item.charged !== false,
        comments: item.comments || ''
      };
    }),
    deposits: ((data && data.deposits) || []).map(function (item) {
      return {
        id: item.id || makeId('dep'),
        date: item.date || getTodayISO(),
        amount: numberOrZero(item.amount),
        comments: item.comments || ''
      };
    }),
    scheduleMeta: (data && data.scheduleMeta) || {}
  };

  if (!merged.payPeriods.length) {
    merged.payPeriods = clone(base.payPeriods);
  }

  return merged;
}

let state = loadState();
let activeTab = 'dashboard';
let scheduleSearch = '';
let next30Only = true;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : clone(defaultData);
  } catch (e) {
    return clone(defaultData);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function setState(updater) {
  state = normalizeState(updater(state));
  saveState();
  renderApp();
}

function getPayPeriodForDate(dateString, payPeriods) {
  const sorted = payPeriods.slice().sort(function (a, b) {
    return sortByDate(a.payDate, b.payDate);
  });

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
  const payPeriods = (state.payPeriods || []).slice().sort(function (a, b) {
    return sortByDate(a.payDate, b.payDate);
  });
  const scheduleRows = getScheduleRows();
  const spending = state.spending || [];
  const deposits = state.deposits || [];
  let runningBalance = numberOrZero(state.settings.openingBalance);

  return payPeriods.map(function (period) {
    const start = period.payDate;
    const end = toISODate(addDays(parseISODate(period.payDate), 13));

    const scheduledBills = scheduleRows
      .filter(function (r) {
        return r.date >= start && r.date <= end;
      })
      .reduce(function (s, r) {
        return s + numberOrZero(r.amount);
      }, 0);

    const billsPaid = scheduleRows
      .filter(function (r) {
        if (!r.paid) return false;
        const actualDate = r.paidDate || r.date;
        return actualDate >= start && actualDate <= end;
      })
      .reduce(function (s, r) {
        return s + numberOrZero(r.amountPaid || r.amount);
      }, 0);

    const periodSpending = spending
      .filter(function (i) {
        return i.charged && i.date >= start && i.date <= end;
      })
      .reduce(function (s, i) {
        return s + numberOrZero(i.amount);
      }, 0);

    const periodDeposits = deposits
      .filter(function (i) {
        return i.date >= start && i.date <= end;
      })
      .reduce(function (s, i) {
        return s + numberOrZero(i.amount);
      }, 0);

    const totalOut = scheduledBills + periodSpending;

    const manualStart =
      period.startingBalanceOverride === '' || period.startingBalanceOverride == null
        ? null
        : numberOrZero(period.startingBalanceOverride);

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
      billsPaid: billsPaid,
      otherSpending: periodSpending,
      totalOut: totalOut,
      endingBalance: endingBalance,
      rollover: endingBalance,
      variance: variance
    };

    runningBalance = endingBalance;
    return result;
  });
}

function getSummary() {
  const bills = state.bills || [];
  const scheduleRows = getScheduleRows();
  const budgetRows = getBudgetRows();
  const activeBills = bills.filter(function (b) {
    return b.active;
  }).length;

  const next30 = scheduleRows.filter(function (r) {
    return !r.paid && r.daysUntilDue >= 0 && r.daysUntilDue <= 30;
  });

  const overdue = scheduleRows.filter(function (r) {
    return !r.paid && r.daysUntilDue < 0;
  });

  const today = getTodayISO();
  const currentPeriod =
    budgetRows.find(function (r) {
      return today >= r.windowStart && today <= r.windowEnd;
    }) || budgetRows[0] || null;

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
    next30Amount: next30.reduce(function (s, r) {
      return s + numberOrZero(r.amount);
    }, 0),
    overdueCount: overdue.length,
    overdueAmount: overdue.reduce(function (s, r) {
      return s + numberOrZero(r.amount);
    }, 0),
    monthlyRunRate,
    currentPeriod,
    nextBills: next30.slice(0, 8)
  };
}

function getBillsCsvRows() {
  return (state.bills || []).map(function (bill) {
    return {
      id: bill.id,
      name: bill.name,
      defaultAmount: bill.defaultAmount,
      frequency: bill.frequency,
      dueDay: bill.dueDay || '',
      anchorDate: bill.anchorDate || '',
      dueMonths: Array.isArray(bill.dueMonths) ? bill.dueMonths.join('|') : '',
      active: bill.active ? 'Yes' : 'No',
      notes: bill.notes || ''
    };
  });
}

function getPayPeriodsCsvRows() {
  return getBudgetRows().map(function (row) {
    return {
      id: row.id,
      payDate: row.payDate,
      windowStart: row.windowStart,
      windowEnd: row.windowEnd,
      startingBalance: row.startingBalance,
      startingBalanceOverride: row.startingBalanceOverride || '',
      income: row.income,
      deposits: row.deposits,
      billsScheduled: row.billsScheduled,
      billsPaid: row.billsPaid,
      otherSpending: row.otherSpending,
      totalOut: row.totalOut,
      endingBalance: row.endingBalance,
      rollover: row.rollover,
      bankBalance: row.bankBalance,
      variance: row.variance,
      reconciled: row.reconciled ? 'Yes' : 'No'
    };
  });
}

function getSpendingCsvRows() {
  return (state.spending || []).map(function (item) {
    const period = getPayPeriodForDate(item.date, state.payPeriods || []);
    return {
      id: item.id,
      payPeriodDate: period ? period.payDate : '',
      date: item.date,
      company: item.company,
      amount: item.amount,
      charged: item.charged ? 'Yes' : 'No',
      comments: item.comments || ''
    };
  });
}

function getDepositsCsvRows() {
  return (state.deposits || []).map(function (item) {
    const period = getPayPeriodForDate(item.date, state.payPeriods || []);
    return {
      id: item.id,
      payPeriodDate: period ? period.payDate : '',
      date: item.date,
      amount: item.amount,
      comments: item.comments || ''
    };
  });
}

function exportCsv(filename, rows) {
  const csv = toCsv(rows);
  if (!csv) {
    alert('There is no data to export yet.');
    return;
  }
  downloadText(filename, csv, 'text/csv;charset=utf-8;');
}

function updateBillField(id, field, value) {
  setState(function (currentState) {
    const copy = clone(currentState);
    const bill = copy.bills.find(function (b) {
      return b.id === id;
    });
    if (!bill) return copy;
    bill[field] = value;
    return copy;
  });
}

function updateScheduleMeta(key, patch) {
  setState(function (currentState) {
    const copy = clone(currentState);
    copy.scheduleMeta[key] = {
      ...(copy.scheduleMeta[key] || {}),
      ...patch
    };
    return copy;
  });
}

function updatePayPeriodField(id, field, value) {
  setState(function (currentState) {
    const copy = clone(currentState);
    const row = copy.payPeriods.find(function (p) {
      return p.id === id;
    });
    if (!row) return copy;
    row[field] = value;
    return copy;
  });
}

function updateSpendingField(id, field, value) {
  setState(function (currentState) {
    const copy = clone(currentState);
    const row = copy.spending.find(function (p) {
      return p.id === id;
    });
    if (!row) return copy;
    row[field] = value;
    return copy;
  });
}

function updateDepositField(id, field, value) {
  setState(function (currentState) {
    const copy = clone(currentState);
    const row = copy.deposits.find(function (p) {
      return p.id === id;
    });
    if (!row) return copy;
    row[field] = value;
    return copy;
  });
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
  if (!el) return;

  el.innerHTML = TABS.map(function (tab) {
    return '<button class="tab-btn ' + (activeTab === tab.id ? 'active' : '') + '" data-tab="' + tab.id + '">' + tab.label + '</button>';
  }).join('');

  el.querySelectorAll('.tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      setTab(btn.dataset.tab);
    });
  });
}

function renderDashboard() {
  const summary = getSummary();
  const current = summary.currentPeriod;
  const hasBills = (state.bills || []).length > 0;
  const hasSpending = (state.spending || []).length > 0;
  const hasDeposits = (state.deposits || []).length > 0;
  const showWelcome = !hasBills && !hasSpending && !hasDeposits;

  const nextBillsHtml = summary.nextBills.length
    ? summary.nextBills.map(function (row) {
        return '<div class="next-item"><div>' + escapeHtml(formatDate(row.date)) + '</div><div>' + escapeHtml(row.billName) + '</div><div>' + escapeHtml(formatMoney(row.amount)) + '</div><div><span class="status ' + getStatusClass(row.status) + '">' + escapeHtml(row.status) + '</span></div></div>';
      }).join('')
    : '<div class="note-box">No bills due in the next 30 days right now.</div>';

  const welcomeHtml = showWelcome
    ? '<div class="panel"><div class="panel-body"><div class="empty-state"><h3>Welcome to BudgetFlow</h3><p>Start with the basics, add a bill, set your current pay period, then track extra spending and deposits as the period moves along.</p><div class="empty-state-steps"><div class="empty-state-step"><strong>1.</strong><span>Add your first recurring bill in the Bills tab.</span></div><div class="empty-state-step"><strong>2.</strong><span>Set your income and starting balance in Budget Tracker.</span></div><div class="empty-state-step"><strong>3.</strong><span>Use Other Spending and Deposits to track the rest of your cash flow.</span></div></div><div class="empty-state-actions"><button class="btn" id="welcomeAddBillBtn">Add your first bill</button><button class="ghost-btn" id="welcomeGoBudgetBtn">Go to Budget Tracker</button></div></div></div></div>'
    : '';

  const target = document.getElementById('tab-dashboard');
  if (!target) return;

  target.innerHTML =
    welcomeHtml +
    '<div class="stats"><div class="stat"><div class="label">Active bills</div><div class="value">' + summary.activeBills + '</div><div class="sub">Pulled from the Bills tab</div></div><div class="stat"><div class="label">Due in next 30 days</div><div class="value">' + summary.next30Count + '</div><div class="sub">' + formatMoney(summary.next30Amount) + '</div></div><div class="stat"><div class="label">Overdue</div><div class="value">' + summary.overdueCount + '</div><div class="sub">' + formatMoney(summary.overdueAmount) + '</div></div><div class="stat"><div class="label">Monthly run rate</div><div class="value">' + formatMoney(summary.monthlyRunRate) + '</div><div class="sub">Monthly plus converted recurring items</div></div></div>' +
    '<div class="grid-two"><div class="panel"><div class="panel-head"><div><h2>Current pay period snapshot</h2><p>The same biweekly flow as the workbook, just cleaner.</p></div></div><div class="panel-body">' +
      (current
        ? '<div class="stats" style="grid-template-columns: repeat(4, minmax(0, 1fr)); margin-bottom: 0;"><div class="stat"><div class="label">Pay date</div><div class="value" style="font-size:24px;">' + formatCompactDate(current.payDate) + '</div><div class="sub">' + formatCompactDate(current.windowStart) + ' to ' + formatCompactDate(current.windowEnd) + '</div></div><div class="stat"><div class="label">Bills scheduled</div><div class="value" style="font-size:24px;">' + formatMoney(current.billsScheduled) + '</div><div class="sub">Bills paid so far: ' + formatMoney(current.billsPaid) + '</div></div><div class="stat"><div class="label">Other spending</div><div class="value" style="font-size:24px;">' + formatMoney(current.otherSpending) + '</div><div class="sub">Deposits: ' + formatMoney(current.deposits) + '</div></div><div class="stat"><div class="label">Projected ending</div><div class="value" style="font-size:24px;">' + formatMoney(current.endingBalance) + '</div><div class="sub">Income: ' + formatMoney(current.income) + '</div></div></div>'
        : '<div class="note-box">No pay periods yet.</div>') +
      '</div></div><div class="panel"><div class="panel-head"><div><h2>Quick settings</h2><p>Fast access to your most used setup values.</p></div></div><div class="panel-body stack"><div><label class="muted" style="display:block;margin-bottom:8px;">Opening balance</label><input class="field" id="openingBalanceInput" type="number" step="0.01" value="' + state.settings.openingBalance + '" /></div><div><label class="muted" style="display:block;margin-bottom:8px;">Schedule horizon, months forward</label><input class="field" id="monthsForwardInput" type="number" min="1" max="24" value="' + state.settings.scheduleMonthsForward + '" /></div><div class="note-box">Use the full Settings tab for default income, CSV export, and new period preferences.</div></div></div></div>' +
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

  const welcomeAddBillBtn = document.getElementById('welcomeAddBillBtn');
  if (welcomeAddBillBtn) {
    welcomeAddBillBtn.addEventListener('click', function () {
      setState(function (currentState) {
        const copy = clone(currentState);
        copy.bills.push({
          id: makeId('bill'),
          name: 'New Bill',
          defaultAmount: 0,
          frequency: 'monthly',
          dueDay: 1,
          active: true,
          notes: ''
        });
        activeTab = 'bills';
        return copy;
      });
    });
  }

  const welcomeGoBudgetBtn = document.getElementById('welcomeGoBudgetBtn');
  if (welcomeGoBudgetBtn) {
    welcomeGoBudgetBtn.addEventListener('click', function () {
      activeTab = 'budget';
      renderApp();
    });
  }
}

function renderBills() {
  const billsEmpty = !(state.bills || []).length;
  const emptyHtml = billsEmpty
    ? '<div class="panel"><div class="panel-body"><div class="empty-state"><h3>No bills yet</h3><p>Add your recurring bills here so BudgetFlow can build your schedule and show what is coming up next.</p><div class="empty-state-actions"><button class="btn" id="emptyAddBillBtn">Add your first bill</button></div></div></div></div>'
    : '';

  const target = document.getElementById('tab-bills');
  if (!target) return;

  target.innerHTML =
    emptyHtml +
    '<div class="panel"><div class="panel-head"><div><h2>Bills</h2><p>Your recurring bill list.</p></div><div class="controls"><button class="btn" id="addBillBtn">Add bill</button></div></div><div class="panel-body">' +
      (billsEmpty ? '<div class="note-box">Once you add bills here, the Schedule tab will automatically map them out by due date.</div>' : '') +
      '<div class="table-wrap"><table><thead><tr><th>Name</th><th>Amount</th><th>Frequency</th><th>Due day</th><th>Anchor date</th><th>Due months</th><th>Active</th><th>Notes</th><th></th></tr></thead><tbody>' +
        (state.bills || []).map(function (bill) {
          return '<tr>' +
            '<td><input class="field bill-name" data-id="' + bill.id + '" value="' + escapeHtml(bill.name) + '" /></td>' +
            '<td><input class="field bill-amount" data-id="' + bill.id + '" type="number" step="0.01" value="' + bill.defaultAmount + '" /></td>' +
            '<td><select class="select bill-frequency" data-id="' + bill.id + '"><option value="monthly" ' + (bill.frequency === 'monthly' ? 'selected' : '') + '>Monthly</option><option value="biweekly" ' + (bill.frequency === 'biweekly' ? 'selected' : '') + '>Biweekly</option><option value="semiannual" ' + (bill.frequency === 'semiannual' ? 'selected' : '') + '>Semiannual</option></select></td>' +
            '<td><input class="field bill-due-day" data-id="' + bill.id + '" type="number" min="1" max="31" value="' + (bill.dueDay || '') + '" /></td>' +
            '<td><input class="field bill-anchor" data-id="' + bill.id + '" type="date" value="' + (bill.anchorDate || '') + '" /></td>' +
            '<td><input class="field bill-due-months" data-id="' + bill.id + '" placeholder="1,7" value="' + escapeHtml(Array.isArray(bill.dueMonths) ? bill.dueMonths.join(',') : '') + '" /></td>' +
            '<td><input class="bill-active" data-id="' + bill.id + '" type="checkbox" ' + (bill.active ? 'checked' : '') + ' /></td>' +
            '<td><input class="field bill-notes" data-id="' + bill.id + '" value="' + escapeHtml(bill.notes || '') + '" /></td>' +
            '<td><button class="danger-btn delete-bill" data-id="' + bill.id + '">Remove</button></td>' +
          '</tr>';
        }).join('') +
      '</tbody></table></div></div></div>';

  function addNewBill() {
    setState(function (currentState) {
      const copy = clone(currentState);
      copy.bills.push({
        id: makeId('bill'),
        name: 'New Bill',
        defaultAmount: 0,
        frequency: 'monthly',
        dueDay: 1,
        anchorDate: '',
        dueMonths: [],
        active: true,
        notes: ''
      });
      return copy;
    });
  }

  const addBillBtn = document.getElementById('addBillBtn');
  if (addBillBtn) addBillBtn.addEventListener('click', addNewBill);

  const emptyAddBillBtn = document.getElementById('emptyAddBillBtn');
  if (emptyAddBillBtn) emptyAddBillBtn.addEventListener('click', addNewBill);

  document.querySelectorAll('.bill-name').forEach(function (el) {
    el.addEventListener('change', function (e) {
      updateBillField(e.target.dataset.id, 'name', e.target.value);
    });
  });

  document.querySelectorAll('.bill-amount').forEach(function (el) {
    el.addEventListener('change', function (e) {
      updateBillField(e.target.dataset.id, 'defaultAmount', numberOrZero(e.target.value));
    });
  });

  document.querySelectorAll('.bill-frequency').forEach(function (el) {
    el.addEventListener('change', function (e) {
      updateBillField(e.target.dataset.id, 'frequency', e.target.value);
    });
  });

  document.querySelectorAll('.bill-due-day').forEach(function (el) {
    el.addEventListener('change', function (e) {
      updateBillField(e.target.dataset.id, 'dueDay', e.target.value === '' ? '' : numberOrZero(e.target.value));
    });
  });

  document.querySelectorAll('.bill-anchor').forEach(function (el) {
    el.addEventListener('change', function (e) {
      updateBillField(e.target.dataset.id, 'anchorDate', e.target.value);
    });
  });

  document.querySelectorAll('.bill-due-months').forEach(function (el) {
    el.addEventListener('change', function (e) {
      const months = e.target.value
        .split(',')
        .map(function (v) {
          return Number(v.trim());
        })
        .filter(function (v) {
          return Number.isInteger(v) && v >= 1 && v <= 12;
        });
      updateBillField(e.target.dataset.id, 'dueMonths', months);
    });
  });

  document.querySelectorAll('.bill-active').forEach(function (el) {
    el.addEventListener('change', function (e) {
      updateBillField(e.target.dataset.id, 'active', e.target.checked);
    });
  });

  document.querySelectorAll('.bill-notes').forEach(function (el) {
    el.addEventListener('change', function (e) {
      updateBillField(e.target.dataset.id, 'notes', e.target.value);
    });
  });

  document.querySelectorAll('.delete-bill').forEach(function (el) {
    el.addEventListener('click', function (e) {
      if (!window.confirm('Remove this bill?')) return;
      const id = e.target.dataset.id;
      setState(function (currentState) {
        const copy = clone(currentState);
        copy.bills = copy.bills.filter(function (b) {
          return b.id !== id;
        });
        return copy;
      });
    });
  });
}

function renderSchedule() {
  const rows = getFilteredScheduleRows();
  const hasBills = (state.bills || []).some(function (bill) {
    return bill.active;
  });

  const emptyHtml = !hasBills
    ? '<div class="panel"><div class="panel-body"><div class="empty-state"><h3>No active bills to schedule</h3><p>Add a bill and leave it active, then BudgetFlow will automatically place it on your schedule based on the due date or recurring pattern.</p><div class="empty-state-actions"><button class="btn" id="scheduleGoBillsBtn">Go to Bills</button></div></div></div></div>'
    : '';

  const target = document.getElementById('tab-schedule');
  if (!target) return;

  target.innerHTML =
    emptyHtml +
    '<div class="panel"><div class="panel-head"><div><h2>Schedule</h2><p>Generated from active bills, with paid tracking, custom amounts, and notes.</p></div><div class="controls"><input class="field inline-field" id="scheduleSearch" placeholder="Search bills" value="' + escapeHtml(scheduleSearch) + '" /><label class="checkbox-wrap"><input type="checkbox" id="next30OnlyToggle" ' + (next30Only ? 'checked' : '') + ' />Next 30 days only</label></div></div><div class="panel-body">' +
      (!hasBills ? '<div class="note-box">Your active bills will appear here automatically once they are added in the Bills tab.</div>' : '') +
      (hasBills && !rows.length ? '<div class="note-box">No schedule items match the current filters. Try turning off the next 30 days filter or clear the search box.</div>' : '') +
      '<div class="table-wrap"><table><thead><tr><th>Due date</th><th>Bill</th><th>Amount</th><th>Paid?</th><th>Paid date</th><th>Amount paid</th><th>Note</th><th>Days</th><th>Status</th></tr></thead><tbody>' +
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
  if (search) {
    search.addEventListener('input', function (e) {
      scheduleSearch = e.target.value;
      renderSchedule();
    });
  }

  const toggle = document.getElementById('next30OnlyToggle');
  if (toggle) {
    toggle.addEventListener('change', function (e) {
      next30Only = e.target.checked;
      renderSchedule();
    });
  }

  const scheduleGoBillsBtn = document.getElementById('scheduleGoBillsBtn');
  if (scheduleGoBillsBtn) {
    scheduleGoBillsBtn.addEventListener('click', function () {
      activeTab = 'bills';
      renderApp();
    });
  }

  document.querySelectorAll('.schedule-amount').forEach(function (el) {
    el.addEventListener('change', function (e) {
      updateScheduleMeta(e.target.dataset.key, { customAmount: numberOrZero(e.target.value) });
    });
  });

  document.querySelectorAll('.schedule-paid').forEach(function (el) {
    el.addEventListener('change', function (e) {
      updateScheduleMeta(e.target.dataset.key, {
        paid: e.target.checked,
        paidDate: e.target.checked ? getTodayISO() : ''
      });
    });
  });

  document.querySelectorAll('.schedule-paid-date').forEach(function (el) {
    el.addEventListener('change', function (e) {
      updateScheduleMeta(e.target.dataset.key, { paidDate: e.target.value });
    });
  });

  document.querySelectorAll('.schedule-amount-paid').forEach(function (el) {
    el.addEventListener('change', function (e) {
      updateScheduleMeta(e.target.dataset.key, { amountPaid: e.target.value });
    });
  });

  document.querySelectorAll('.schedule-note').forEach(function (el) {
    el.addEventListener('change', function (e) {
      updateScheduleMeta(e.target.dataset.key, { note: e.target.value });
    });
  });
}

function renderBudget() {
  const rows = getBudgetRows().slice().sort(function (a, b) {
    return b.payDate.localeCompare(a.payDate);
  });
  const today = getTodayISO();

  const noRealPeriods = rows.length === 1 &&
    (state.bills || []).length === 0 &&
    (state.spending || []).length === 0 &&
    (state.deposits || []).length === 0 &&
    numberOrZero(rows[0].income) === 0 &&
    numberOrZero(state.settings.openingBalance) === 0;

  function renderBudgetPeriod(row, options) {
    const openAttr = options && options.open ? ' open' : '';
    return '<details class="budget-period"' + openAttr + '><summary class="budget-summary"><div class="budget-summary-main"><h3>' + formatCompactDate(row.payDate) + ' pay period</h3><p class="muted">' + formatCompactDate(row.windowStart) + ' to ' + formatCompactDate(row.windowEnd) + '</p></div><div class="budget-kpis"><div class="budget-kpi"><div class="label">Income</div><div class="value">' + formatMoney(row.income) + '</div></div><div class="budget-kpi"><div class="label">Bills</div><div class="value">' + formatMoney(row.billsScheduled) + '</div></div><div class="budget-kpi"><div class="label">Spending</div><div class="value">' + formatMoney(row.otherSpending) + '</div></div><div class="budget-kpi"><div class="label">Leftover</div><div class="value">' + formatMoney(row.endingBalance) + '</div></div></div></summary><div class="budget-detail"><div class="table-wrap"><table><thead><tr><th>Pay date</th><th>Window</th><th>Starting balance</th><th>Income</th><th>Deposits</th><th>Bills scheduled</th><th>Bills paid</th><th>Other spending</th><th>Total out</th><th>Ending balance</th><th>Rollover</th><th>Bank balance</th><th>Variance</th><th>Reconciled?</th></tr></thead><tbody><tr><td><input class="field pay-date" data-id="' + row.id + '" type="date" value="' + row.payDate + '" /></td><td>' + formatCompactDate(row.windowStart) + ' to ' + formatCompactDate(row.windowEnd) + '</td><td><input class="field pay-starting-balance" data-id="' + row.id + '" type="number" step="0.01" value="' + escapeHtml(row.startingBalanceOverride === '' || row.startingBalanceOverride == null ? '' : row.startingBalanceOverride) + '" placeholder="' + row.startingBalance.toFixed(2) + '" /></td><td><input class="field pay-income" data-id="' + row.id + '" type="number" step="0.01" value="' + row.income + '" /></td><td>' + formatMoney(row.deposits) + '</td><td>' + formatMoney(row.billsScheduled) + '</td><td>' + formatMoney(row.billsPaid) + '</td><td>' + formatMoney(row.otherSpending) + '</td><td>' + formatMoney(row.totalOut) + '</td><td>' + formatMoney(row.endingBalance) + '</td><td>' + formatMoney(row.rollover) + '</td><td><input class="field pay-bank-balance" data-id="' + row.id + '" type="number" step="0.01" value="' + escapeHtml(row.bankBalance) + '" /></td><td>' + (row.variance === '' ? '—' : formatMoney(row.variance)) + '</td><td><input class="pay-reconciled" data-id="' + row.id + '" type="checkbox" ' + (row.reconciled ? 'checked' : '') + ' /></td></tr></tbody></table></div></div></details>';
  }

  const stackMarkup = rows.length
    ? rows.map(function (row) {
        const isCurrent = today >= row.windowStart && today <= row.windowEnd;
        return renderBudgetPeriod(row, { open: isCurrent });
      }).join('')
    : '<div class="note-box">No pay periods yet.</div>';

  const target = document.getElementById('tab-budget');
  if (!target) return;

  target.innerHTML =
    (noRealPeriods
      ? '<div class="panel"><div class="panel-body"><div class="empty-state"><h3>Start your first pay period</h3><p>BudgetFlow begins with one starter period. Set your income and opening balance here, then add more periods as time moves forward.</p><div class="empty-state-actions"><button class="btn" id="budgetFocusCurrentBtn">Set up current period</button></div></div></div></div>'
      : '') +
    '<div class="panel"><div class="panel-head"><div><h2>Budget Tracker</h2><p>Newest periods stay at the top, and the current period opens by default.</p></div><div class="controls"><button class="btn" id="addPayPeriodBtn">Start New Period</button></div></div><div class="panel-body"><div class="budget-stack">' + stackMarkup + '</div></div></div>';

  const add = document.getElementById('addPayPeriodBtn');
  if (add) {
    add.addEventListener('click', function () {
      setState(function (currentState) {
        const copy = clone(currentState);
        const sorted = copy.payPeriods.slice().sort(function (a, b) {
          return sortByDate(a.payDate, b.payDate);
        });
        const last = sorted[sorted.length - 1];
        const nextDate = last ? toISODate(addDays(parseISODate(last.payDate), 14)) : getTodayISO();
        const copyIncomeForward = copy.settings.copyPreviousIncome !== false;
        const fallbackIncome = numberOrZero(copy.settings.defaultIncome);
        let nextIncome = fallbackIncome;
        if (copyIncomeForward && last) nextIncome = numberOrZero(last.income);

        copy.payPeriods.push({
          id: makeId('period'),
          payDate: nextDate,
          income: nextIncome,
          bankBalance: '',
          reconciled: false,
          startingBalanceOverride: ''
        });

        return copy;
      });
    });
  }

  const budgetFocusCurrentBtn = document.getElementById('budgetFocusCurrentBtn');
  if (budgetFocusCurrentBtn) {
    budgetFocusCurrentBtn.addEventListener('click', function () {
      const firstDetails = document.querySelector('.budget-period');
      if (firstDetails) firstDetails.open = true;
    });
  }

  document.querySelectorAll('.pay-date').forEach(function (el) {
    el.addEventListener('change', function (e) {
      updatePayPeriodField(e.target.dataset.id, 'payDate', e.target.value);
    });
  });

  document.querySelectorAll('.pay-income').forEach(function (el) {
    el.addEventListener('change', function (e) {
      updatePayPeriodField(e.target.dataset.id, 'income', numberOrZero(e.target.value));
    });
  });

  document.querySelectorAll('.pay-starting-balance').forEach(function (el) {
    el.addEventListener('change', function (e) {
      updatePayPeriodField(e.target.dataset.id, 'startingBalanceOverride', e.target.value);
    });
  });

  document.querySelectorAll('.pay-bank-balance').forEach(function (el) {
    el.addEventListener('change', function (e) {
      updatePayPeriodField(e.target.dataset.id, 'bankBalance', e.target.value);
    });
  });

  document.querySelectorAll('.pay-reconciled').forEach(function (el) {
    el.addEventListener('change', function (e) {
      updatePayPeriodField(e.target.dataset.id, 'reconciled', e.target.checked);
    });
  });
}

function renderSpending() {
  const rows = (state.spending || []).slice().sort(function (a, b) {
    return sortByDate(a.date, b.date);
  });
  const payPeriods = (state.payPeriods || []).slice().sort(function (a, b) {
    return b.payDate.localeCompare(a.payDate);
  });

  const groups = payPeriods.map(function (period) {
    const start = period.payDate;
    const end = toISODate(addDays(parseISODate(period.payDate), 13));
    const items = rows.filter(function (item) {
      return item.date >= start && item.date <= end;
    });
    const total = items.reduce(function (sum, item) {
      return item.charged ? sum + numberOrZero(item.amount) : sum;
    }, 0);
    return { id: period.id, payDate: period.payDate, windowStart: start, windowEnd: end, items, total };
  });

  const outsideRange = rows.filter(function (item) {
    return !getPayPeriodForDate(item.date, payPeriods);
  });

  const hasAnySpending = rows.length > 0;
  const target = document.getElementById('tab-spending');
  if (!target) return;

  target.innerHTML =
    (!hasAnySpending
      ? '<div class="panel"><div class="panel-body"><div class="empty-state"><h3>No spending logged yet</h3><p>Track the extra purchases that happen inside each pay period. Use the add button on a period card to drop spending directly into the right place.</p><div class="empty-state-actions"><button class="btn" id="spendingGoBudgetBtn">Go to Budget Tracker</button></div></div></div></div>'
      : '') +
    '<div class="panel"><div class="panel-head"><div><h2>Other Spending</h2><p>Spending is grouped by each pay period so it is easier to track what belongs where.</p></div></div><div class="panel-body">' +
      (!hasAnySpending ? '<div class="note-box">Each pay period has its own add spending button, so your extra expenses stay organized by period.</div>' : '') +
      '<div class="period-list">' +
        groups.map(function (group) {
          return '<div class="period-card"><div class="period-head"><div><h3>' + formatCompactDate(group.payDate) + ' pay period</h3><p class="muted">' + formatCompactDate(group.windowStart) + ' to ' + formatCompactDate(group.windowEnd) + '</p></div><div class="controls"><div class="muted">Tracked spending: ' + formatMoney(group.total) + '</div><button class="mini-btn add-spending-for-period" data-period-id="' + group.id + '">+ Add spending</button></div></div>' +
            (group.items.length
              ? '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Company</th><th>Amount</th><th>Charged?</th><th>Comments</th><th></th></tr></thead><tbody>' +
                  group.items.map(function (item) {
                    return '<tr><td><input class="field spend-date" data-id="' + item.id + '" type="date" value="' + item.date + '" /></td><td><input class="field spend-company" data-id="' + item.id + '" value="' + escapeHtml(item.company) + '" /></td><td><input class="field spend-amount" data-id="' + item.id + '" type="number" step="0.01" value="' + item.amount + '" /></td><td><input class="spend-charged" data-id="' + item.id + '" type="checkbox" ' + (item.charged ? 'checked' : '') + ' /></td><td><input class="field spend-comments" data-id="' + item.id + '" value="' + escapeHtml(item.comments || '') + '" /></td><td><button class="danger-btn delete-spend" data-id="' + item.id + '">Remove</button></td></tr>';
                  }).join('') +
                '</tbody></table></div>'
              : '<div class="note-box">No extra spending added for this pay period yet.</div>') +
          '</div>';
        }).join('') +
        (outsideRange.length
          ? '<div class="period-card"><div class="period-head"><div><h3>Outside current pay periods</h3><p class="muted">These entries do not currently land inside one of the pay period windows.</p></div></div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Company</th><th>Amount</th><th>Charged?</th><th>Comments</th><th></th></tr></thead><tbody>' +
              outsideRange.map(function (item) {
                return '<tr><td><input class="field spend-date" data-id="' + item.id + '" type="date" value="' + item.date + '" /></td><td><input class="field spend-company" data-id="' + item.id + '" value="' + escapeHtml(item.company) + '" /></td><td><input class="field spend-amount" data-id="' + item.id + '" type="number" step="0.01" value="' + item.amount + '" /></td><td><input class="spend-charged" data-id="' + item.id + '" type="checkbox" ' + (item.charged ? 'checked' : '') + ' /></td><td><input class="field spend-comments" data-id="' + item.id + '" value="' + escapeHtml(item.comments || '') + '" /></td><td><button class="danger-btn delete-spend" data-id="' + item.id + '">Remove</button></td></tr>';
              }).join('') +
            '</tbody></table></div></div>'
          : '') +
      '</div></div></div>';

  const spendingGoBudgetBtn = document.getElementById('spendingGoBudgetBtn');
  if (spendingGoBudgetBtn) {
    spendingGoBudgetBtn.addEventListener('click', function () {
      activeTab = 'budget';
      renderApp();
    });
  }

  document.querySelectorAll('.add-spending-for-period').forEach(function (el) {
    el.addEventListener('click', function (e) {
      const periodId = e.target.dataset.periodId;
      const period = (state.payPeriods || []).find(function (p) {
        return p.id === periodId;
      });
      if (!period) return;

      setState(function (currentState) {
        const copy = clone(currentState);
        copy.spending.push({
          id: makeId('sp'),
          date: period.payDate,
          company: '',
          amount: 0,
          charged: true,
          comments: ''
        });
        return copy;
      });
    });
  });

  document.querySelectorAll('.spend-date').forEach(function (el) {
    el.addEventListener('change', function (e) {
      updateSpendingField(e.target.dataset.id, 'date', e.target.value);
    });
  });

  document.querySelectorAll('.spend-company').forEach(function (el) {
    el.addEventListener('change', function (e) {
      updateSpendingField(e.target.dataset.id, 'company', e.target.value);
    });
  });

  document.querySelectorAll('.spend-amount').forEach(function (el) {
    el.addEventListener('change', function (e) {
      updateSpendingField(e.target.dataset.id, 'amount', numberOrZero(e.target.value));
    });
  });

  document.querySelectorAll('.spend-charged').forEach(function (el) {
    el.addEventListener('change', function (e) {
      updateSpendingField(e.target.dataset.id, 'charged', e.target.checked);
    });
  });

  document.querySelectorAll('.spend-comments').forEach(function (el) {
    el.addEventListener('change', function (e) {
      updateSpendingField(e.target.dataset.id, 'comments', e.target.value);
    });
  });

  document.querySelectorAll('.delete-spend').forEach(function (el) {
    el.addEventListener('click', function (e) {
      if (!window.confirm('Remove this spending row?')) return;
      const id = e.target.dataset.id;
      setState(function (currentState) {
        const copy = clone(currentState);
        copy.spending = copy.spending.filter(function (item) {
          return item.id !== id;
        });
        return copy;
      });
    });
  });
}

function renderDeposits() {
  const rows = (state.deposits || []).slice().sort(function (a, b) {
    return sortByDate(a.date, b.date);
  });
  const payPeriods = (state.payPeriods || []).slice().sort(function (a, b) {
    return b.payDate.localeCompare(a.payDate);
  });

  const groups = payPeriods.map(function (period) {
    const start = period.payDate;
    const end = toISODate(addDays(parseISODate(period.payDate), 13));
    const items = rows.filter(function (item) {
      return item.date >= start && item.date <= end;
    });
    const total = items.reduce(function (sum, item) {
      return sum + numberOrZero(item.amount);
    }, 0);
    return {
      id: period.id,
      payDate: period.payDate,
      windowStart: start,
      windowEnd: end,
      items: items,
      total: total
    };
  });

  const outsideRange = rows.filter(function (item) {
    return !getPayPeriodForDate(item.date, payPeriods);
  });

  const hasAnyDeposits = rows.length > 0;
  const target = document.getElementById('tab-deposits');
  if (!target) return;

  target.innerHTML =
    (!hasAnyDeposits
      ? '<div class="panel"><div class="panel-body"><div class="empty-state"><h3>No deposits logged yet</h3><p>Track extra money coming in during each pay period, like side income, reimbursements, or transfers.</p><div class="empty-state-actions"><button class="btn" id="depositsGoBudgetBtn">Go to Budget Tracker</button></div></div></div></div>'
      : '') +
    '<div class="panel"><div class="panel-head"><div><h2>Deposits</h2><p>Deposits are grouped by pay period so they roll into your cash flow cleanly.</p></div></div><div class="panel-body">' +
      (!hasAnyDeposits ? '<div class="note-box">Each pay period has its own add deposit button, so extra money can be tracked where it belongs.</div>' : '') +
      '<div class="period-list">' +
        groups.map(function (group) {
          return '<div class="period-card"><div class="period-head"><div><h3>' + formatCompactDate(group.payDate) + ' pay period</h3><p class="muted">' + formatCompactDate(group.windowStart) + ' to ' + formatCompactDate(group.windowEnd) + '</p></div><div class="controls"><div class="muted">Tracked deposits: ' + formatMoney(group.total) + '</div><button class="mini-btn add-deposit-for-period" data-period-id="' + group.id + '">+ Add deposit</button></div></div>' +
            (group.items.length
              ? '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Amount</th><th>Comments</th><th></th></tr></thead><tbody>' +
                  group.items.map(function (item) {
                    return '<tr><td><input class="field deposit-date" data-id="' + item.id + '" type="date" value="' + item.date + '" /></td><td><input class="field deposit-amount" data-id="' + item.id + '" type="number" step="0.01" value="' + item.amount + '" /></td><td><input class="field deposit-comments" data-id="' + item.id + '" value="' + escapeHtml(item.comments || '') + '" /></td><td><button class="danger-btn delete-deposit" data-id="' + item.id + '">Remove</button></td></tr>';
                  }).join('') +
                '</tbody></table></div>'
              : '<div class="note-box">No deposits added for this pay period yet.</div>') +
          '</div>';
        }).join('') +
        (outsideRange.length
          ? '<div class="period-card"><div class="period-head"><div><h3>Outside current pay periods</h3><p class="muted">These deposits do not currently land inside one of the pay period windows.</p></div></div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Amount</th><th>Comments</th><th></th></tr></thead><tbody>' +
              outsideRange.map(function (item) {
                return '<tr><td><input class="field deposit-date" data-id="' + item.id + '" type="date" value="' + item.date + '" /></td><td><input class="field deposit-amount" data-id="' + item.id + '" type="number" step="0.01" value="' + item.amount + '" /></td><td><input class="field deposit-comments" data-id="' + item.id + '" value="' + escapeHtml(item.comments || '') + '" /></td><td><button class="danger-btn delete-deposit" data-id="' + item.id + '">Remove</button></td></tr>';
              }).join('') +
            '</tbody></table></div></div>'
          : '') +
      '</div></div></div>';

  const depositsGoBudgetBtn = document.getElementById('depositsGoBudgetBtn');
  if (depositsGoBudgetBtn) {
    depositsGoBudgetBtn.addEventListener('click', function () {
      activeTab = 'budget';
      renderApp();
    });
  }

  document.querySelectorAll('.add-deposit-for-period').forEach(function (el) {
    el.addEventListener('click', function (e) {
      const periodId = e.target.dataset.periodId;
      const period = (state.payPeriods || []).find(function (p) {
        return p.id === periodId;
      });
      if (!period) return;

      setState(function (currentState) {
        const copy = clone(currentState);
        copy.deposits.push({
          id: makeId('dep'),
          date: period.payDate,
          amount: 0,
          comments: ''
        });
        return copy;
      });
    });
  });

  document.querySelectorAll('.deposit-date').forEach(function (el) {
    el.addEventListener('change', function (e) {
      updateDepositField(e.target.dataset.id, 'date', e.target.value);
    });
  });

  document.querySelectorAll('.deposit-amount').forEach(function (el) {
    el.addEventListener('change', function (e) {
      updateDepositField(e.target.dataset.id, 'amount', numberOrZero(e.target.value));
    });
  });

  document.querySelectorAll('.deposit-comments').forEach(function (el) {
    el.addEventListener('change', function (e) {
      updateDepositField(e.target.dataset.id, 'comments', e.target.value);
    });
  });

  document.querySelectorAll('.delete-deposit').forEach(function (el) {
    el.addEventListener('click', function (e) {
      if (!window.confirm('Remove this deposit row?')) return;
      const id = e.target.dataset.id;
      setState(function (currentState) {
        const copy = clone(currentState);
        copy.deposits = copy.deposits.filter(function (item) {
          return item.id !== id;
        });
        return copy;
      });
    });
  });
}

function renderSettings() {
  const target = document.getElementById('tab-settings');
  if (!target) return;

  target.innerHTML =
    '<div class="grid-two">' +
      '<div class="panel"><div class="panel-head"><div><h2>App settings</h2><p>Control the defaults used when new periods and schedules are created.</p></div></div><div class="panel-body stack">' +
        '<div><label class="muted" style="display:block;margin-bottom:8px;">Opening balance</label><input class="field" id="settingsOpeningBalance" type="number" step="0.01" value="' + state.settings.openingBalance + '" /></div>' +
        '<div><label class="muted" style="display:block;margin-bottom:8px;">Schedule horizon, months forward</label><input class="field" id="settingsMonthsForward" type="number" min="1" max="24" value="' + state.settings.scheduleMonthsForward + '" /></div>' +
        '<div><label class="muted" style="display:block;margin-bottom:8px;">Default income for new periods</label><input class="field" id="settingsDefaultIncome" type="number" step="0.01" value="' + state.settings.defaultIncome + '" /></div>' +
        '<label class="checkbox-wrap"><input type="checkbox" id="settingsCopyPreviousIncome" ' + (state.settings.copyPreviousIncome ? 'checked' : '') + ' />Copy previous pay period income when starting a new one</label>' +
      '</div></div>' +

      '<div class="panel"><div class="panel-head"><div><h2>Export CSV</h2><p>Download your app data as CSV files for Excel or backup use.</p></div></div><div class="panel-body stack">' +
        '<button class="btn" id="exportBillsCsvBtn">Export bills CSV</button>' +
        '<button class="btn" id="exportBudgetCsvBtn">Export budget CSV</button>' +
        '<button class="btn" id="exportSpendingCsvBtn">Export spending CSV</button>' +
        '<button class="btn" id="exportDepositsCsvBtn">Export deposits CSV</button>' +
        '<div class="note-box">JSON backup keeps everything. CSV exports are better for reviewing data in spreadsheets.</div>' +
      '</div></div>' +
    '</div>';

  const settingsOpeningBalance = document.getElementById('settingsOpeningBalance');
  if (settingsOpeningBalance) {
    settingsOpeningBalance.addEventListener('change', function (e) {
      setState(function (currentState) {
        const copy = clone(currentState);
        copy.settings.openingBalance = numberOrZero(e.target.value);
        return copy;
      });
    });
  }

  const settingsMonthsForward = document.getElementById('settingsMonthsForward');
  if (settingsMonthsForward) {
    settingsMonthsForward.addEventListener('change', function (e) {
      setState(function (currentState) {
        const copy = clone(currentState);
        copy.settings.scheduleMonthsForward = Math.max(1, numberOrZero(e.target.value));
        return copy;
      });
    });
  }

  const settingsDefaultIncome = document.getElementById('settingsDefaultIncome');
  if (settingsDefaultIncome) {
    settingsDefaultIncome.addEventListener('change', function (e) {
      setState(function (currentState) {
        const copy = clone(currentState);
        copy.settings.defaultIncome = numberOrZero(e.target.value);
        return copy;
      });
    });
  }

  const settingsCopyPreviousIncome = document.getElementById('settingsCopyPreviousIncome');
  if (settingsCopyPreviousIncome) {
    settingsCopyPreviousIncome.addEventListener('change', function (e) {
      setState(function (currentState) {
        const copy = clone(currentState);
        copy.settings.copyPreviousIncome = e.target.checked;
        return copy;
      });
    });
  }

  const exportBillsCsvBtn = document.getElementById('exportBillsCsvBtn');
  if (exportBillsCsvBtn) {
    exportBillsCsvBtn.addEventListener('click', function () {
      exportCsv('budgetflow-bills.csv', getBillsCsvRows());
    });
  }

  const exportBudgetCsvBtn = document.getElementById('exportBudgetCsvBtn');
  if (exportBudgetCsvBtn) {
    exportBudgetCsvBtn.addEventListener('click', function () {
      exportCsv('budgetflow-budget.csv', getPayPeriodsCsvRows());
    });
  }

  const exportSpendingCsvBtn = document.getElementById('exportSpendingCsvBtn');
  if (exportSpendingCsvBtn) {
    exportSpendingCsvBtn.addEventListener('click', function () {
      exportCsv('budgetflow-spending.csv', getSpendingCsvRows());
    });
  }

  const exportDepositsCsvBtn = document.getElementById('exportDepositsCsvBtn');
  if (exportDepositsCsvBtn) {
    exportDepositsCsvBtn.addEventListener('click', function () {
      exportCsv('budgetflow-deposits.csv', getDepositsCsvRows());
    });
  }
}

function renderApp() {
  renderTabs();
  renderDashboard();
  renderBills();
  renderSchedule();
  renderBudget();
  renderSpending();
  renderDeposits();
  renderSettings();
  setTab(activeTab);
}

function wireGlobalActions() {
  const exportBtn = document.getElementById('exportBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', function () {
      downloadJson('budgetflow-backup.json', state);
    });
  }

  const importFile = document.getElementById('importFile');
  if (importFile) {
    importFile.addEventListener('change', function (e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function (event) {
        try {
          const parsed = JSON.parse(event.target.result);
          state = normalizeState(parsed);
          saveState();
          renderApp();
          alert('Backup imported.');
        } catch (err) {
          alert('That file could not be imported.');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });
  }

  const seedBtn = document.getElementById('seedBtn');
  if (seedBtn) {
    seedBtn.addEventListener('click', function () {
      if (!window.confirm('Reset the app and clear saved data?')) return;
      state = clone(defaultData);
      saveState();
      activeTab = 'dashboard';
      scheduleSearch = '';
      next30Only = true;
      renderApp();
    });
  }
}

wireGlobalActions();
renderApp();
