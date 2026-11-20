/* Searchable, expandable, release-versioned in-app learning centre. */
document.addEventListener('DOMContentLoaded', function () {
    const section = document.getElementById('user-guide');
    if (!section) return;
    const input = section.querySelector('#guideSearchInput');
    const clear = section.querySelector('#guideSearchClear');
    const status = section.querySelector('#guideSearchStatus');
    const empty = section.querySelector('#guideNoResults');
    const expandAll = section.querySelector('#guideExpandAll');
    const collapseAll = section.querySelector('#guideCollapseAll');
    const topics = Array.from(section.querySelectorAll('[data-guide-topic]'));
    if (!input || !status || !empty) return;

    function filterTopics() {
        const query = input.value.trim().toLocaleLowerCase();
        let visible = 0;
        topics.forEach(topic => {
            const match = !query || topic.textContent.toLocaleLowerCase().includes(query);
            topic.hidden = !match;
            if (match) visible++;
            if (query && match) topic.open = true;
        });
        if (clear) clear.hidden = !query;
        empty.hidden = visible !== 0;
        status.textContent = query
            ? `${visible} guide topic${visible === 1 ? '' : 's'} found`
            : `${topics.length} guide topics available — topic kholkar steps aur examples dekhein.`;
    }

    if (expandAll) expandAll.addEventListener('click', function () {
        topics.forEach(topic => { if (!topic.hidden) topic.open = true; });
    });
    if (collapseAll) collapseAll.addEventListener('click', function () {
        topics.forEach(topic => { if (!topic.hidden) topic.open = false; });
    });
    input.addEventListener('input', filterTopics);
    if (clear) clear.addEventListener('click', function () {
        input.value = '';
        filterTopics();
        input.focus();
    });
    filterTopics();
});
