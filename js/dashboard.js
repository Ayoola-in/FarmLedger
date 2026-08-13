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
        const totalPurchased = feedInv.reduce((acc, f) => acc + (f.quantityKg || 0), 0);
        const totalConsumed = dailyRecords
            .filter(r => r.type === 'FEED_CONSUMPTION')
            .reduce((acc, r) => acc + (r.quantityKg || 0), 0);
        const feedStock = totalPurchased - totalConsumed;
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
    const canvas = document.getElementById('eggChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
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

    const gradient = ctx.createLinearGradient(0, 0, 0, 350);
    gradient.addColorStop(0, 'rgba(16, 185, 129, 0.4)');
    gradient.addColorStop(1, 'rgba(16, 185, 129, 0.0)');

    new Chart(canvas, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Eggs Collected',
                data: data,
                borderColor: '#10b981',
                backgroundColor: gradient,
                borderWidth: 3,
                pointBackgroundColor: '#10b981',
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: '#10b981',
                pointRadius: 4,
                pointHoverRadius: 6,
                tension: 0.4,
                fill: true
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleFont: { family: 'Outfit', size: 13 },
                    bodyFont: { family: 'Outfit', size: 14, weight: 'bold' },
                    padding: 12,
                    cornerRadius: 8,
                    displayColors: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.05)', borderDash: [5, 5] },
                    ticks: { font: { family: 'Outfit' } }
                },
                x: {
                    grid: { display: false },
                    ticks: { font: { family: 'Outfit' } }
                }
            }
        }
    });
}

function renderFinanceChart(sales, expenses) {
    const canvas = document.getElementById('financeChart');
    if (!canvas) return;
    
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

    new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Revenue',
                    data: revData,
                    backgroundColor: '#10b981',
                    borderRadius: 6,
                    borderSkipped: false
                },
                {
                    label: 'Expenses',
                    data: expData,
                    backgroundColor: '#f59e0b',
                    borderRadius: 6,
                    borderSkipped: false
                }
            ]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { font: { family: 'Outfit' }, usePointStyle: true, pointStyle: 'circle' }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleFont: { family: 'Outfit', size: 13 },
                    bodyFont: { family: 'Outfit', size: 14 },
                    padding: 12,
                    cornerRadius: 8
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.05)', borderDash: [5, 5] },
                    ticks: { font: { family: 'Outfit' } }
                },
                x: {
                    grid: { display: false },
                    ticks: { font: { family: 'Outfit' } }
                }
            }
        }
    });
}
