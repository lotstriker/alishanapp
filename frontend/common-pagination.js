/* Shared pagination UI used by Inventory and Reports. Each caller owns its own page/pageSize state. */
(function (global) {
  'use strict';
  const PAGE_SIZES = [10, 20, 50, 100];
  function render(host, config) {
    if (!host) return;
    const total = Math.max(0, Number(config.total) || 0);
    const pageSize = PAGE_SIZES.includes(Number(config.pageSize)) ? Number(config.pageSize) : 50;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(totalPages, Math.max(1, Number(config.page) || 1));
    host.classList.add('common-pagination');
    host.innerHTML = `<button class="btn btn-secondary" type="button" data-page-action="prev" ${page <= 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i> Previous</button><span class="page-info">Page ${page} of ${totalPages}</span><button class="btn btn-secondary" type="button" data-page-action="next" ${page >= totalPages ? 'disabled' : ''}>Next <i class="fas fa-chevron-right"></i></button><select class="page-select" aria-label="Items per page">${PAGE_SIZES.map((n) => `<option value="${n}" ${n === pageSize ? 'selected' : ''}>${n} items</option>`).join('')}</select>`;
    host.style.display = total > pageSize ? 'flex' : 'none';
    host.onclick = (event) => {
      const button = event.target.closest('[data-page-action]');
      if (!button || button.disabled) return;
      config.onPageChange?.(button.dataset.pageAction === 'next' ? Math.min(totalPages, page + 1) : Math.max(1, page - 1));
    };
    host.onchange = (event) => {
      if (event.target.matches('.page-select')) config.onPageSizeChange?.(Number(event.target.value));
    };
  }
  global.CommonPagination = { render, PAGE_SIZES: PAGE_SIZES.slice() };
})(window);
