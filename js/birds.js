document.addEventListener('DOMContentLoaded', async () => {
    try {
        await window.initDB();
        loadFlocks();
    } catch (e) {
        console.error("DB Init failed", e);
    }

    const modal = document.getElementById('modal-add-flock');
    const btnAdd = document.getElementById('btn-add-flock');
    const btnCancel = document.getElementById('btn-cancel-flock');
    const form = document.getElementById('form-add-flock');

    btnAdd.addEventListener('click', () => {
        modal.style.display = 'flex';
    });

    btnCancel.addEventListener('click', () => {
        modal.style.display = 'none';
        form.reset();
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const flock = {
            name: document.getElementById('flock-name').value,
            breed: document.getElementById('flock-breed').value,
            source: document.getElementById('flock-source').value,
            purchaseDate: document.getElementById('flock-date').value,
            quantityPurchased: parseInt(document.getElementById('flock-qty').value),
            cost: parseFloat(document.getElementById('flock-cost').value) || 0,
            status: 'Active',
            birdsAlive: parseInt(document.getElementById('flock-qty').value)
        };

        try {
            await window.addRecord('flocks', flock);
            modal.style.display = 'none';
            form.reset();
            loadFlocks();
        } catch(err) {
            console.error("Error saving flock", err);
            alert("Could not save flock.");
        }
    });
});

async function loadFlocks() {
    const tableBody = document.getElementById('flocks-table-body');
    tableBody.innerHTML = '';
    
    try {
        const flocks = await window.getAllRecords('flocks');
        
        if(flocks.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No flocks registered yet.</td></tr>';
            return;
        }

        flocks.forEach(flock => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${flock.name}</td>
                <td>${flock.breed}</td>
                <td>${flock.purchaseDate}</td>
                <td>${flock.quantityPurchased}</td>
                <td>${flock.birdsAlive}</td>
                <td>
                    <button class="btn" style="padding: 5px 10px; font-size: 12px;" onclick="window.openFlockDetails(${flock.id})">View/Edit</button>
                </td>
            `;
            tableBody.appendChild(tr);
        });
    } catch(err) {
        console.error("Failed to load flocks", err);
    }
}

let currentFlockId = null;

document.addEventListener('DOMContentLoaded', () => {
    // Modal triggers
    document.getElementById('btn-close-view-flock').addEventListener('click', () => {
        document.getElementById('modal-view-flock').style.display = 'none';
    });

    // Sub-form toggles
    document.getElementById('btn-log-feed').addEventListener('click', () => {
        document.getElementById('subform-feed').style.display = 'block';
        document.getElementById('subform-expense').style.display = 'none';
        document.getElementById('subform-mortality').style.display = 'none';
        document.getElementById('log-feed-date').valueAsDate = new Date();
    });

    document.getElementById('btn-log-expense').addEventListener('click', () => {
        document.getElementById('subform-feed').style.display = 'none';
        document.getElementById('subform-expense').style.display = 'block';
        document.getElementById('subform-mortality').style.display = 'none';
        document.getElementById('log-expense-date').valueAsDate = new Date();
    });

    document.getElementById('btn-log-mortality').addEventListener('click', () => {
        document.getElementById('subform-feed').style.display = 'none';
        document.getElementById('subform-expense').style.display = 'none';
        document.getElementById('subform-mortality').style.display = 'block';
        document.getElementById('log-mortality-date').valueAsDate = new Date();
    });

    // Form Submissions
    document.getElementById('form-log-feed').addEventListener('submit', async (e) => {
        e.preventDefault();
        const qty = parseFloat(document.getElementById('log-feed-qty').value);
        
        // Calculate global avg cost
        const feedInv = await window.getAllRecords('feed_inventory');
        const totalCost = feedInv.reduce((acc, f) => acc + (f.totalCost || 0), 0);
        const totalKg = feedInv.reduce((acc, f) => acc + (f.quantityKg || 0), 0);
        const avgCost = totalKg > 0 ? (totalCost / totalKg) : 0;
        
        const record = {
            date: document.getElementById('log-feed-date').value,
            type: 'FEED_CONSUMPTION',
            flockId: currentFlockId,
            quantityKg: qty,
            cost: qty * avgCost
        };
        
        await window.addRecord('daily_records', record);
        document.getElementById('subform-feed').style.display = 'none';
        document.getElementById('form-log-feed').reset();
        window.openFlockDetails(currentFlockId);
    });

    document.getElementById('form-log-expense').addEventListener('submit', async (e) => {
        e.preventDefault();
        const expense = {
            date: document.getElementById('log-expense-date').value,
            category: 'Flock Specific',
            flockId: currentFlockId,
            description: document.getElementById('log-expense-name').value,
            amount: parseFloat(document.getElementById('log-expense-amount').value)
        };
        
        await window.addRecord('expenses', expense);
        document.getElementById('subform-expense').style.display = 'none';
        document.getElementById('form-log-expense').reset();
        window.openFlockDetails(currentFlockId);
    });

    document.getElementById('form-log-mortality').addEventListener('submit', async (e) => {
        e.preventDefault();
        const qty = parseInt(document.getElementById('log-mortality-qty').value);
        
        const record = {
            date: document.getElementById('log-mortality-date').value,
            flockId: currentFlockId,
            quantity: qty,
            cause: document.getElementById('log-mortality-cause').value
        };
        
        await window.addRecord('mortality', record);
        
        // Update flock
        const flock = await window.getRecord('flocks', currentFlockId);
        flock.birdsAlive = Math.max(0, flock.birdsAlive - qty);
        await window.putRecord('flocks', flock);
        
        document.getElementById('subform-mortality').style.display = 'none';
        document.getElementById('form-log-mortality').reset();
        window.openFlockDetails(currentFlockId);
        loadFlocks(); // Update main table
    });
});

window.openFlockDetails = async (id) => {
    currentFlockId = id;
    
    try {
        const flock = await window.getRecord('flocks', id);
        if (!flock) return;
        
        document.getElementById('view-flock-name').innerText = `Flock: ${flock.name}`;
        
        // Age calculation
        const pDate = new Date(flock.purchaseDate);
        const today = new Date();
        const diffTime = Math.abs(today - pDate);
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        document.getElementById('detail-flock-age').innerText = diffDays;
        
        document.getElementById('detail-flock-alive').innerText = flock.birdsAlive;
        
        // Feed Costs
        const dailyRecords = await window.getAllRecords('daily_records');
        const feedCost = dailyRecords
            .filter(r => r.flockId === id && r.type === 'FEED_CONSUMPTION')
            .reduce((acc, r) => acc + (r.cost || 0), 0);
            
        // Other Expenses
        const expenses = await window.getAllRecords('expenses');
        const otherCost = expenses
            .filter(r => r.flockId === id)
            .reduce((acc, r) => acc + (r.amount || 0), 0);
            
        const totalSpent = flock.cost + feedCost + otherCost;
        
        const costPerBird = flock.birdsAlive > 0 ? (totalSpent / flock.birdsAlive) : 0;
        
        document.getElementById('detail-cost-initial').innerText = window.formatCurrency(flock.cost);
        document.getElementById('detail-cost-feed').innerText = window.formatCurrency(feedCost);
        document.getElementById('detail-cost-other').innerText = window.formatCurrency(otherCost);
        document.getElementById('detail-cost-total').innerText = window.formatCurrency(totalSpent);
        document.getElementById('detail-flock-cost-per-bird').innerText = window.formatCurrency(costPerBird);
        
        document.getElementById('modal-view-flock').style.display = 'flex';
    } catch(err) {
        console.error("Failed to load flock details", err);
    }
};
