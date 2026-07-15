// Utility functions for formatting and calculations
const formatCurrency = (amount, currency = 'NGN') => {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: currency }).format(amount);
};

window.formatCurrency = formatCurrency;
