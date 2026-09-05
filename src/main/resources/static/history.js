(function () {
    const key = 'talkme.callHistory';
    const historySection = document.getElementById('call-history');
    const historyList = document.getElementById('history-list');
    const clearButton = document.getElementById('clear-history');
    const historyJump = document.getElementById('history-jump');
    if (!historySection || !historyList) return;

    function readHistory() {
        try {
            const value = JSON.parse(localStorage.getItem(key) || '[]');
            return Array.isArray(value) ? value : [];
        } catch (err) {
            return [];
        }
    }

    function relativeTime(timestamp) {
        const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60000));
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.round(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.round(hours / 24);
        return `${days}d ago`;
    }

    function render() {
        const history = readHistory();
        historySection.hidden = history.length === 0;
        if (historyJump) historyJump.hidden = history.length === 0;
        historyList.replaceChildren();
        history.forEach(entry => {
            const item = document.createElement('article');
            item.className = 'history-item';
            const details = document.createElement('div');
            details.className = 'history-details';
            const title = document.createElement('strong');
            title.textContent = entry.participant ? `Call with ${entry.participant}` : 'Private call room';
            const meta = document.createElement('span');
            meta.textContent = `${entry.name || 'Unnamed'} · ${relativeTime(entry.lastJoined)}`;
            details.append(title, meta);

            const actions = document.createElement('div');
            actions.className = 'history-actions';
            const join = document.createElement('a');
            join.className = 'history-join';
            join.href = `/rooms/${encodeURIComponent(entry.roomId)}?autoJoin=true`;
            join.textContent = 'Call again';
            join.setAttribute('aria-label', `Call again ${entry.participant || 'in this room'}`);
            const remove = document.createElement('button');
            remove.className = 'history-remove';
            remove.type = 'button';
            remove.title = 'Remove from history';
            remove.setAttribute('aria-label', 'Remove from history');
            remove.textContent = '×';
            remove.addEventListener('click', () => {
                localStorage.setItem(key, JSON.stringify(readHistory().filter(itemToRemove => itemToRemove.roomId !== entry.roomId)));
                render();
            });
            actions.append(join, remove);
            item.append(details, actions);
            historyList.append(item);
        });
    }

    clearButton?.addEventListener('click', () => {
        localStorage.removeItem(key);
        render();
    });
    historyJump?.addEventListener('click', () => historySection.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    render();
})();