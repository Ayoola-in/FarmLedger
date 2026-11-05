document.addEventListener('DOMContentLoaded', async () => {
    try {
        await window.initDB();
        loadFinanceData();
    } catch (e) {
        console.error("DB Init failed", e);
    }

    // Modal logic for Sales
    const modalSale = document.getElementById('modal-add-sale');
    const formSale = document.getElementById('form-add-sale');
    let editingSaleId = null;
    let editingExpenseId = null;

    document.getElementById('btn-add-sale').addEventListener('click', () => {
        editingSaleId = null;
        document.querySelector('#modal-add-sale h2').textContent = 'Record Sale';
        formSale.reset();
        document.getElementById('sale-date').valueAsDate = new Date();
        document.getElementById('sale-category').dispatchEvent(new Event('change'));
        modalSale.style.display = 'flex';
    });
    
    document.getElementById('sale-category').addEventListener('change', async (e) => {
        const flockGroup = document.getElementById('sale-flock-group');
        if (e.target.value === 'Bird Sales') {
            flockGroup.style.display = 'block';
            const flockSelect = document.getElementById('sale-flock');
            flockSelect.innerHTML = '<option value="">Select a flock...</option>';
            try {
                const flocks = await window.getAllRecords('flocks');
                flocks.filter(f => f.status === 'Active').forEach(f => {
                    const costPerBird = f.quantityPurchased > 0 ? (f.cost / f.quantityPurchased) : 0;
                    const opt = document.createElement('option');
                    opt.value = f.id;
                    opt.textContent = `${f.name} (${f.birdsAlive} alive) - Cost/Bird: ${window.formatCurrency(costPerBird)}`;
                    flockSelect.appendChild(opt);
                });
            } catch(err) {
                console.error('Error loading flocks for sale', err);
            }
        } else {
            flockGroup.style.display = 'none';
        }
    });

    document.getElementById('btn-cancel-sale').addEventListener('click', () => {
        modalSale.style.display = 'none';
        formSale.reset();
        editingSaleId = null;
    });

    formSale.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        let finalSaleTotal = parseFloat(document.getElementById('sale-total').value);

        if (document.getElementById('sale-category').value === 'Bird Sales') {
            const flockId = parseInt(document.getElementById('sale-flock').value);
            if (!flockId) {
                alert("Please select a flock.");
                return;
            }
            try {
                const flock = await window.getRecord('flocks', flockId);
                const qty = parseInt(document.getElementById('sale-qty').value) || 1;
                if (flock.birdsAlive < qty) {
                    alert(`Only ${flock.birdsAlive} birds available in this flock.`);
                    return;
                }
                const costPerBird = flock.quantityPurchased > 0 ? (flock.cost / flock.quantityPurchased) : 0;
                const costOfBirdsSold = costPerBird * qty;
                
                // Subtract cost from the sale total to get the profit
                finalSaleTotal = finalSaleTotal - costOfBirdsSold;
                
                // Deduct birds and update flock
                flock.birdsAlive -= qty;
                flock.quantityPurchased -= qty;
                flock.cost -= costOfBirdsSold;
                
                if (flock.birdsAlive <= 0) flock.status = 'Depleted';
                await window.putRecord('flocks', flock);

            } catch (err) {
                console.error("Error processing bird sale", err);
                return;
            }
        }

        const sale = {
            date: document.getElementById('sale-date').value,
            category: document.getElementById('sale-category').value,
            product: document.getElementById('sale-product').value,
            quantity: parseInt(document.getElementById('sale-qty').value) || 1,
            total: finalSaleTotal,
            customer: document.getElementById('sale-customer').value
        };

        if (document.getElementById('sale-category').value === 'Bird Sales') {
            sale.flockId = parseInt(document.getElementById('sale-flock').value);
        }

        try {
            if (editingSaleId) {
                const existingSale = await window.getRecord('sales', editingSaleId);
                if (existingSale) {
                    existingSale.date = sale.date;
                    existingSale.category = sale.category;
                    existingSale.product = sale.product;
                    existingSale.quantity = sale.quantity;
                    existingSale.total = sale.total;
                    existingSale.customer = sale.customer;
                    existingSale.flockId = sale.flockId;
                    await window.putRecord('sales', existingSale);
                }
            } else {
                await window.addRecord('sales', sale);
            }
            modalSale.style.display = 'none';
            formSale.reset();
            editingSaleId = null;
            loadFinanceData();
        } catch(err) {
            console.error("Error saving sale", err);
        }
    });

    window.editSaleRecord = async (id) => {
        try {
            const record = await window.getRecord('sales', id);
            if (!record) return;
            editingSaleId = id;
            document.querySelector('#modal-add-sale h2').textContent = 'Edit Sale';
            document.getElementById('sale-date').value = record.date;
            document.getElementById('sale-category').value = record.category;
            document.getElementById('sale-category').dispatchEvent(new Event('change'));
            
            setTimeout(() => {
                if (record.category === 'Bird Sales') {
                    document.getElementById('sale-flock').value = record.flockId;
                }
            }, 100);

            document.getElementById('sale-product').value = record.product;
            document.getElementById('sale-qty').value = record.quantity;
            
            let displayTotal = record.total;
            // Reverse engineering the display total if it was a bird sale is complex since it modified flock cost. 
            // We just populate it with the stored total for now.
            document.getElementById('sale-total').value = record.total;
            document.getElementById('sale-customer').value = record.customer;
            modalSale.style.display = 'flex';
        } catch (err) {
            console.error("Error loading record for edit", err);
        }
    };

    window.deleteSaleRecord = async (id) => {
        if(confirm("Are you sure you want to delete this sale? Note: If this is a Bird Sale, birds will not automatically be added back to the flock in this version.")) {
            try {
                await window.deleteRecord('sales', id);
                loadFinanceData();
            } catch (err) {
                console.error("Error deleting sale", err);
            }
        }
    };

    // Modal logic for Expenses
    const modalExpense = document.getElementById('modal-add-expense');
    const formExpense = document.getElementById('form-add-expense');
    document.getElementById('btn-add-expense').addEventListener('click', () => {
        editingExpenseId = null;
        document.querySelector('#modal-add-expense h2').textContent = 'Record Expense';
        formExpense.reset();
        document.getElementById('expense-date').valueAsDate = new Date();
        modalExpense.style.display = 'flex';
    });
    document.getElementById('btn-cancel-expense').addEventListener('click', () => {
        modalExpense.style.display = 'none';
        formExpense.reset();
        editingExpenseId = null;
    });

    formExpense.addEventListener('submit', async (e) => {
        e.preventDefault();
        const expense = {
            date: document.getElementById('expense-date').value,
            category: document.getElementById('expense-category').value,
            amount: parseFloat(document.getElementById('expense-amount').value),
            vendor: document.getElementById('expense-vendor').value,
            description: document.getElementById('expense-description').value
        };
        try {
            if (editingExpenseId) {
                const existingExp = await window.getRecord('expenses', editingExpenseId);
                if (existingExp) {
                    existingExp.date = expense.date;
                    existingExp.category = expense.category;
                    existingExp.amount = expense.amount;
                    existingExp.vendor = expense.vendor;
                    existingExp.description = expense.description;
                    await window.putRecord('expenses', existingExp);
                }
            } else {
                await window.addRecord('expenses', expense);
            }
            modalExpense.style.display = 'none';
            formExpense.reset();
            editingExpenseId = null;
            loadFinanceData();
        } catch(err) {
            console.error("Error saving expense", err);
        }
    });

    window.editExpenseRecord = async (id) => {
        try {
            const record = await window.getRecord('expenses', id);
            if (!record) return;
            editingExpenseId = id;
            document.querySelector('#modal-add-expense h2').textContent = 'Edit Expense';
            document.getElementById('expense-date').value = record.date;
            document.getElementById('expense-category').value = record.category;
            document.getElementById('expense-amount').value = record.amount;
            document.getElementById('expense-vendor').value = record.vendor || '';
            document.getElementById('expense-description').value = record.description || '';
            modalExpense.style.display = 'flex';
        } catch (err) {
            console.error("Error loading record for edit", err);
        }
    };

    window.deleteExpenseRecord = async (id) => {
        if(confirm("Are you sure you want to delete this expense?")) {
            try {
                await window.deleteRecord('expenses', id);
                loadFinanceData();
            } catch (err) {
                console.error("Error deleting expense", err);
            }
        }
    };
});

