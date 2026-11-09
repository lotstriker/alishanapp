/* Searchable, expandable, release-versioned in-app learning centre. */
(function () {
    function initUserGuide() {
        const section = document.getElementById('user-guide');
        if (!section || section.dataset.guideInitialized === 'true') return;
        section.dataset.guideInitialized = 'true';
        const input = section.querySelector('#guideSearchInput');
        const clear = section.querySelector('#guideSearchClear');
        const status = section.querySelector('#guideSearchStatus');
        const empty = section.querySelector('#guideNoResults');
        const topics = Array.from(section.querySelectorAll('details[data-guide-topic]'));
        if (!input || !status || !empty) return;
        const visibleTopics = () => topics.filter(topic => !topic.hidden);
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
                : `${topics.length} guide topics available — kisi topic ko kholkar steps, examples aur diagrams dekhein.`;
        }
        // Delegation makes the controls robust if Settings moves/rebuilds guide markup.
        section.addEventListener('click', function (event) {
            const target = event.target;
            const button = target && typeof target.closest === 'function'
                ? target.closest('#guideExpandAll, #guideCollapseAll') : null;
            if (!button || !section.contains(button)) return;
            event.preventDefault();
            event.stopPropagation();
            const expand = button.id === 'guideExpandAll';
            const visible = visibleTopics();
            visible.forEach(topic => { topic.open = expand; });
            status.textContent = expand
                ? `All ${visible.length} visible guide topics expanded.`
                : `All ${visible.length} visible guide topics collapsed.`;
        }, true);
        input.addEventListener('input', filterTopics);
        if (clear) clear.addEventListener('click', function (event) {
            event.preventDefault(); input.value = ''; filterTopics(); input.focus();
        });
        filterTopics();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initUserGuide, { once: true });
    else initUserGuide();
})();
