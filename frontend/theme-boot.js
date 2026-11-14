// theme-boot.js - puts the saved colour theme on EVERY page (Settings also does it through theme-manager.js).
// Only the theme the user chose is applied (the phone's dark mode alone does not change the app).
// The theme name is also kept in localStorage, only so the page does not flash in the default colours first;
// the real saved value is the one in AlishanDB.
(function () {
    var THEMES = [
        'light-default', 'light-warm', 'dark-deep', 'dark-blue', 'gold', 'purple', 'mint',
        'midnight-slate', 'forest-night', 'carbon-flame', 'ash-orange', 'ember-forge', 'deep-teal', 'arctic-teal',
        'red-inferno', 'royal-teal', 'github-dark', 'material-dark', 'teal-finance', 'rose-wine'
    ];
    function apply(name) {
        if (THEMES.indexOf(name) < 0) name = 'light-default';
        var list = document.documentElement.classList;
        THEMES.forEach(function (t) { list.remove('theme-' + t); });
        list.add('theme-' + name);
    }
    // the phone's status bar / browser bar takes the colour of the header of the chosen theme (nav.css: --nav-bg-a)
    function barColour() {
        var bar = document.querySelector('.site-topbar');
        if (!bar) return;
        var colour = getComputedStyle(bar).getPropertyValue('--nav-bg-a').trim();
        if (!colour) return;
        var meta = document.querySelector('meta[name="theme-color"]');
        if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
        meta.setAttribute('content', colour);
    }
    try { apply(localStorage.getItem('alishan-theme') || 'light-default'); } catch (e) { apply('light-default'); }
    function remember(name) { try { localStorage.setItem('alishan-theme', name); } catch (e) { /* private mode */ } }
    document.addEventListener('themeChanged', function (e) { remember(e.detail.theme); apply(e.detail.theme); barColour(); });
    document.addEventListener('DOMContentLoaded', function () {
        barColour();
        if (!window.AlishanDB || !AlishanDB.getTheme) return;
        AlishanDB.init().then(function () { return AlishanDB.getTheme('light-default'); })
            .then(function (name) { remember(name); apply(name); barColour(); })
            .catch(function () { /* keeps the remembered theme */ });
    });
})();