async function loadFinanceData() {
    let totalRevenue = 0;
    let totalExpenses = 0;

    try {
        const sales = await window.getAllRecords('sales');
        const expenses = await window.getAllRecords('expenses');

        const salesTable = document.getElementById('sales-table-body');
        salesTable.innerHTML = '';
        sales.sort((a, b) => new Date(b.date) - new Date(a.date));
        sales.slice(0, 10).forEach(sale => {
            totalRevenue += sale.total;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${sale.date}</td>
                <td>${sale.category}</td>
                <td style="color: #4caf50;">+${window.formatCurrency(sale.total)}</td>
                <td>
                    <button class="btn btn-icon" onclick="window.editSaleRecord(${sale.id})" title="Edit"><i class="ph ph-pencil-simple"></i></button>
                    <button class="btn btn-icon" onclick="window.deleteSaleRecord(${sale.id})" title="Delete" style="color: #e53935;"><i class="ph ph-trash"></i></button>
                </td>
            `;
            salesTable.appendChild(tr);
        });
        if(sales.length === 0) salesTable.innerHTML = '<tr><td colspan="4">No sales recorded.</td></tr>';

        // Calculate total for ALL sales, not just top 10
        totalRevenue = sales.reduce((acc, sale) => acc + sale.total, 0);

        const expTable = document.getElementById('expenses-table-body');
        expTable.innerHTML = '';
        expenses.sort((a, b) => new Date(b.date) - new Date(a.date));
        expenses.slice(0, 10).forEach(exp => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${exp.date}</td>
                <td>${exp.category}</td>
                <td style="color: #e53935;">-${window.formatCurrency(exp.amount)}</td>
                <td>
                    <button class="btn btn-icon" onclick="window.editExpenseRecord(${exp.id})" title="Edit"><i class="ph ph-pencil-simple"></i></button>
                    <button class="btn btn-icon" onclick="window.deleteExpenseRecord(${exp.id})" title="Delete" style="color: #e53935;"><i class="ph ph-trash"></i></button>
                </td>
            `;
            expTable.appendChild(tr);
        });
        if(expenses.length === 0) expTable.innerHTML = '<tr><td colspan="4">No expenses recorded.</td></tr>';

        // Calculate total for ALL expenses
        totalExpenses = expenses.reduce((acc, exp) => acc + exp.amount, 0);

        const netProfit = totalRevenue - totalExpenses;

        document.getElementById('metric-revenue').innerText = window.formatCurrency(totalRevenue);
        document.getElementById('metric-expenses').innerText = window.formatCurrency(totalExpenses);
        
        const profitEl = document.getElementById('metric-profit');
        profitEl.innerText = window.formatCurrency(netProfit);
        profitEl.style.color = netProfit >= 0 ? 'var(--accent-color)' : '#e53935';

    } catch(err) {
        console.error("Failed to load finance data", err);
    }
}
