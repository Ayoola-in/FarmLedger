    const modal = document.getElementById('modal-add-vaccine');
    const btnAdd = document.getElementById('btn-add-vaccine');
    const btnCancel = document.getElementById('btn-cancel-vaccine');
    const form = document.getElementById('form-add-vaccine');
    const flockSelect = document.getElementById('vaccine-flock');
    let editingVaccineId = null;

    document.addEventListener('DOMContentLoaded', async () => {
        try {
            await window.initDB();
            loadVaccines();

            // Populate flocks dropdown
            const flocks = await window.getAllRecords('flocks') || [];
            flocks.filter(f => f.status === 'Active').forEach(f => {
                const opt = document.createElement('option');
                opt.value = f.id;
                opt.textContent = `${f.name} (${f.breed})`;
                flockSelect.appendChild(opt);
            });
        } catch (e) {
            console.error("DB Init failed", e);
        }

        if(btnAdd) {
            btnAdd.addEventListener('click', () => {
                editingVaccineId = null;
                document.querySelector('#modal-add-vaccine h2').textContent = 'Record Vaccine';
                form.reset();
                modal.style.display = 'flex';
                document.getElementById('vaccine-date').valueAsDate = new Date();
            });
        }

        if(btnCancel) {
            btnCancel.addEventListener('click', () => {
                modal.style.display = 'none';
                form.reset();
                editingVaccineId = null;
            });
        }

        if(form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const vaccineRecord = {
                    date: document.getElementById('vaccine-date').value,
                    flockId: parseInt(document.getElementById('vaccine-flock').value),
                    type: document.getElementById('vaccine-type').value,
                    cost: parseFloat(document.getElementById('vaccine-cost').value)
                };
                
                try {
                    if (editingVaccineId) {
                        const existingRecord = await window.getRecord('vaccines', editingVaccineId);
                        if (existingRecord) {
                            existingRecord.date = vaccineRecord.date;
                            existingRecord.flockId = vaccineRecord.flockId;
                            existingRecord.type = vaccineRecord.type;
                            existingRecord.cost = vaccineRecord.cost;
                            await window.putRecord('vaccines', existingRecord);
                        }
                    } else {
                        await window.addRecord('vaccines', vaccineRecord);
                        
                        // Also log as an expense
                        const expense = {
                            date: vaccineRecord.date,
                            category: 'Vaccine',
                            flockId: vaccineRecord.flockId,
                            description: `Vaccine: ${vaccineRecord.type}`,
                            amount: vaccineRecord.cost
                        };
                        await window.addRecord('expenses', expense);
                    }
                    
                    modal.style.display = 'none';
                    form.reset();
                    editingVaccineId = null;
                    loadVaccines();
                } catch(err) {
                    console.error("Error saving vaccine", err);
                }
            });
        }

        window.editVaccineRecord = async (id) => {
            try {
                const record = await window.getRecord('vaccines', id);
                if (!record) return;
                editingVaccineId = id;
                document.querySelector('#modal-add-vaccine h2').textContent = 'Edit Vaccine';
                document.getElementById('vaccine-date').value = record.date;
                document.getElementById('vaccine-flock').value = record.flockId;
                document.getElementById('vaccine-type').value = record.type;
                document.getElementById('vaccine-cost').value = record.cost;
                modal.style.display = 'flex';
            } catch (err) {
                console.error("Error loading record for edit", err);
            }
        };

        window.deleteVaccineRecord = async (id) => {
            if(confirm("Are you sure you want to delete this vaccine record?")) {
                try {
                    await window.deleteRecord('vaccines', id);
                    loadVaccines();
                } catch (err) {
                    console.error("Error deleting record", err);
                }
            }
        };
    });

async function loadVaccines() {
    const tableBody = document.getElementById('vaccines-table-body');
    tableBody.innerHTML = '';
    
    let totalCost = 0;

    try {
        const vaccines = await window.getAllRecords('vaccines') || [];
        const flocks = await window.getAllRecords('flocks') || [];
        
        // Create a map of flock ID to flock name for quick lookup
        const flockMap = {};
        flocks.forEach(f => {
            flockMap[f.id] = f.name;
        });
        
        if(vaccines.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No vaccines recorded yet.</td></tr>';
            document.getElementById('metric-vaccine-total').innerText = window.formatCurrency(0);
            document.getElementById('metric-vaccine-count').innerText = 0;
            return;
        }

        // Sort by date descending
        vaccines.sort((a, b) => new Date(b.date) - new Date(a.date));

        vaccines.forEach(v => {
            totalCost += (v.cost || 0);

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${v.date}</td>
                <td>${flockMap[v.flockId] || 'Unknown Flock'}</td>
                <td>${v.type}</td>
                <td>${window.formatCurrency(v.cost)}</td>
                <td>
                    <button class="btn btn-icon" onclick="window.editVaccineRecord(${v.id})" title="Edit"><i class="ph ph-pencil-simple"></i></button>
                    <button class="btn btn-icon" onclick="window.deleteVaccineRecord(${v.id})" title="Delete" style="color: #e53935;"><i class="ph ph-trash"></i></button>
                </td>
            `;
            tableBody.appendChild(tr);
        });

        document.getElementById('metric-vaccine-total').innerText = window.formatCurrency(totalCost);
        document.getElementById('metric-vaccine-count').innerText = vaccines.length;

    } catch(err) {
        console.error("Failed to load vaccines", err);
    }
}
