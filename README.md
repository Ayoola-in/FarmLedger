# FarmLedger (Poultry Manager)

A complete Progressive Web Application (PWA) for poultry farm management, built with Vanilla HTML5, CSS3, and JavaScript.

## Features

- **Offline-First:** Built as a PWA with a Service Worker. Works completely offline.
- **Local Data Storage:** Uses IndexedDB to store data entirely on your device. No backend required.
- **Bird Management:** Track flocks, age, purchase costs, and current stock.
- **Egg Production:** Daily logs of total collected, broken, and dirty eggs.
- **Feed Management:** Record feed purchases, costs, and track remaining inventory.
- **Finance & Accounting:** Log sales (eggs, birds, etc.) and expenses. Automatically calculates net profit.
- **Reports & Charts:** Visual insights into egg production and finance using Chart.js.
- **Backup & Restore:** Export your database to a JSON file, or restore from an existing backup to avoid data loss when switching devices or clearing browser cache.

## Installation / Usage

1. Open `index.html` in a modern web browser.
2. For the best experience and to enable PWA installation, serve the directory using a local web server (e.g., using Python: `python -m http.server 8000`, or Node: `npx serve`).
3. Once hosted, navigate to the URL and click "Install" when prompted by your browser (usually an icon in the URL bar) to use FarmLedger as a native desktop/mobile application.

## Technologies Used

- **HTML5 & CSS3** (Glassmorphism design, native CSS variables)
- **Vanilla JavaScript (ES6+)**
- **IndexedDB** (Local Database)
- **Service Workers & Manifest.json** (PWA features)
- **Chart.js** (Data Visualization)

## Disclaimer

Because data is stored locally via `IndexedDB`, clearing your browser's site data will delete your farm records. **Regularly export your data** from the "Settings" page!
