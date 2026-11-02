/* Searchable, expandable in-app user guide. Add future help topics as .guide-topic elements. */
document.addEventListener('DOMContentLoaded', function () {
    const section = document.getElementById('user-guide');
    if (!section) return;
    const input = section.querySelector('#guideSearchInput');
    const clear = section.querySelector('#guideSearchClear');
    const status = section.querySelector('#guideSearchStatus');
    const empty = section.querySelector('#guideNoResults');
    const topics = Array.from(section.querySelectorAll('[data-guide-topic]'));
    if (!input) return;
    function filterTopics() {
        const query = input.value.trim().toLocaleLowerCase();
        let visible = 0;
        topics.forEach(topic => {
            const match = !query || topic.textContent.toLocaleLowerCase().includes(query);
            topic.hidden = !match;
            if (match) visible++;
            if (query && match) topic.open = true;
        });
        clear.hidden = !query;
        empty.hidden = visible !== 0;
        status.textContent = query ? `${visible} guide topic${visible === 1 ? '' : 's'} found` : 'Saare guide topics neeche diye gaye hain.';
    }
    input.addEventListener('input', filterTopics);
    clear.addEventListener('click', function () { input.value = ''; filterTopics(); input.focus(); });
});
