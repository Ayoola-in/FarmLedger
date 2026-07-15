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
    document.getElementById('btn-add-sale').addEventListener('click', () => {
        document.getElementById('sale-date').valueAsDate = new Date();
        modalSale.style.display = 'flex';
    });
    document.getElementById('btn-cancel-sale').addEventListener('click', () => {
        modalSale.style.display = 'none';
        formSale.reset();
    });

    formSale.addEventListener('submit', async (e) => {
        e.preventDefault();
        const sale = {
            date: document.getElementById('sale-date').value,
            category: document.getElementById('sale-category').value,
            product: document.getElementById('sale-product').value,
            quantity: parseInt(document.getElementById('sale-qty').value) || 1,
            total: parseFloat(document.getElementById('sale-total').value),
            customer: document.getElementById('sale-customer').value
        };
        try {
            await window.addRecord('sales', sale);
            modalSale.style.display = 'none';
            formSale.reset();
            loadFinanceData();
        } catch(err) {
            console.error("Error saving sale", err);
        }
    });

    // Modal logic for Expenses
    const modalExpense = document.getElementById('modal-add-expense');
    const formExpense = document.getElementById('form-add-expense');
    document.getElementById('btn-add-expense').addEventListener('click', () => {
        document.getElementById('expense-date').valueAsDate = new Date();
        modalExpense.style.display = 'flex';
    });
    document.getElementById('btn-cancel-expense').addEventListener('click', () => {
        modalExpense.style.display = 'none';
        formExpense.reset();
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
            await window.addRecord('expenses', expense);
            modalExpense.style.display = 'none';
            formExpense.reset();
            loadFinanceData();
        } catch(err) {
            console.error("Error saving expense", err);
        }
    });
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
            `;
            salesTable.appendChild(tr);
        });
        if(sales.length === 0) salesTable.innerHTML = '<tr><td colspan="3">No sales recorded.</td></tr>';

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
            `;
            expTable.appendChild(tr);
        });
        if(expenses.length === 0) expTable.innerHTML = '<tr><td colspan="3">No expenses recorded.</td></tr>';

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
