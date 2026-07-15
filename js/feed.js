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
    
    let totalQty = 0;
    let totalValue = 0;

    try {
        const feeds = await window.getAllRecords('feed_inventory');
        
        if(feeds.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No feed purchases recorded.</td></tr>';
            document.getElementById('metric-feed-total').innerText = '0 kg';
            document.getElementById('metric-feed-value').innerText = window.formatCurrency(0);
            return;
        }

        // Sort by date descending
        feeds.sort((a, b) => new Date(b.date) - new Date(a.date));

        feeds.forEach(feed => {
            totalQty += feed.quantityKg;
            totalValue += feed.totalCost;

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

        document.getElementById('metric-feed-total').innerText = totalQty.toFixed(1) + ' kg';
        document.getElementById('metric-feed-value').innerText = window.formatCurrency(totalValue);

    } catch(err) {
        console.error("Failed to load feed", err);
    }
}
