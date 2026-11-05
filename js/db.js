const dbName = 'FarmLedgerDB';
const dbVersion = 2;
let db;

const initDB = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, dbVersion);

        request.onerror = (event) => {
            console.error("Database error: " + event.target.errorCode);
            reject(event.target.errorCode);
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            // Create Object Stores (Tables)
            if (!db.objectStoreNames.contains('flocks')) {
                db.createObjectStore('flocks', { keyPath: 'id', autoIncrement: true });
            }
            if (!db.objectStoreNames.contains('daily_records')) {
                const store = db.createObjectStore('daily_records', { keyPath: 'id', autoIncrement: true });
                store.createIndex('date', 'date', { unique: false });
            }
            if (!db.objectStoreNames.contains('mortality')) {
                db.createObjectStore('mortality', { keyPath: 'id', autoIncrement: true });
            }
            if (!db.objectStoreNames.contains('feed_inventory')) {
                db.createObjectStore('feed_inventory', { keyPath: 'id', autoIncrement: true });
            }
            if (!db.objectStoreNames.contains('sales')) {
                db.createObjectStore('sales', { keyPath: 'id', autoIncrement: true });
            }
            if (!db.objectStoreNames.contains('expenses')) {
                db.createObjectStore('expenses', { keyPath: 'id', autoIncrement: true });
            }
            if (!db.objectStoreNames.contains('settings')) {
                db.createObjectStore('settings', { keyPath: 'key' });
            }
            if (!db.objectStoreNames.contains('vaccines')) {
                db.createObjectStore('vaccines', { keyPath: 'id', autoIncrement: true });
            }
        };
    });
};

// Generic CRUD Operations
const addRecord = (storeName, data) => {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.add(data);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

const getAllRecords = (storeName) => {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

const getRecord = (storeName, id) => {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(id);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

const putRecord = (storeName, item) => {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.put(item);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

const deleteRecord = (storeName, id) => {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

// Expose to window for easy access
window.initDB = initDB;
window.addRecord = addRecord;
window.getAllRecords = getAllRecords;
window.getRecord = getRecord;
window.putRecord = putRecord;
window.deleteRecord = deleteRecord;
