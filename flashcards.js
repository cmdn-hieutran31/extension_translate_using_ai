document.addEventListener('DOMContentLoaded', () => {
    const cardCountBadge = document.getElementById('cardCount');
    const loadingState = document.getElementById('loadingState');
    const emptyState = document.getElementById('emptyState');
    const flashcardGrid = document.getElementById('flashcardGrid');

    let cards = [];

    // Load cards from DB
    loadCards();

    async function loadCards() {
        showState('loading');
        
        chrome.runtime.sendMessage({ action: 'getFlashcards' }, (response) => {
            if (response && response.success) {
                cards = response.data || [];
                cardCountBadge.textContent = `${cards.length} card${cards.length !== 1 ? 's' : ''}`;
                renderCards();
            } else {
                console.error('Failed to load flashcards:', response?.error);
                showState('empty');
            }
        });
    }

    function buildDictionaryHtml(dictionary) {
        if (!dictionary || dictionary.length === 0) return '';
        let html = '';
        dictionary.forEach(group => {
            html += `<div class="dict-group">
                <div class="dict-type-badge">${group.type}</div>
                <div class="dict-meanings">`;
            group.meanings.forEach(item => {
                const related = item.related && item.related.length > 0
                    ? `<span class="dict-related">${item.related.slice(0, 3).join(', ')}</span>`
                    : '';
                html += `<div class="dict-item">
                    <span class="dict-word">${item.word}</span>${related}
                </div>`;
            });
            html += `</div></div>`;
        });
        return html;
    }

    function renderCards() {
        if (cards.length === 0) {
            showState('empty');
            return;
        }

        flashcardGrid.innerHTML = '';
        const fragment = document.createDocumentFragment();

        cards.forEach(card => {
            const wrapper = document.createElement('div');
            wrapper.className = 'card-wrapper';

            // Format context string
            let contextHtml = '';
            if (card.context) {
                try {
                    const host = new URL(card.context).hostname;
                    contextHtml = `<div class="context-text" title="Source: ${card.context}">🔗 ${host}</div>`;
                } catch(e) {
                    contextHtml = `<div class="context-text">📝 ${card.context}</div>`;
                }
            }

            // Format example sentence
            let exampleHtml = '';
            if (card.example && card.example.length > card.word.length) {
                try {
                    const regex = new RegExp(`(${card.word})`, 'gi');
                    const highlighted = card.example.replace(regex, '<strong>$1</strong>');
                    exampleHtml = `<div class="example-text">"${highlighted}"</div>`;
                } catch(e) {
                    exampleHtml = `<div class="example-text">"${card.example}"</div>`;
                }
            }

            // Dictionary drawer
            const hasDictionary = card.dictionary && card.dictionary.length > 0;
            const dictContent = buildDictionaryHtml(card.dictionary);
            const dictDrawerHtml = hasDictionary ? `
                <div class="dict-drawer" data-open="false">
                    <div class="dict-handle" title="Click to view dictionary">
                        <span class="dict-handle-icon">▲</span>
                        <span class="dict-handle-text">Dictionary</span>
                    </div>
                    <div class="dict-panel">
                        <div class="dict-panel-inner">${dictContent}</div>
                    </div>
                </div>` : '';

            wrapper.innerHTML = `
                <div class="flashcard">
                    <div class="flashcard-inner">
                        <!-- Front Side (Word) -->
                        <div class="flashcard-front">
                            <div class="card-actions action-right">
                                <button class="btn-icon speak" title="Listen" data-speak="${card.word.replace(/"/g, '&quot;')}">🔊</button>
                            </div>
                            <div class="word-text">${card.word}</div>
                            ${exampleHtml}
                            ${contextHtml}
                            <div class="flip-hint">Click to flip ⤵</div>
                        </div>
                        
                        <!-- Back Side (Translation) -->
                        <div class="flashcard-back">
                            <div class="card-actions action-left">
                                <button class="btn-icon delete" title="Delete Card" data-id="${card.id}">🗑</button>
                            </div>
                            <div class="trans-text">${card.translation}</div>
                            <div class="flip-hint">Click to flip ⤴</div>
                        </div>
                    </div>
                </div>
                ${dictDrawerHtml}
            `;

            const cardEl = wrapper.querySelector('.flashcard');

            // Flip Logic
            cardEl.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
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
                cardEl.addEventListener('touchstart', (e) => {
                    touchStartY = e.touches[0].clientY;
                }, { passive: true });
                cardEl.addEventListener('touchend', (e) => {
                    const deltaY = touchStartY - e.changedTouches[0].clientY;
                    if (deltaY > 40) { // Swipe up 40px
                        drawer.dataset.open = 'true';
                        handleIcon.textContent = '▼';
                    } else if (deltaY < -40) { // Swipe down
                        drawer.dataset.open = 'false';
                        handleIcon.textContent = '▲';
                    }
                }, { passive: true });
            }

            fragment.appendChild(wrapper);
        });

        flashcardGrid.appendChild(fragment);
        showState('grid');
    }

    function deleteCard(id, element) {
        if (!confirm('Are you sure you want to delete this word from your flashcards?')) return;
        
        chrome.runtime.sendMessage({ action: 'deleteFlashcard', id: id }, (response) => {
            if (response && response.success) {
                element.style.transform = 'scale(0)';
                element.style.opacity = '0';
                element.style.transition = 'all 0.3s ease';
                setTimeout(() => {
                    cards = cards.filter(c => c.id !== id);
                    cardCountBadge.textContent = `${cards.length} card${cards.length !== 1 ? 's' : ''}`;
                    if (cards.length === 0) {
                        showState('empty');
                    } else {
                        element.remove();
                    }
                }, 300);
            } else {
                alert('Error deleting flashcard');
            }
        });
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
        flashcardGrid.style.display = 'none';

        if (state === 'loading') loadingState.style.display = 'flex';
        else if (state === 'empty') emptyState.style.display = 'flex';
        else if (state === 'grid') flashcardGrid.style.display = 'grid';
    }
});
