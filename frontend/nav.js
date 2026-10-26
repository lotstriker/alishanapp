// nav.js — shared site-wide top nav toggle (hamburger <-> dropdown)
// Used by index.html, inventory.html, reports.html, setting.html.
document.addEventListener('DOMContentLoaded', function () {
    const menuToggle = document.getElementById('siteMenuToggle');
    const mobileNav = document.getElementById('siteMobileNav');

    if (!menuToggle || !mobileNav) return;

    function closeMenu() {
        mobileNav.classList.remove('active');
        const icon = menuToggle.querySelector('i');
        if (icon) {
            icon.classList.remove('fa-times');
            icon.classList.add('fa-bars');
        }
    }

    menuToggle.addEventListener('click', function (e) {
        e.stopPropagation();
        mobileNav.classList.toggle('active');
        const icon = menuToggle.querySelector('i');
        if (icon) {
            const isOpen = mobileNav.classList.contains('active');
            icon.classList.toggle('fa-bars', !isOpen);
            icon.classList.toggle('fa-times', isOpen);
        }
    });

    document.addEventListener('click', function (event) {
        if (
            mobileNav.classList.contains('active') &&
            !mobileNav.contains(event.target) &&
            !menuToggle.contains(event.target)
        ) {
            closeMenu();
        }
    });

    mobileNav.querySelectorAll('a').forEach(function (link) {
        link.addEventListener('click', closeMenu);
    });
});
