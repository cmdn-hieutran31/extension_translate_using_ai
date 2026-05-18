document.addEventListener('DOMContentLoaded', () => {
    const historyCountEl = document.getElementById('historyCount');
    const loadingState = document.getElementById('loadingState');
    const emptyState = document.getElementById('emptyState');
    const noResultsState = document.getElementById('noResultsState');
    const historyList = document.getElementById('historyList');
    const clearAllBtn = document.getElementById('clearAllBtn');
    const toolbar = document.getElementById('toolbar');
    const searchInput = document.getElementById('searchInput');
    const searchClear = document.getElementById('searchClear');
    const pagination = document.getElementById('pagination');
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    const pageIndicator = document.getElementById('pageIndicator');

    const PAGE_SIZE = 30;

    let allEntries = [];
    let filteredEntries = [];
    let currentPage = 1;
    let searchDebounceTimer = null;
    let currentSourceFilter = 'all';

    loadHistory();

    function loadHistory() {
        showState('loading');
        chrome.runtime.sendMessage({ action: 'getHistory' }, (response) => {
            if (response && response.success) {
                allEntries = response.data || [];
            } else {
                allEntries = [];
            }
            currentPage = 1;
            applyFilterAndRender();
        });
    }

    function applyFilterAndRender() {
        const query = (searchInput.value || '').trim().toLowerCase();

        let base = allEntries;
        if (currentSourceFilter !== 'all') {
            base = base.filter((e) => (e.source || 'unknown') === currentSourceFilter);
        }

        if (!query) {
            filteredEntries = base;
        } else {
            filteredEntries = base.filter((e) => {
                const orig = (e.originalText || '').toLowerCase();
                const trans = (e.translation || '').toLowerCase();
                const host = getHostname(e.pageUrl).toLowerCase();
                return orig.includes(query) || trans.includes(query) || host.includes(query);
            });
        }

        const totalPages = Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE));
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;

        updateCountBadge();

        if (allEntries.length === 0) {
            toolbar.style.display = 'none';
            pagination.style.display = 'none';
            showState('empty');
            return;
        }

        toolbar.style.display = 'flex';

        if (filteredEntries.length === 0) {
            pagination.style.display = 'none';
            showState('noResults');
            return;
        }

        const start = (currentPage - 1) * PAGE_SIZE;
        const pageItems = filteredEntries.slice(start, start + PAGE_SIZE);
        renderHistoryItems(pageItems);

        // Pagination UI — always show when there's data
        pagination.style.display = 'flex';
        pageIndicator.textContent = `Page ${currentPage} / ${totalPages}`;
        prevPageBtn.disabled = currentPage === 1;
        nextPageBtn.disabled = currentPage === totalPages;
    }

    function updateCountBadge() {
        const total = allEntries.length;
        const shown = filteredEntries.length;
        if (shown !== total) {
            historyCountEl.textContent = `${shown} of ${total}`;
        } else {
            historyCountEl.textContent = `${total} entr${total !== 1 ? 'ies' : 'y'}`;
        }
    }

    function renderHistoryItems(items) {
        historyList.innerHTML = '';

        const groups = groupByDate(items);
        const fragment = document.createDocumentFragment();

        groups.forEach(({ label, items }) => {
            const groupEl = document.createElement('div');
            groupEl.className = 'history-group';

            const labelEl = document.createElement('div');
            labelEl.className = 'history-group-label';
            labelEl.textContent = label;

            const entriesEl = document.createElement('div');
            entriesEl.className = 'history-group-entries';

            items.forEach(entry => {
                entriesEl.appendChild(buildEntryEl(entry));
            });

            groupEl.appendChild(labelEl);
            groupEl.appendChild(entriesEl);
            fragment.appendChild(groupEl);
        });

        historyList.appendChild(fragment);
        showState('list');
    }

    function buildEntryEl(entry) {
        const el = document.createElement('div');
        el.className = 'history-entry';
        el.dataset.id = entry.id;

        const isLong = (entry.originalText || '').length > 80 || (entry.translation || '').length > 80;
        const sourceClass = getSourceClass(entry.source);
        const badgeClass = getBadgeClass(entry.source);
        const badgeLabel = getBadgeLabel(entry.source);
        const timeStr = formatTime(entry.translatedAt);
        const hostname = getHostname(entry.pageUrl);
        const originalTrunc = truncate(entry.originalText, 80);
        const translationTrunc = truncate(entry.translation, 80);

        el.innerHTML = `
            <div class="entry-source-dot ${sourceClass}"></div>
            <div class="entry-body">
                <div class="entry-original" data-full="${escapeHtml(entry.originalText || '')}" data-short="${escapeHtml(originalTrunc)}">${escapeHtml(originalTrunc)}</div>
                <div class="entry-translation" data-full="→ ${escapeHtml(entry.translation || '')}" data-short="→ ${escapeHtml(translationTrunc)}">→ ${escapeHtml(translationTrunc)}</div>
                <div class="entry-meta">
                    <span class="entry-badge ${badgeClass}">${badgeLabel}</span>
                    ${hostname ? `<span class="entry-url" title="${escapeHtml(entry.pageUrl)}">${escapeHtml(hostname)}</span>` : ''}
                    <span class="entry-time">${timeStr}</span>
                    ${isLong ? '<span class="entry-expand-hint">Click to expand</span>' : ''}
                </div>
            </div>
            <button class="entry-delete" title="Delete">×</button>
        `;

        if (isLong) {
            el.style.cursor = 'pointer';
            el.addEventListener('click', (e) => {
                if (e.target.closest('.entry-delete')) return;
                const expanded = el.classList.toggle('expanded');
                const origEl = el.querySelector('.entry-original');
                const transEl = el.querySelector('.entry-translation');
                const hint = el.querySelector('.entry-expand-hint');
                origEl.textContent = expanded ? origEl.dataset.full : origEl.dataset.short;
                transEl.textContent = expanded ? transEl.dataset.full : transEl.dataset.short;
                if (hint) hint.textContent = expanded ? 'Click to collapse' : 'Click to expand';
            });
        }

        el.querySelector('.entry-delete').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteEntry(entry.id, el);
        });

        return el;
    }

    function deleteEntry(id, el) {
        chrome.runtime.sendMessage({ action: 'deleteHistoryEntry', id }, (response) => {
            if (!response || !response.success) return;
            allEntries = allEntries.filter(e => e.id !== id);
            el.style.transition = 'all 0.25s ease';
            el.style.opacity = '0';
            el.style.transform = 'translateX(20px)';
            setTimeout(() => {
                applyFilterAndRender();
            }, 250);
        });
    }

    clearAllBtn.addEventListener('click', () => {
        if (allEntries.length === 0) return;
        if (!confirm('Clear all translation history?')) return;
        chrome.runtime.sendMessage({ action: 'clearHistory' }, (response) => {
            if (response && response.success) {
                allEntries = [];
                currentPage = 1;
                applyFilterAndRender();
            }
        });
    });

    // Search input
    searchInput.addEventListener('input', () => {
        searchClear.style.display = searchInput.value ? 'flex' : 'none';
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
            currentPage = 1;
            applyFilterAndRender();
        }, 200);
    });

    searchClear.addEventListener('click', () => {
        searchInput.value = '';
        searchClear.style.display = 'none';
        currentPage = 1;
        applyFilterAndRender();
        searchInput.focus();
    });

    // Cross-nav buttons
    document.getElementById('openFlashcardsBtn').addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('pages/flashcards/flashcards.html') });
    });
    document.getElementById('openSettingsBtn').addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('pages/settings/settings.html') });
    });

    // Export menu
    const exportBtn = document.getElementById('exportBtn');
    const exportMenu = document.getElementById('exportMenu');
    exportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = !exportMenu.hidden;
        exportMenu.hidden = open;
        exportBtn.setAttribute('aria-expanded', String(!open));
    });
    document.addEventListener('click', (e) => {
        if (!exportMenu.hidden && !exportMenu.contains(e.target) && e.target !== exportBtn) {
            exportMenu.hidden = true;
            exportBtn.setAttribute('aria-expanded', 'false');
        }
    });
    exportMenu.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-format]');
        if (!btn) return;
        exportHistory(btn.dataset.format);
        exportMenu.hidden = true;
        exportBtn.setAttribute('aria-expanded', 'false');
    });

    function exportHistory(format) {
        const data = filteredEntries.length > 0 ? filteredEntries : allEntries;
        if (data.length === 0) return;
        const stamp = new Date().toISOString().slice(0, 10);
        const filename = `translation-history-${stamp}.${format}`;
        let blob;
        if (format === 'json') {
            blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        } else {
            const headers = ['translatedAt', 'source', 'targetLang', 'originalText', 'translation', 'pageUrl'];
            const escapeCsv = (val) => {
                const s = val == null ? '' : String(val);
                return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
            };
            const lines = [headers.join(',')];
            data.forEach(e => {
                lines.push(headers.map(h => escapeCsv(e[h])).join(','));
            });
            blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    // Filter chips
    document.getElementById('filterChips').addEventListener('click', (e) => {
        const chip = e.target.closest('.filter-chip');
        if (!chip) return;
        const source = chip.dataset.source;
        if (source === currentSourceFilter) return;
        currentSourceFilter = source;
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.toggle('active', c === chip));
        currentPage = 1;
        applyFilterAndRender();
    });

    // Pagination
    prevPageBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            applyFilterAndRender();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });

    nextPageBtn.addEventListener('click', () => {
        const totalPages = Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE));
        if (currentPage < totalPages) {
            currentPage++;
            applyFilterAndRender();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });

    function showState(state) {
        loadingState.style.display = 'none';
        emptyState.style.display = 'none';
        noResultsState.style.display = 'none';
        historyList.style.display = 'none';
        if (state === 'loading') loadingState.style.display = 'flex';
        else if (state === 'empty') emptyState.style.display = 'flex';
        else if (state === 'noResults') noResultsState.style.display = 'flex';
        else if (state === 'list') historyList.style.display = 'flex';
    }

    // ===== Helpers =====

    function groupByDate(items) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        const map = new Map();

        items.forEach(item => {
            const d = new Date(item.translatedAt);
            d.setHours(0, 0, 0, 0);
            let label;
            if (d.getTime() === today.getTime()) label = 'Today';
            else if (d.getTime() === yesterday.getTime()) label = 'Yesterday';
            else label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

            if (!map.has(label)) map.set(label, []);
            map.get(label).push(item);
        });

        return [...map.entries()].map(([label, items]) => ({ label, items }));
    }

    function getSourceClass(source) {
        if (source === 'google_dict') return 'dot-google';
        if (source === 'mymemory') return 'dot-mymemory';
        if (source === 'ai') return 'dot-ai';
        return 'dot-unknown';
    }

    function getBadgeClass(source) {
        if (source === 'google_dict') return 'badge-google';
        if (source === 'mymemory') return 'badge-mymemory';
        if (source === 'ai') return 'badge-ai';
        return '';
    }

    function getBadgeLabel(source) {
        if (source === 'google_dict') return 'Google';
        if (source === 'mymemory') return 'MyMemory';
        if (source === 'ai') return 'Gemini AI';
        return source || 'Unknown';
    }

    function getHostname(url) {
        if (!url) return '';
        try { return new URL(url).hostname; } catch { return ''; }
    }

    function formatTime(isoStr) {
        const d = new Date(isoStr);
        const now = new Date();
        const diff = Math.floor((now - d) / 1000);
        if (diff < 60) return 'Just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }

    function truncate(str, max) {
        if (!str) return '';
        return str.length > max ? str.slice(0, max) + '…' : str;
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // ===== Theme =====
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const themeIcon = document.getElementById('themeIcon');

    function updateThemeUI(theme) {
        if (theme === 'light') {
            document.documentElement.setAttribute('data-theme', 'light');
            themeIcon.innerHTML = '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>';
        } else {
            document.documentElement.removeAttribute('data-theme');
            themeIcon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';
        }
    }

    chrome.storage.local.get(['globalTheme'], (data) => {
        const def = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
        updateThemeUI(data.globalTheme || def);
    });

    themeToggleBtn.addEventListener('click', () => {
        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        const newTheme = isLight ? 'dark' : 'light';
        chrome.storage.local.set({ globalTheme: newTheme });
        updateThemeUI(newTheme);
    });

    chrome.storage.onChanged.addListener((changes) => {
        if (changes.globalTheme) updateThemeUI(changes.globalTheme.newValue);
    });
});
