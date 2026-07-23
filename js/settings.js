document.addEventListener('DOMContentLoaded', async () => {
    try {
        await window.initDB();
    } catch (e) {
        console.error("DB Init failed for settings", e);
    }

    // Export Data
    document.getElementById('btn-export').addEventListener('click', async () => {
        try {
            const data = {
                flocks: await window.getAllRecords('flocks'),
                daily_records: await window.getAllRecords('daily_records'),
                mortality: await window.getAllRecords('mortality'),
                feed_inventory: await window.getAllRecords('feed_inventory'),
                sales: await window.getAllRecords('sales'),
                expenses: await window.getAllRecords('expenses'),
                settings: await window.getAllRecords('settings')
            };

            const dataStr = JSON.stringify(data, null, 2);
            const blob = new Blob([dataStr], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            const dateStr = new Date().toISOString().split('T')[0];
            a.download = `FarmLedger_Backup_${dateStr}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch(err) {
            console.error("Export failed", err);
            alert("Failed to export data.");
        }
    });

    // Import Data
    const importInput = document.getElementById('file-import');
    document.getElementById('btn-import-trigger').addEventListener('click', () => {
        importInput.click();
    });

    importInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = JSON.parse(event.target.result);
                if (confirm("This will merge imported data into your current database. Proceed?")) {
                    // Very simple merge: add all imported items. 
                    // In a production app, we'd need collision handling.
                    if(data.flocks) for(const item of data.flocks) await addRecordWithoutId('flocks', item);
                    if(data.daily_records) for(const item of data.daily_records) await addRecordWithoutId('daily_records', item);
                    if(data.mortality) for(const item of data.mortality) await addRecordWithoutId('mortality', item);
                    if(data.feed_inventory) for(const item of data.feed_inventory) await addRecordWithoutId('feed_inventory', item);
                    if(data.sales) for(const item of data.sales) await addRecordWithoutId('sales', item);
                    if(data.expenses) for(const item of data.expenses) await addRecordWithoutId('expenses', item);
                    
                    alert("Data imported successfully!");
                }
            } catch(err) {
                console.error("Import failed", err);
                alert("Invalid backup file.");
            }
            importInput.value = ''; // Reset input
        };
        reader.readAsText(file);
    });

    // Clear Data
    document.getElementById('btn-clear-data').addEventListener('click', () => {
        if(confirm("WARNING: This will permanently delete ALL data. Are you sure?")) {
            if(confirm("Are you ABSOLUTELY sure? This cannot be undone.")) {
                const req = indexedDB.deleteDatabase('FarmLedgerDB');
                req.onsuccess = () => {
                    alert("Data deleted. Reloading application.");
                    window.location.reload();
                };
                req.onerror = () => {
                    alert("Failed to delete database.");
                };
                req.onblocked = () => {
                    alert("Database is blocked. Please close other tabs of this app.");
                };
            }
        }
    });
});

// Helper for import to remove auto-increment IDs to avoid collisions,
// or we keep them to maintain foreign key relations (flockId).
// For simplicity in this demo, we keep existing relations, though a true 
// import/restore would typically clear the DB first or handle ID mapping.
async function addRecordWithoutId(storeName, item) {
    // If you want to keep relations, you should delete the DB and re-insert with explicit IDs, 
    // but put() allows inserting with specific ID if keyPath is id.
    return window.putRecord(storeName, item);
}
