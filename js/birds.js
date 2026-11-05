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
    let editingFlockId = null;

    btnAdd.addEventListener('click', () => {
        editingFlockId = null;
        document.querySelector('#modal-add-flock h2').textContent = 'Register New Flock';
        form.reset();
        modal.style.display = 'flex';
    });

    btnCancel.addEventListener('click', () => {
        modal.style.display = 'none';
        form.reset();
        editingFlockId = null;
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
            if (editingFlockId) {
                const existing = await window.getRecord('flocks', editingFlockId);
                if (existing) {
                    const qtyDiff = flock.quantityPurchased - existing.quantityPurchased;
                    existing.name = flock.name;
                    existing.breed = flock.breed;
                    existing.source = flock.source;
                    existing.purchaseDate = flock.purchaseDate;
                    existing.quantityPurchased = flock.quantityPurchased;
                    existing.cost = flock.cost;
                    existing.birdsAlive = Math.max(0, existing.birdsAlive + qtyDiff);
                    await window.putRecord('flocks', existing);
                }
            } else {
                await window.addRecord('flocks', flock);
            }
            modal.style.display = 'none';
            form.reset();
            editingFlockId = null;
            loadFlocks();
        } catch(err) {
            console.error("Error saving flock", err);
            alert("Could not save flock.");
        }
    });

    window.editFlockRecord = async (id) => {
        try {
            const record = await window.getRecord('flocks', id);
            if (!record) return;
            editingFlockId = id;
            document.querySelector('#modal-add-flock h2').textContent = 'Edit Flock';
            document.getElementById('flock-name').value = record.name;
            document.getElementById('flock-breed').value = record.breed;
            document.getElementById('flock-source').value = record.source || '';
            document.getElementById('flock-date').value = record.purchaseDate;
            document.getElementById('flock-qty').value = record.quantityPurchased;
            document.getElementById('flock-cost').value = record.cost;
            modal.style.display = 'flex';
        } catch (err) {
            console.error("Error loading record for edit", err);
        }
    };

    window.deleteFlockRecord = async (id) => {
        if(confirm("Are you sure you want to delete this flock? This action does not delete associated eggs, feed, or finance records.")) {
            try {
                await window.deleteRecord('flocks', id);
                loadFlocks();
            } catch (err) {
                console.error("Error deleting flock", err);
            }
        }
    };
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
                    <button class="btn btn-icon" onclick="window.editFlockRecord(${flock.id})" title="Edit"><i class="ph ph-pencil-simple"></i></button>
                    <button class="btn btn-icon" onclick="window.deleteFlockRecord(${flock.id})" title="Delete" style="color: #e53935;"><i class="ph ph-trash"></i></button>
                    <button class="btn" style="padding: 5px 10px; font-size: 12px; margin-left: 5px;" onclick="window.openFlockDetails(${flock.id})">Details</button>
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

    // Sub-modal toggles
    document.getElementById('btn-log-feed').addEventListener('click', () => {
        document.getElementById('modal-log-feed').style.display = 'flex';
        document.getElementById('log-feed-date').valueAsDate = new Date();
    });

    document.getElementById('btn-log-expense').addEventListener('click', () => {
        document.getElementById('modal-log-expense').style.display = 'flex';
        document.getElementById('log-expense-date').valueAsDate = new Date();
    });

    document.getElementById('btn-log-mortality').addEventListener('click', () => {
        document.getElementById('modal-log-mortality').style.display = 'flex';
        document.getElementById('log-mortality-date').valueAsDate = new Date();
    });

    document.getElementById('btn-edit-flock-qty').addEventListener('click', () => {
        document.getElementById('modal-edit-qty').style.display = 'flex';
    });

    document.getElementById('btn-log-vaccine').addEventListener('click', () => {
        document.getElementById('modal-log-vaccine').style.display = 'flex';
        document.getElementById('log-vaccine-date').valueAsDate = new Date();
    });

    // Form Submissions
    document.getElementById('form-log-feed').addEventListener('submit', async (e) => {
        e.preventDefault();
        const qty = parseFloat(document.getElementById('log-feed-qty').value);
        const feedType = document.getElementById('log-feed-type').value;
        
        // Calculate avg cost and total purchased for this specific feed type
        const feedInv = await window.getAllRecords('feed_inventory');
        const typeFeeds = feedInv.filter(f => (f.type || 'Other') === feedType);
        
        const totalCost = typeFeeds.reduce((acc, f) => acc + (f.totalCost || 0), 0);
        const totalKg = typeFeeds.reduce((acc, f) => acc + (f.quantityKg || 0), 0);
        const avgCost = totalKg > 0 ? (totalCost / totalKg) : 0;
        
        // Calculate total consumed for this specific feed type
        const dailyRecords = await window.getAllRecords('daily_records');
        const typeConsumed = dailyRecords
            .filter(r => r.type === 'FEED_CONSUMPTION' && (r.feedType || 'Other') === feedType)
            .reduce((acc, r) => acc + (r.quantityKg || 0), 0);

        const currentStock = totalKg - typeConsumed;

        if (qty > currentStock) {
            alert(`Insufficient feed stock for ${feedType}. Available: ${currentStock.toFixed(1)} kg. Requested: ${qty} kg.`);
            return;
        }

        const record = {
            date: document.getElementById('log-feed-date').value,
            type: 'FEED_CONSUMPTION',
            feedType: feedType,
            flockId: currentFlockId,
            quantityKg: qty,
            cost: qty * avgCost
        };
        
        await window.addRecord('daily_records', record);
        document.getElementById('modal-log-feed').style.display = 'none';
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
        document.getElementById('modal-log-expense').style.display = 'none';
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
        
        document.getElementById('modal-log-mortality').style.display = 'none';
        document.getElementById('form-log-mortality').reset();
        window.openFlockDetails(currentFlockId);
        loadFlocks(); // Update main table
    });

    document.getElementById('form-edit-qty').addEventListener('submit', async (e) => {
        e.preventDefault();
        const newQty = parseInt(document.getElementById('edit-flock-qty').value);
        
        const flock = await window.getRecord('flocks', currentFlockId);
        const diff = newQty - flock.quantityPurchased;
        
        flock.quantityPurchased = newQty;
        flock.birdsAlive = Math.max(0, flock.birdsAlive + diff); // adjust alive by same difference
        
        await window.putRecord('flocks', flock);
        
        document.getElementById('modal-edit-qty').style.display = 'none';
        document.getElementById('form-edit-qty').reset();
        window.openFlockDetails(currentFlockId);
        loadFlocks(); // Update main table
    });

    document.getElementById('form-log-vaccine').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const vaccineRecord = {
            date: document.getElementById('log-vaccine-date').value,
            flockId: currentFlockId,
            type: document.getElementById('log-vaccine-type').value,
            cost: parseFloat(document.getElementById('log-vaccine-cost').value)
        };
        
        await window.addRecord('vaccines', vaccineRecord);
        
        // Also log as an expense
        const expense = {
            date: vaccineRecord.date,
            category: 'Vaccine',
            flockId: currentFlockId,
            description: `Vaccine: ${vaccineRecord.type}`,
            amount: vaccineRecord.cost
        };
        await window.addRecord('expenses', expense);
        
        document.getElementById('modal-log-vaccine').style.display = 'none';
        document.getElementById('form-log-vaccine').reset();
        window.openFlockDetails(currentFlockId);
    });
});

