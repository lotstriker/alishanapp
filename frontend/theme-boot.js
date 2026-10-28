// theme-boot.js - puts the saved colour theme on EVERY page (Settings also does it through theme-manager.js).
// Only the theme the user chose is applied (the phone's dark mode alone does not change the app).
// The theme name is also kept in localStorage, only so the page does not flash in the default colours first;
// the real saved value is the one in AlishanDB.
(function () {
    var THEMES = ['light-default', 'light-warm', 'dark-deep', 'dark-blue', 'gold', 'purple', 'mint'];
    function apply(name) {
        if (THEMES.indexOf(name) < 0) name = 'light-default';
        var list = document.documentElement.classList;
        THEMES.forEach(function (t) { list.remove('theme-' + t); });
        list.add('theme-' + name);
    }
    try { apply(localStorage.getItem('alishan-theme') || 'light-default'); } catch (e) { apply('light-default'); }
    function remember(name) { try { localStorage.setItem('alishan-theme', name); } catch (e) { /* private mode */ } }
    document.addEventListener('themeChanged', function (e) { remember(e.detail.theme); apply(e.detail.theme); });
    document.addEventListener('DOMContentLoaded', function () {
        if (!window.AlishanDB || !AlishanDB.getTheme) return;
        AlishanDB.init().then(function () { return AlishanDB.getTheme('light-default'); })
            .then(function (name) { remember(name); apply(name); })
            .catch(function () { /* keeps the remembered theme */ });
    });
})();
