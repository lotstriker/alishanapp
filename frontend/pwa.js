// pwa.js - starts the offline mode (sw.js) and shows a thin "Offline" strip when there is no connection.
// It changes nothing in the data: everything saved on this device keeps working.
(function () {
    var secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if ('serviceWorker' in navigator && secure) {
        window.addEventListener('load', function () {
            navigator.serviceWorker.register('sw.js').catch(function (e) {
                console.warn('Offline mode could not start:', e && e.message);
            });
        });
    }
    var style = document.createElement('style');
    style.textContent = '.is-offline body::before{content:"Offline: everything saved on this device still works";display:block;' +
        'position:sticky;top:0;z-index:2000;background:#b3261e;color:#fff;font:12px/1.3 system-ui,sans-serif;text-align:center;padding:3px 8px}';
    document.head.appendChild(style);
    function mark() { document.documentElement.classList.toggle('is-offline', !navigator.onLine); }
    window.addEventListener('online', mark);
    window.addEventListener('offline', mark);
    mark();
})();