window.openFlockDetails = async (id) => {
    currentFlockId = id;
    
    try {
        const flock = await window.getRecord('flocks', id);
        if (!flock) return;
        
        document.getElementById('view-flock-name').innerText = `Flock: ${flock.name}`;
        document.getElementById('edit-flock-qty').value = flock.quantityPurchased;
        
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
            
        // Other Expenses (excluding vaccines which are a separate category now if we want, but earlier expenses might just be 'Flock Specific')
        const expenses = await window.getAllRecords('expenses');
        const otherCost = expenses
            .filter(r => r.flockId === id && r.category !== 'Vaccine')
            .reduce((acc, r) => acc + (r.amount || 0), 0);
            
        // Vaccines
        const vaccines = await window.getAllRecords('vaccines') || [];
        const vaccineCost = vaccines
            .filter(r => r.flockId === id)
            .reduce((acc, r) => acc + (r.cost || 0), 0);
            
        const totalSpent = flock.cost + feedCost + otherCost + vaccineCost;
        
        const costPerBird = flock.birdsAlive > 0 ? (totalSpent / flock.birdsAlive) : 0;
        
        document.getElementById('detail-cost-initial').innerText = window.formatCurrency(flock.cost);
        document.getElementById('detail-cost-feed').innerText = window.formatCurrency(feedCost);
        document.getElementById('detail-cost-other').innerText = window.formatCurrency(otherCost);
        if (document.getElementById('detail-cost-vaccine')) {
            document.getElementById('detail-cost-vaccine').innerText = window.formatCurrency(vaccineCost);
        }
        document.getElementById('detail-cost-total').innerText = window.formatCurrency(totalSpent);
        document.getElementById('detail-flock-cost-per-bird').innerText = window.formatCurrency(costPerBird);
        
        document.getElementById('modal-view-flock').style.display = 'flex';
    } catch(err) {
        console.error("Failed to load flock details", err);
    }
};
