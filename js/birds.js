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
                    <button class="btn" style="padding: 5px 10px; font-size: 12px;">View/Edit</button>
                </td>
            `;
            tableBody.appendChild(tr);
        });
    } catch(err) {
        console.error("Failed to load flocks", err);
    }
}
