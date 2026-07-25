document.addEventListener('DOMContentLoaded', async () => {
    try {
        await window.initDB();
        loadVaccines();
    } catch (e) {
        console.error("DB Init failed", e);
    }
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
            tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No vaccines recorded yet.</td></tr>';
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
            `;
            tableBody.appendChild(tr);
        });

        document.getElementById('metric-vaccine-total').innerText = window.formatCurrency(totalCost);
        document.getElementById('metric-vaccine-count').innerText = vaccines.length;

    } catch(err) {
        console.error("Failed to load vaccines", err);
    }
}
