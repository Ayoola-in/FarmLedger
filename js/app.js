// Register Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js')
      .then(registration => {
        console.log('ServiceWorker registration successful with scope: ', registration.scope);
      }, err => {
        console.log('ServiceWorker registration failed: ', err);
      });
  });
}

// Theme Toggle Logic
document.addEventListener('DOMContentLoaded', () => {
    const themeToggle = document.getElementById('theme-toggle');
    if(themeToggle) {
        themeToggle.addEventListener('click', () => {
            if(document.body.classList.contains('dark-mode')) {
                document.body.classList.replace('dark-mode', 'light-mode');
                localStorage.setItem('theme', 'light-mode');
            } else {
                document.body.classList.replace('light-mode', 'dark-mode');
                localStorage.setItem('theme', 'dark-mode');
            }
        });
    }

    // Load saved theme
    const savedTheme = localStorage.getItem('theme');
    if(savedTheme) {
        document.body.className = savedTheme;
    }
});
