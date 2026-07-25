document.addEventListener('DOMContentLoaded', async () => {
    try {
        await window.initDB();
        loadFeed();
    } catch (e) {
        console.error("DB Init failed", e);
    }

    const modal = document.getElementById('modal-add-feed');
    const btnAdd = document.getElementById('btn-add-feed');
    const btnCancel = document.getElementById('btn-cancel-feed');
    const form = document.getElementById('form-add-feed');
    
    // Default to today
    document.getElementById('feed-date').valueAsDate = new Date();

    btnAdd.addEventListener('click', () => {
        modal.style.display = 'flex';
    });

    btnCancel.addEventListener('click', () => {
        modal.style.display = 'none';
        form.reset();
        document.getElementById('feed-date').valueAsDate = new Date();
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const feed = {
            date: document.getElementById('feed-date').value,
            supplier: document.getElementById('feed-supplier').value,
            type: document.getElementById('feed-type').value,
            quantityKg: parseFloat(document.getElementById('feed-qty').value),
            totalCost: parseFloat(document.getElementById('feed-cost').value)
        };

        try {
            await window.addRecord('feed_inventory', feed);
            
            // Also log it as an expense automatically
            const expense = {
                date: feed.date,
                category: 'Feed',
                amount: feed.totalCost,
                vendor: feed.supplier,
                description: `Purchased ${feed.quantityKg}kg of ${feed.type} feed`
            };
            await window.addRecord('expenses', expense);

            modal.style.display = 'none';
            form.reset();
            document.getElementById('feed-date').valueAsDate = new Date();
            loadFeed();
        } catch(err) {
            console.error("Error saving feed", err);
            alert("Could not save feed purchase.");
        }
    });
});

async function loadFeed() {
    const tableBody = document.getElementById('feed-table-body');
    tableBody.innerHTML = '';
    
    try {
        const feeds = await window.getAllRecords('feed_inventory');
        const summaryGrid = document.getElementById('feed-summary-grid');
        if (summaryGrid) summaryGrid.innerHTML = '';
        
        if(feeds.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No feed purchases recorded.</td></tr>';
            if (summaryGrid) {
                summaryGrid.innerHTML = '<div class="card glass-card"><h3>Total Feed Stock</h3><p class="metric">0 kg</p></div>';
            }
            return;
        }

        // Sort by date descending
        feeds.sort((a, b) => new Date(b.date) - new Date(a.date));

        const feedStats = {};

        feeds.forEach(feed => {
            const type = feed.type || 'Other';
            if (!feedStats[type]) feedStats[type] = { qtyPurchased: 0, value: 0, qtyConsumed: 0 };
            
            feedStats[type].qtyPurchased += feed.quantityKg;
            feedStats[type].value += feed.totalCost;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${feed.date}</td>
                <td>${feed.supplier}</td>
                <td>${feed.type}</td>
                <td>${feed.quantityKg.toFixed(1)}</td>
                <td>${window.formatCurrency(feed.totalCost)}</td>
            `;
            tableBody.appendChild(tr);
        });

        // Calculate consumed per type
        const dailyRecords = await window.getAllRecords('daily_records');
        dailyRecords.forEach(r => {
            if (r.type === 'FEED_CONSUMPTION') {
                const type = r.feedType || 'Other'; // Fallback for old records
                if (!feedStats[type]) feedStats[type] = { qtyPurchased: 0, value: 0, qtyConsumed: 0 };
                feedStats[type].qtyConsumed += (r.quantityKg || 0);
            }
        });

        if (summaryGrid) {
            for (const [type, stats] of Object.entries(feedStats)) {
                const currentStock = stats.qtyPurchased - stats.qtyConsumed;
                
                summaryGrid.innerHTML += `
                    <div class="card glass-card">
                        <h3>${type} Feed</h3>
                        <p class="metric">${currentStock.toFixed(1)} kg</p>
                    </div>
                `;
            }
        }

    } catch(err) {
        console.error("Failed to load feed", err);
    }
}
