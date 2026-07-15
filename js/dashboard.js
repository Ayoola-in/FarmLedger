document.addEventListener('DOMContentLoaded', async () => {
    try {
        await window.initDB();
        console.log("Database initialized for dashboard");
        
        await loadDashboardMetrics();
    } catch (e) {
        console.error("Dashboard DB Init failed", e);
    }
});

async function loadDashboardMetrics() {
    try {
        // 1. Total Birds
        const flocks = await window.getAllRecords('flocks');
        const totalBirds = flocks.reduce((acc, f) => acc + (f.birdsAlive || 0), 0);
        document.getElementById('metric-total-birds').innerText = totalBirds;

        // 2. Eggs Today
        const dailyRecords = await window.getAllRecords('daily_records');
        const todayStr = new Date().toISOString().split('T')[0];
        const eggsToday = dailyRecords
            .filter(r => r.type === 'EGG_COLLECTION' && r.date === todayStr)
            .reduce((acc, r) => acc + (r.eggsCollected || 0), 0);
        document.getElementById('metric-eggs-today').innerText = eggsToday;

        // 3. Feed Stock
        const feedInv = await window.getAllRecords('feed_inventory');
        const feedStock = feedInv.reduce((acc, f) => acc + (f.quantityKg || 0), 0);
        document.getElementById('metric-feed-stock').innerText = feedStock.toFixed(1) + ' kg';

        // 4. Net Profit
        const sales = await window.getAllRecords('sales');
        const expenses = await window.getAllRecords('expenses');
        const rev = sales.reduce((acc, s) => acc + s.total, 0);
        const exp = expenses.reduce((acc, e) => acc + e.amount, 0);
        const netProfit = rev - exp;
        const profitEl = document.getElementById('metric-net-profit');
        profitEl.innerText = window.formatCurrency(netProfit);
        profitEl.style.color = netProfit >= 0 ? 'var(--accent-color)' : '#e53935';

        // 5. Egg Chart (Last 7 Days)
        renderEggChart(dailyRecords);

        // 6. Finance Chart (Revenue vs Expenses)
        renderFinanceChart(sales, expenses);

    } catch(err) {
        console.error("Error loading dashboard metrics", err);
    }
}

function renderEggChart(dailyRecords) {
    const ctx = document.getElementById('eggChart');
    if (!ctx) return;
    
    const eggRecords = dailyRecords.filter(r => r.type === 'EGG_COLLECTION');
    const labels = [];
    const data = [];
    
    // Generate last 7 days
    for(let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        labels.push(d.toLocaleDateString('en-US', { weekday: 'short' }));
        
        const dayTotal = eggRecords
            .filter(r => r.date === dateStr)
            .reduce((acc, r) => acc + (r.eggsCollected || 0), 0);
        data.push(dayTotal);
    }

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Eggs Collected',
                data: data,
                borderColor: '#2e7d32',
                backgroundColor: 'rgba(46, 125, 50, 0.2)',
                tension: 0.3,
                fill: true
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function renderFinanceChart(sales, expenses) {
    const ctx = document.getElementById('financeChart');
    if (!ctx) return;
    
    const labels = [];
    const revData = [];
    const expData = [];
    
    // Generate last 7 days
    for(let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        labels.push(d.toLocaleDateString('en-US', { weekday: 'short' }));
        
        const dayRev = sales
            .filter(r => r.date === dateStr)
            .reduce((acc, r) => acc + (r.total || 0), 0);
        revData.push(dayRev);

        const dayExp = expenses
            .filter(r => r.date === dateStr)
            .reduce((acc, r) => acc + (r.amount || 0), 0);
        expData.push(dayExp);
    }

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Revenue',
                    data: revData,
                    backgroundColor: '#2e7d32'
                },
                {
                    label: 'Expenses',
                    data: expData,
                    backgroundColor: '#ffb300'
                }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}
