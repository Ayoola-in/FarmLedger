document.addEventListener('DOMContentLoaded', async () => {
    try {
        await window.initDB();
        await loadFlocksForSelect();
        loadEggRecords();
    } catch (e) {
        console.error("DB Init failed", e);
    }

    const modal = document.getElementById('modal-add-eggs');
    const btnAdd = document.getElementById('btn-add-eggs');
    const btnCancel = document.getElementById('btn-cancel-eggs');
    const form = document.getElementById('form-add-eggs');
    let editingEggId = null;
    
    // Default to today
    document.getElementById('egg-date').valueAsDate = new Date();

    btnAdd.addEventListener('click', () => {
        editingEggId = null;
        document.querySelector('#modal-add-eggs h2').textContent = 'Record Egg Collection';
        form.reset();
        document.getElementById('egg-date').valueAsDate = new Date();
        modal.style.display = 'flex';
    });

    btnCancel.addEventListener('click', () => {
        modal.style.display = 'none';
        form.reset();
        document.getElementById('egg-date').valueAsDate = new Date();
        editingEggId = null;
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const record = {
            date: document.getElementById('egg-date').value,
            flockId: document.getElementById('egg-flock').value,
            eggsCollected: parseInt(document.getElementById('egg-total').value),
            brokenEggs: parseInt(document.getElementById('egg-broken').value),
            dirtyEggs: parseInt(document.getElementById('egg-dirty').value)
        };
        
        // Also add logic to handle generic daily_records
        // A daily_record merges eggs, feed, birds lost, etc.
        const dailyRecord = {
            date: record.date,
            flockId: record.flockId,
            eggsCollected: record.eggsCollected,
            brokenEggs: record.brokenEggs,
            dirtyEggs: record.dirtyEggs,
            type: 'EGG_COLLECTION'
        };

        try {
            if (editingEggId) {
                const existingRecord = await window.getRecord('daily_records', editingEggId);
                if (existingRecord) {
                    existingRecord.date = dailyRecord.date;
                    existingRecord.flockId = dailyRecord.flockId;
                    existingRecord.eggsCollected = dailyRecord.eggsCollected;
                    existingRecord.brokenEggs = dailyRecord.brokenEggs;
                    existingRecord.dirtyEggs = dailyRecord.dirtyEggs;
                    await window.putRecord('daily_records', existingRecord);
                }
            } else {
                await window.addRecord('daily_records', dailyRecord);
            }

            modal.style.display = 'none';
            form.reset();
            document.getElementById('egg-date').valueAsDate = new Date();
            editingEggId = null;
            loadEggRecords();
        } catch(err) {
            console.error("Error saving egg record", err);
            alert("Could not save egg record.");
        }
    });

    window.editEggRecord = async (id) => {
        try {
            const record = await window.getRecord('daily_records', id);
            if (!record) return;
            editingEggId = id;
            document.querySelector('#modal-add-eggs h2').textContent = 'Edit Egg Collection';
            document.getElementById('egg-date').value = record.date;
            document.getElementById('egg-flock').value = record.flockId;
            document.getElementById('egg-total').value = record.eggsCollected;
            document.getElementById('egg-broken').value = record.brokenEggs || 0;
            document.getElementById('egg-dirty').value = record.dirtyEggs || 0;
            modal.style.display = 'flex';
        } catch (err) {
            console.error("Error loading record for edit", err);
        }
    };

    window.deleteEggRecord = async (id) => {
        if(confirm("Are you sure you want to delete this record?")) {
            try {
                await window.deleteRecord('daily_records', id);
                loadEggRecords();
            } catch (err) {
                console.error("Error deleting record", err);
                alert("Could not delete record.");
            }
        }
    };
});

async function loadFlocksForSelect() {
    const select = document.getElementById('egg-flock');
    select.innerHTML = '';
    try {
        const flocks = await window.getAllRecords('flocks');
        if(flocks.length === 0) {
            const opt = document.createElement('option');
            opt.value = "";
            opt.textContent = "No flocks available - please add one first";
            select.appendChild(opt);
            return;
        }
        flocks.forEach(flock => {
            const opt = document.createElement('option');
            opt.value = flock.id;
            opt.textContent = flock.name;
            select.appendChild(opt);
        });
    } catch(err) {
        console.error("Could not load flocks", err);
    }
}

async function loadEggRecords() {
    const tableBody = document.getElementById('eggs-table-body');
    tableBody.innerHTML = '';
    
    let totalToday = 0;
    let goodToday = 0;
    let badToday = 0;
    const todayStr = new Date().toISOString().split('T')[0];

    try {
        const records = await window.getAllRecords('daily_records');
        const eggRecords = records.filter(r => r.type === 'EGG_COLLECTION');
        
        if(eggRecords.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No egg records found.</td></tr>';
            document.getElementById('metric-eggs-today').innerText = '0';
            document.getElementById('metric-eggs-good').innerText = '0';
            document.getElementById('metric-eggs-bad').innerText = '0';
            return;
        }

        // Needs flock names
        const flocks = await window.getAllRecords('flocks');
        const flockMap = {};
        flocks.forEach(f => flockMap[f.id] = f.name);

        // Sort by date descending
        eggRecords.sort((a, b) => new Date(b.date) - new Date(a.date));

        eggRecords.forEach(record => {
            const bad = (record.brokenEggs || 0) + (record.dirtyEggs || 0);
            const good = record.eggsCollected - bad;

            if (record.date === todayStr) {
                totalToday += record.eggsCollected;
                goodToday += good;
                badToday += bad;
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${record.date}</td>
                <td>${flockMap[record.flockId] || 'Unknown Flock'}</td>
                <td>${record.eggsCollected}</td>
                <td>${good}</td>
                <td style="color: #e53935;">${bad}</td>
                <td>
                    <button class="btn btn-icon" onclick="window.editEggRecord(${record.id})" title="Edit"><i class="ph ph-pencil-simple"></i></button>
                    <button class="btn btn-icon" onclick="window.deleteEggRecord(${record.id})" title="Delete" style="color: #e53935;"><i class="ph ph-trash"></i></button>
                </td>
            `;
            tableBody.appendChild(tr);
        });

        document.getElementById('metric-eggs-today').innerText = totalToday;
        document.getElementById('metric-eggs-good').innerText = goodToday;
        document.getElementById('metric-eggs-bad').innerText = badToday;

    } catch(err) {
        console.error("Failed to load egg records", err);
    }
}
