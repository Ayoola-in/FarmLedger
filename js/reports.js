document.addEventListener('DOMContentLoaded', async () => {
    try {
        await window.initDB();
        await generateReport();
    } catch (e) {
        console.error("DB Init failed for reports", e);
    }
});

async function generateReport() {
    try {
        const sales = await window.getAllRecords('sales');
        const expenses = await window.getAllRecords('expenses');

        // Revenue Breakdown
        const revenueMap = {};
        let totalRev = 0;
        sales.forEach(s => {
            const cat = s.category || 'Other';
            revenueMap[cat] = (revenueMap[cat] || 0) + s.total;
            totalRev += s.total;
        });

        const revList = document.getElementById('revenue-list');
        revList.innerHTML = '';
        for (const [cat, amt] of Object.entries(revenueMap)) {
            const li = document.createElement('li');
            li.innerHTML = `<span>${cat}:</span> <span style="float:right;">${window.formatCurrency(amt)}</span>`;
            revList.appendChild(li);
        }
        document.getElementById('report-total-revenue').innerText = window.formatCurrency(totalRev);

        // Expense Breakdown
        const expenseMap = {};
        let totalExp = 0;
        expenses.forEach(e => {
            const cat = e.category || 'Other';
            expenseMap[cat] = (expenseMap[cat] || 0) + e.amount;
            totalExp += e.amount;
        });

        const expList = document.getElementById('expense-list');
        expList.innerHTML = '';
        for (const [cat, amt] of Object.entries(expenseMap)) {
            const li = document.createElement('li');
            li.innerHTML = `<span>${cat}:</span> <span style="float:right;">${window.formatCurrency(amt)}</span>`;
            expList.appendChild(li);
        }
        document.getElementById('report-total-expenses').innerText = window.formatCurrency(totalExp);

        // Net Profit
        const netProfit = totalRev - totalExp;
        const profitEl = document.getElementById('report-net-profit');
        profitEl.innerText = window.formatCurrency(netProfit);
        profitEl.style.color = netProfit >= 0 ? 'var(--accent-color)' : '#e53935';

        // Expense Chart
        renderExpenseChart(expenseMap);

    } catch (err) {
        console.error("Error generating report", err);
    }
}

function renderExpenseChart(expenseMap) {
    const ctx = document.getElementById('expenseChart');
    if (!ctx) return;
    
    const labels = Object.keys(expenseMap);
    const data = Object.values(expenseMap);

    // Fallback if no data
    if(labels.length === 0) {
        labels.push('No Expenses');
        data.push(1);
    }

    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: [
                    '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899'
                ],
                hoverOffset: 10,
                borderWidth: 2,
                borderColor: '#0f172a'
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: { 
                    position: 'bottom',
                    labels: { font: { family: 'Outfit' }, color: '#f1f5f9', usePointStyle: true, padding: 20 }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleFont: { family: 'Outfit', size: 13 },
                    bodyFont: { family: 'Outfit', size: 14, weight: 'bold' },
                    padding: 12,
                    cornerRadius: 8
                }
            }
        }
    });
}
