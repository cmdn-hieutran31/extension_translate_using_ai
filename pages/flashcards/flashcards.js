document.addEventListener('DOMContentLoaded', () => {
    const cardCountBadge = document.getElementById('cardCount');
    const loadingState = document.getElementById('loadingState');
    const emptyState = document.getElementById('emptyState');
    const noResultsState = document.getElementById('noResultsState');
    const flashcardGrid = document.getElementById('flashcardGrid');
    const toolbar = document.getElementById('toolbar');
    const searchInput = document.getElementById('searchInput');
    const searchClear = document.getElementById('searchClear');
    const pagination = document.getElementById('pagination');
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    const pageIndicator = document.getElementById('pageIndicator');

    const PAGE_SIZE = 12;

    let allCards = [];
    let filteredCards = [];
    let currentPage = 1;
    let searchDebounceTimer = null;

    // Cross-nav buttons
    document.getElementById('openHistoryBtn')?.addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('pages/history/history.html') });
    });
    document.getElementById('openSettingsBtn')?.addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('pages/settings/settings.html') });
    });
    document.getElementById('studyModeBtn')?.addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('pages/flashcards/study.html') });
    });

    // Load cards from DB
    loadCards();

    async function loadCards() {
        showState('loading');

        chrome.runtime.sendMessage({ action: 'getFlashcards' }, (response) => {
            if (response && response.success) {
                allCards = response.data || [];
                currentPage = 1;
                applyFilterAndRender();
                updateStudyBadge();
            } else {
                console.error('Failed to load flashcards:', response?.error);
                allCards = [];
                applyFilterAndRender();
            }
        });
    }

    function updateStudyBadge() {
        const studyBtn = document.getElementById('studyModeBtn');
        const dueBadge = document.getElementById('dueBadge');
        if (!studyBtn || !dueBadge) return;
        const nowIso = new Date().toISOString();
        const dueCount = allCards.filter(c => (c.nextReviewAt || c.createdAt) <= nowIso).length;
        if (dueCount > 0) {
            studyBtn.style.display = 'inline-flex';
            dueBadge.textContent = dueCount;
        } else {
            studyBtn.style.display = 'none';
        }
    }

    function getHostnameOrEmpty(str) {
        if (!str) return '';
        try { return new URL(str).hostname; } catch { return ''; }
    }

    function applyFilterAndRender() {
        const query = (searchInput.value || '').trim().toLowerCase();

        if (!query) {
            filteredCards = allCards;
        } else {
            filteredCards = allCards.filter((c) => {
                const word = (c.word || '').toLowerCase();
                const translation = (c.translation || '').toLowerCase();
                const example = (c.example || '').toLowerCase();
                const ctx = (c.context || '').toLowerCase();
                const host = getHostnameOrEmpty(c.context).toLowerCase();
                return word.includes(query)
                    || translation.includes(query)
                    || example.includes(query)
                    || ctx.includes(query)
                    || host.includes(query);
            });
        }

        const totalPages = Math.max(1, Math.ceil(filteredCards.length / PAGE_SIZE));
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;

        updateCountBadge();

        // Decide which state to show
        if (allCards.length === 0) {
            toolbar.style.display = 'none';
            pagination.style.display = 'none';
            showState('empty');
            return;
        }

        toolbar.style.display = 'flex';

        if (filteredCards.length === 0) {
            pagination.style.display = 'none';
            showState('noResults');
            return;
        }

        const start = (currentPage - 1) * PAGE_SIZE;
        const pageItems = filteredCards.slice(start, start + PAGE_SIZE);
        renderCards(pageItems);

        // Pagination UI — always show when there's data
        pagination.style.display = 'flex';
        pageIndicator.textContent = `Page ${currentPage} / ${totalPages}`;
        prevPageBtn.disabled = currentPage === 1;
        nextPageBtn.disabled = currentPage === totalPages;
    }

    function updateCountBadge() {
        const total = allCards.length;
        const shown = filteredCards.length;
        const isFiltered = shown !== total;
        if (isFiltered) {
            cardCountBadge.textContent = `${shown} of ${total}`;
        } else {
            cardCountBadge.textContent = `${total} card${total !== 1 ? 's' : ''}`;
        }
    }

    function buildDictionaryHtml(dictionary) {
        if (!dictionary || dictionary.length === 0) return '';
        let html = '';
        dictionary.forEach((group) => {
            html += `<div class="dict-group">
                <div class="dict-type-badge">${escapeHtml(group.type)}</div>
                <div class="dict-meanings">`;
            group.meanings.forEach((item) => {
                const related =
                    item.related && item.related.length > 0
                        ? `<span class="dict-related">${escapeHtml(item.related.slice(0, 3).join(', '))}</span>`
                        : '';
                html += `<div class="dict-item">
                    <span class="dict-word">${escapeHtml(item.word)}</span>${related}
                </div>`;
            });
            html += `</div></div>`;
        });
        return html;
    }

    function renderCards(cardsToRender) {
        flashcardGrid.innerHTML = '';
        const fragment = document.createDocumentFragment();

        cardsToRender.forEach((card) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'card-wrapper';

            // Format context string
            let contextHtml = '';
            if (card.context) {
                try {
                    const host = new URL(card.context).hostname;
                    contextHtml = `<div class="context-text" title="Source: ${escapeHtml(card.context)}">🔗 ${escapeHtml(host)}</div>`;
                } catch (e) {
                    contextHtml = `<div class="context-text">📝 ${escapeHtml(card.context)}</div>`;
                }
            }

            // Format example sentence
            let exampleHtml = '';
            const exampleText = card.example || '';
            const escapedExample = escapeHtml(exampleText);
            const escapedWord = escapeHtml(card.word);
            const highlighted = (escapedExample && escapedExample.length > escapedWord.length)
                ? escapedExample.replace(new RegExp(`(${escapeRegex(escapedWord)})`, 'gi'), '<strong>$1</strong>')
                : escapedExample;

            exampleHtml = `
                <div class="example-container">
                    <div class="example-view">
                        <div class="example-text">${highlighted ? `"${highlighted}"` : '<span class="no-example">No example provided</span>'}</div>
                        <button class="btn-edit-example" title="Edit example">📝</button>
                    </div>
                    <div class="example-edit" style="display: none;">
                        <textarea class="edit-example-input" placeholder="Enter your example here...">${escapeHtml(exampleText)}</textarea>
                        <div class="edit-actions">
                            <button class="btn-save-example">Save</button>
                            <button class="btn-cancel-example">Cancel</button>
                        </div>
                    </div>
                </div>`;

            // Dictionary drawer
            const hasDictionary = card.dictionary && card.dictionary.length > 0;
            const dictContent = buildDictionaryHtml(card.dictionary);
            const dictDrawerHtml = hasDictionary
                ? `
                <div class="dict-drawer" data-open="false">
                    <div class="dict-handle" title="Click to view dictionary">
                        <span class="dict-handle-icon">▲</span>
                        <span class="dict-handle-text">Dictionary</span>
                    </div>
                    <div class="dict-panel">
                        <div class="dict-panel-inner">${dictContent}</div>
                    </div>
                </div>`
                : '';

            wrapper.innerHTML = `
                <div class="flashcard">
                    <div class="flashcard-inner">
                        <!-- Front Side (Word) -->
                        <div class="flashcard-front">
                            <div class="card-actions action-right">
                                <button class="btn-icon speak" title="Listen" data-speak="${escapeHtml(card.word)}">🔊</button>
                            </div>
                            <div class="word-text">${escapeHtml(card.word)}</div>
                            ${exampleHtml}
                            ${contextHtml}
                            <div class="flip-hint">Click to flip ⤵</div>
                        </div>

                        <!-- Back Side (Translation) -->
                        <div class="flashcard-back">
                            <div class="card-actions action-left">
                                <button class="btn-icon delete" title="Delete Card" data-id="${escapeHtml(card.id)}">🗑</button>
                            </div>
                            <div class="trans-text">${escapeHtml(card.translation)}</div>
                            <div class="flip-hint">Click to flip ⤴</div>
                        </div>
                    </div>
                </div>
                ${dictDrawerHtml}
            `;

            const cardEl = wrapper.querySelector('.flashcard');

            // Flip Logic
            cardEl.addEventListener('click', (e) => {
                // Don't flip if clicking on a button or inside the edit container
                if (e.target.closest('button') || e.target.closest('.example-edit')) return;
                cardEl.classList.toggle('flipped');
            });

            // Speak Logic
            const speakBtn = wrapper.querySelector('.speak');
            if (speakBtn) {
                speakBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    speakWord(speakBtn.getAttribute('data-speak'));
                });
            }

            // Delete Logic
            const deleteBtn = wrapper.querySelector('.delete');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    deleteCard(card.id, wrapper);
                });
            }

            // Edit Example Logic
            const exampleContainer = wrapper.querySelector('.example-container');
            const editBtn = wrapper.querySelector('.btn-edit-example');
            const saveBtn = wrapper.querySelector('.btn-save-example');
            const cancelBtn = wrapper.querySelector('.btn-cancel-example');
            const viewDiv = wrapper.querySelector('.example-view');
            const editDiv = wrapper.querySelector('.example-edit');
            const textarea = wrapper.querySelector('.edit-example-input');
            const exampleDisplay = wrapper.querySelector('.example-text');

            if (editBtn) {
                editBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    viewDiv.style.display = 'none';
                    editDiv.style.display = 'block';
                    textarea.focus();
                });
            }

            if (cancelBtn) {
                cancelBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    textarea.value = card.example || '';
                    viewDiv.style.display = 'flex';
                    editDiv.style.display = 'none';
                });
            }

            if (saveBtn) {
                saveBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const newExample = textarea.value.trim();
                    
                    chrome.runtime.sendMessage({
                        action: 'updateFlashcard',
                        id: card.id,
                        data: { example: newExample }
                    }, (response) => {
                        if (response && response.success) {
                            card.example = newExample;
                            const escapedNewExample = escapeHtml(newExample);
                            const escapedCardWord = escapeHtml(card.word);
                            const regex = new RegExp(`(${escapeRegex(escapedCardWord)})`, 'gi');
                            const newHighlighted = escapedNewExample.replace(regex, '<strong>$1</strong>');
                            exampleDisplay.innerHTML = escapedNewExample ? `"${newHighlighted}"` : '<span class="no-example">No example provided</span>';
                            
                            viewDiv.style.display = 'flex';
                            editDiv.style.display = 'none';
                        } else {
                            alert('Error updating example');
                        }
                    });
                });
            }

            // Dictionary Drawer Toggle Logic
            if (hasDictionary) {
                const drawer = wrapper.querySelector('.dict-drawer');
                const handle = wrapper.querySelector('.dict-handle');
                const handleIcon = wrapper.querySelector('.dict-handle-icon');

                // Click on handle to open/close
                handle.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const isOpen = drawer.dataset.open === 'true';
                    drawer.dataset.open = !isOpen;
                    handleIcon.textContent = isOpen ? '▲' : '▼';
                });

                // Swipe up gesture on card to open drawer
                let touchStartY = 0;
                cardEl.addEventListener(
                    'touchstart',
                    (e) => {
                        touchStartY = e.touches[0].clientY;
                    },
                    { passive: true }
                );
                cardEl.addEventListener(
                    'touchend',
                    (e) => {
                        const deltaY = touchStartY - e.changedTouches[0].clientY;
                        if (deltaY > 40) {
                            // Swipe up 40px
                            drawer.dataset.open = 'true';
                            handleIcon.textContent = '▼';
                        } else if (deltaY < -40) {
                            // Swipe down
                            drawer.dataset.open = 'false';
                            handleIcon.textContent = '▲';
                        }
                    },
                    { passive: true }
                );
            }

            fragment.appendChild(wrapper);
        });

        flashcardGrid.appendChild(fragment);
        showState('grid');
    }

    function deleteCard(id, element) {
        if (
            !confirm(
                'Are you sure you want to delete this word from your flashcards?'
            )
        )
            return;

        chrome.runtime.sendMessage(
            { action: 'deleteFlashcard', id: id },
            (response) => {
                if (response && response.success) {
                    element.style.transform = 'scale(0)';
                    element.style.opacity = '0';
                    element.style.transition = 'all 0.3s ease';
                    setTimeout(() => {
                        allCards = allCards.filter((c) => c.id !== id);
                        applyFilterAndRender();
                    }, 300);
                } else {
                    alert('Error deleting flashcard');
                }
            }
        );
    }

    function speakWord(text) {
        if (!window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        window.speechSynthesis.speak(utterance);
    }

    function showState(state) {
        loadingState.style.display = 'none';
        emptyState.style.display = 'none';
        noResultsState.style.display = 'none';
        flashcardGrid.style.display = 'none';

        if (state === 'loading') loadingState.style.display = 'flex';
        else if (state === 'empty') emptyState.style.display = 'flex';
        else if (state === 'noResults') noResultsState.style.display = 'flex';
        else if (state === 'grid') flashcardGrid.style.display = 'grid';
    }

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

    // Pagination buttons
    prevPageBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            applyFilterAndRender();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });

    nextPageBtn.addEventListener('click', () => {
        const totalPages = Math.max(1, Math.ceil(filteredCards.length / PAGE_SIZE));
        if (currentPage < totalPages) {
            currentPage++;
            applyFilterAndRender();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function escapeRegex(string) {
        return string.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&');
    }

    // ========== Theme Initialization ==========
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const themeIcon = document.getElementById('themeIcon');

    function updateThemeUI(theme) {
        if (theme === 'light') {
            document.documentElement.setAttribute('data-theme', 'light');
            if (themeIcon) {
                themeIcon.innerHTML = '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>';
            }
        } else {
            document.documentElement.removeAttribute('data-theme');
            if (themeIcon) {
                themeIcon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';
            }
        }
    }

    // Load initial theme
    chrome.storage.local.get(['globalTheme'], (data) => {
        const defaultTheme = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
        const theme = data.globalTheme || defaultTheme;
        updateThemeUI(theme);
    });

    // Toggle button click
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const isLight = document.documentElement.getAttribute('data-theme') === 'light';
            const newTheme = isLight ? 'dark' : 'light';
            chrome.storage.local.set({ globalTheme: newTheme });
            updateThemeUI(newTheme); // Apply locally IMMEDIATELY
        });
    }

    // Listen for global theme changes across tabs
    chrome.storage.onChanged.addListener((changes) => {
        if (changes.globalTheme) {
            updateThemeUI(changes.globalTheme.newValue);
        }
    });

});
