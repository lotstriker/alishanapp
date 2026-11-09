/* Shared pagination UI used by Inventory and Reports. Each caller owns its own page/pageSize state. */
(function (global) {
  'use strict';
  const PAGE_SIZES = [10, 20, 50, 100];

  function render(host, config) {
    if (!host || !config) return;

    const total = Math.max(0, Number(config.total) || 0);
    const requestedSize = Number(config.pageSize);
    const pageSize = PAGE_SIZES.includes(requestedSize) ? requestedSize : 50;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const requestedPage = Number(config.page);
    const page = Math.min(totalPages, Math.max(1, Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1));

    host.classList.add('common-pagination');
    host.setAttribute('role', 'navigation');
    if (!host.hasAttribute('aria-label')) host.setAttribute('aria-label', 'Pagination');
    host.innerHTML = `
      <button class="btn btn-secondary" type="button" data-page-action="prev" aria-label="Previous page" title="Previous page" ${page <= 1 ? 'disabled' : ''}>
        <i class="fas fa-chevron-left" aria-hidden="true"></i><span class="pagination-label">Previous</span>
      </button>
      <span class="page-info" aria-live="polite" aria-atomic="true">Page ${page} of ${totalPages}</span>
      <button class="btn btn-secondary" type="button" data-page-action="next" aria-label="Next page" title="Next page" ${page >= totalPages ? 'disabled' : ''}>
        <span class="pagination-label">Next</span><i class="fas fa-chevron-right" aria-hidden="true"></i>
      </button>
      <select class="page-select" aria-label="Items per page" title="Items per page">
        ${PAGE_SIZES.map((n) => `<option value="${n}" ${n === pageSize ? 'selected' : ''}>${n} items</option>`).join('')}
      </select>`;

    host.style.display = total > pageSize ? 'flex' : 'none';
    host.onclick = (event) => {
      const target = event.target;
      const button = target && typeof target.closest === 'function' ? target.closest('[data-page-action]') : null;
      if (!button || button.disabled) return;
      const nextPage = button.dataset.pageAction === 'next'
        ? Math.min(totalPages, page + 1)
        : Math.max(1, page - 1);
      if (typeof config.onPageChange === 'function' && nextPage !== page) config.onPageChange(nextPage);
    };
    host.onchange = (event) => {
      const target = event.target;
      if (target && typeof target.matches === 'function' && target.matches('.page-select')) {
        const nextSize = Number(target.value);
        if (PAGE_SIZES.includes(nextSize) && typeof config.onPageSizeChange === 'function') {
          config.onPageSizeChange(nextSize);
        }
      }
    };
  }

  global.CommonPagination = { render, PAGE_SIZES: PAGE_SIZES.slice() };
})(window);
