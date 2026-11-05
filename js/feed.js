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
    let editingFeedId = null;
    
    // Default to today
    document.getElementById('feed-date').valueAsDate = new Date();

    btnAdd.addEventListener('click', () => {
        editingFeedId = null;
        document.querySelector('#modal-add-feed h2').textContent = 'Record Feed Purchase';
        form.reset();
        document.getElementById('feed-date').valueAsDate = new Date();
        modal.style.display = 'flex';
    });

    btnCancel.addEventListener('click', () => {
        modal.style.display = 'none';
        form.reset();
        document.getElementById('feed-date').valueAsDate = new Date();
        editingFeedId = null;
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
            if (editingFeedId) {
                const existingRecord = await window.getRecord('feed_inventory', editingFeedId);
                if (existingRecord) {
                    existingRecord.date = feed.date;
                    existingRecord.supplier = feed.supplier;
                    existingRecord.type = feed.type;
                    existingRecord.quantityKg = feed.quantityKg;
                    existingRecord.totalCost = feed.totalCost;
                    await window.putRecord('feed_inventory', existingRecord);
                }
            } else {
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
            }

            modal.style.display = 'none';
            form.reset();
            document.getElementById('feed-date').valueAsDate = new Date();
            editingFeedId = null;
            loadFeed();
        } catch(err) {
            console.error("Error saving feed", err);
            alert("Could not save feed purchase.");
        }
    });

    window.editFeedRecord = async (id) => {
        try {
            const record = await window.getRecord('feed_inventory', id);
            if (!record) return;
            editingFeedId = id;
            document.querySelector('#modal-add-feed h2').textContent = 'Edit Feed Purchase';
            document.getElementById('feed-date').value = record.date;
            document.getElementById('feed-supplier').value = record.supplier;
            document.getElementById('feed-type').value = record.type;
            document.getElementById('feed-qty').value = record.quantityKg;
            document.getElementById('feed-cost').value = record.totalCost;
            modal.style.display = 'flex';
        } catch (err) {
            console.error("Error loading record for edit", err);
        }
    };

    window.deleteFeedRecord = async (id) => {
        if(confirm("Are you sure you want to delete this record?")) {
            try {
                await window.deleteRecord('feed_inventory', id);
                loadFeed();
            } catch (err) {
                console.error("Error deleting record", err);
                alert("Could not delete record.");
            }
        }
    };
});

async function loadFeed() {
    const tableBody = document.getElementById('feed-table-body');
    tableBody.innerHTML = '';
    
    try {
        const feeds = await window.getAllRecords('feed_inventory');
        const summaryGrid = document.getElementById('feed-summary-grid');
        if (summaryGrid) summaryGrid.innerHTML = '';
        
        if(feeds.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No feed purchases recorded.</td></tr>';
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
                <td>
                    <button class="btn btn-icon" onclick="window.editFeedRecord(${feed.id})" title="Edit"><i class="ph ph-pencil-simple"></i></button>
                    <button class="btn btn-icon" onclick="window.deleteFeedRecord(${feed.id})" title="Delete" style="color: #e53935;"><i class="ph ph-trash"></i></button>
                </td>
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
