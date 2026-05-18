document.addEventListener('DOMContentLoaded', () => {
    const loadingState = document.getElementById('loadingState');
    const emptyState = document.getElementById('emptyState');
    const doneState = document.getElementById('doneState');
    const exerciseStage = document.getElementById('exerciseStage');
    const typeBadge = document.getElementById('typeBadge');

    const panels = {
        choice: document.getElementById('panelChoice'),
        type: document.getElementById('panelType'),
        fill: document.getElementById('panelFill'),
        listen: document.getElementById('panelListen'),
    };

    const choiceWord = document.getElementById('choiceWord');
    const choiceGrid = document.getElementById('choiceGrid');
    const choiceSpeak = document.getElementById('choiceSpeak');

    const typeWord = document.getElementById('typeWord');
    const typeInput = document.getElementById('typeInput');
    const typeSubmit = document.getElementById('typeSubmit');
    const typeSpeak = document.getElementById('typeSpeak');

    const fillSentence = document.getElementById('fillSentence');
    const fillHint = document.getElementById('fillHint');
    const fillInput = document.getElementById('fillInput');
    const fillSubmit = document.getElementById('fillSubmit');

    const listenPlay = document.getElementById('listenPlay');
    const listenGrid = document.getElementById('listenGrid');

    const feedback = document.getElementById('feedback');
    const feedbackIcon = document.getElementById('feedbackIcon');
    const feedbackTitle = document.getElementById('feedbackTitle');
    const feedbackDetail = document.getElementById('feedbackDetail');
    const continueBtn = document.getElementById('continueBtn');
    const skipBtn = document.getElementById('skipBtn');

    const progressText = document.getElementById('progressText');
    const progressFill = document.getElementById('progressFill');
    const closeBtn = document.getElementById('closeBtn');
    const backToGridBtn = document.getElementById('backToGridBtn');
    const doneBackBtn = document.getElementById('doneBackBtn');
    const masteredText = document.getElementById('masteredText');
    const mistakesText = document.getElementById('mistakesText');
    const accuracyText = document.getElementById('accuracyText');
    const reviewLog = document.getElementById('reviewLog');

    const TYPE_LABELS = {
        choice: 'Multiple Choice',
        type: 'Type Translation',
        fill: 'Fill in the Blank',
        listen: 'Listening',
    };

    let allCards = [];
    let queue = [];
    let total = 0;
    let mastered = new Set();        // card.id that have eventually been answered correctly
    let everWrong = new Set();       // card.id that have been answered wrong at least once
    let mistakes = 0;                // total wrong attempts (can exceed total when lapses repeat)
    let sessionLog = [];             // [{ card, type, userAnswer, correctAnswer, isCorrect }]
    let currentCard = null;
    let currentType = null;
    let answered = false;
    let busy = false;

    init();

    function init() {
        chrome.runtime.sendMessage({ action: 'getFlashcards' }, (response) => {
            allCards = (response && response.success) ? (response.data || []) : [];
            const nowIso = new Date().toISOString();
            queue = allCards
                .filter(c => (c.nextReviewAt || c.createdAt) <= nowIso)
                .sort(() => Math.random() - 0.5);
            total = queue.length;
            if (total === 0) { show('empty'); return; }
            nextExercise();
        });
    }

    function show(state) {
        loadingState.hidden = state !== 'loading';
        emptyState.hidden = state !== 'empty';
        doneState.hidden = state !== 'done';
        exerciseStage.hidden = state !== 'exercise';
    }

    function showPanel(name) {
        Object.entries(panels).forEach(([k, el]) => { el.hidden = k !== name; });
    }

    function pickType(card) {
        const options = ['choice', 'type', 'listen'];
        const ex = (card.example || '').toLowerCase();
        const w = (card.word || '').toLowerCase();
        if (w && ex.includes(w) && allCards.length >= 1) options.push('fill');
        return options[Math.floor(Math.random() * options.length)];
    }

    function nextExercise() {
        currentCard = queue.shift();
        if (!currentCard) {
            renderDone();
            return;
        }
        currentType = pickType(currentCard);
        answered = false;
        busy = false;

        feedback.hidden = true;
        feedback.classList.remove('correct', 'wrong');
        skipBtn.hidden = false;

        typeBadge.textContent = TYPE_LABELS[currentType];

        if (currentType === 'choice') renderChoice();
        else if (currentType === 'type') renderType();
        else if (currentType === 'fill') renderFill();
        else if (currentType === 'listen') renderListen();

        updateProgress();
        show('exercise');
    }

    function updateProgress() {
        const done = mastered.size;
        progressText.textContent = `${done} / ${total}`;
        progressFill.style.width = total === 0 ? '0%' : `${(done / total) * 100}%`;
    }

    function renderDone() {
        masteredText.textContent = `${mastered.size} / ${total}`;
        mistakesText.textContent = String(mistakes);
        const firstTry = total - everWrong.size;
        accuracyText.textContent = total === 0 ? '0%' : `${Math.round((firstTry / total) * 100)}%`;
        renderReviewLog();
        show('done');
    }

    function renderReviewLog() {
        reviewLog.innerHTML = '';
        if (sessionLog.length === 0) return;
        const frag = document.createDocumentFragment();
        sessionLog.forEach(entry => {
            const row = document.createElement('div');
            row.className = `review-row ${entry.isCorrect ? 'correct' : 'wrong'}`;
            const userPart = (!entry.isCorrect && entry.userAnswer)
                ? `<span class="user-ans">${escapeHtml(entry.userAnswer)}</span>`
                : '';
            const word = entry.card.word || '';
            const correct = entry.correctAnswer || '';
            const sep = entry.type === 'fill' ? ' (fill)' : ' → ';
            row.innerHTML = `
                <div class="review-icon">${entry.isCorrect ? '✅' : '❌'}</div>
                <div class="review-body">
                    <div class="review-word">${escapeHtml(word)}${entry.type === 'fill' ? '' : sep + escapeHtml(correct)}</div>
                    <div class="review-answer">${userPart}${entry.type === 'fill' ? `Answer: <b>${escapeHtml(correct)}</b>` : ''}</div>
                </div>
                <div class="review-type">${TYPE_LABELS[entry.type] || ''}</div>
            `;
            frag.appendChild(row);
        });
        reviewLog.appendChild(frag);
    }

    // ---------- Multiple Choice ----------
    function renderChoice() {
        showPanel('choice');
        choiceWord.textContent = currentCard.word;
        const distractors = pickDistractors(currentCard, 'translation', 3);
        const options = shuffle([currentCard.translation, ...distractors]);
        renderChoiceButtons(choiceGrid, options, currentCard.translation);
    }

    // ---------- Type Translation ----------
    function renderType() {
        showPanel('type');
        typeWord.textContent = currentCard.word;
        typeInput.value = '';
        typeInput.disabled = false;
        typeInput.classList.remove('correct', 'wrong');
        typeSubmit.disabled = false;
        setTimeout(() => typeInput.focus(), 50);
    }

    // ---------- Fill in Blank ----------
    function renderFill() {
        showPanel('fill');
        const example = currentCard.example || '';
        const word = currentCard.word || '';
        // Replace first occurrence case-insensitively with a styled blank
        const regex = new RegExp(escapeRegex(word), 'i');
        const masked = example.replace(regex, '<span class="blank">_____</span>');
        fillSentence.innerHTML = `"${masked}"`;
        fillHint.innerHTML = `Meaning: <b>${escapeHtml(currentCard.translation || '')}</b>`;
        fillInput.value = '';
        fillInput.disabled = false;
        fillInput.classList.remove('correct', 'wrong');
        fillSubmit.disabled = false;
        setTimeout(() => fillInput.focus(), 50);
    }

    // ---------- Listening ----------
    function renderListen() {
        showPanel('listen');
        const distractors = pickDistractors(currentCard, 'word', 3);
        const options = shuffle([currentCard.word, ...distractors]);
        renderChoiceButtons(listenGrid, options, currentCard.word);
        // Auto play after a tick
        setTimeout(() => speak(currentCard.word), 200);
    }

    function renderChoiceButtons(container, options, correctValue) {
        container.innerHTML = '';
        options.forEach((opt, idx) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'choice-btn';
            btn.innerHTML = `<span class="choice-btn-key">${idx + 1}</span><span>${escapeHtml(opt)}</span>`;
            btn.dataset.value = opt;
            btn.addEventListener('click', () => onChoicePicked(container, btn, opt, correctValue));
            container.appendChild(btn);
        });
    }

    function onChoicePicked(container, btn, value, correctValue) {
        if (answered) return;
        answered = true;
        const isCorrect = value === correctValue;
        btn.classList.add(isCorrect ? 'correct' : 'wrong');
        // Reveal the right answer too if user was wrong
        if (!isCorrect) {
            container.querySelectorAll('.choice-btn').forEach(b => {
                if (b.dataset.value === correctValue) b.classList.add('correct');
            });
        }
        container.querySelectorAll('.choice-btn').forEach(b => b.disabled = true);
        finalize(isCorrect, value);
    }

    // Type & Fill submit handlers
    typeSubmit.addEventListener('click', () => submitText('type'));
    fillSubmit.addEventListener('click', () => submitText('fill'));
    typeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submitText('type'); } });
    fillInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submitText('fill'); } });

    function submitText(kind) {
        if (answered) return;
        const input = kind === 'type' ? typeInput : fillInput;
        const submit = kind === 'type' ? typeSubmit : fillSubmit;
        const user = input.value.trim();
        if (!user) return;
        answered = true;
        const expected = kind === 'type' ? currentCard.translation : currentCard.word;
        const isCorrect = fuzzyMatch(user, expected);
        input.classList.add(isCorrect ? 'correct' : 'wrong');
        input.disabled = true;
        submit.disabled = true;
        finalize(isCorrect, user);
    }

    function finalize(isCorrect, userAnswer) {
        skipBtn.hidden = true;
        const correctAnswer = currentType === 'fill' ? currentCard.word : currentCard.translation;
        const extra = currentType === 'fill'
            ? `<br>Meaning: <b>${escapeHtml(currentCard.translation || '')}</b>`
            : (currentCard.example ? `<br><i>"${escapeHtml(currentCard.example)}"</i>` : '');
        feedback.classList.add(isCorrect ? 'correct' : 'wrong');
        feedbackIcon.textContent = isCorrect ? '✅' : '❌';
        feedbackTitle.textContent = isCorrect ? 'Correct!' : 'Not quite';
        if (isCorrect) {
            feedbackDetail.innerHTML = `<b>${escapeHtml(correctAnswer)}</b>${extra}`;
        } else {
            const userPart = userAnswer ? `<span class="user-ans">${escapeHtml(userAnswer)}</span>` : '';
            feedbackDetail.innerHTML = `${userPart}<b>${escapeHtml(correctAnswer)}</b>${extra}`;
        }
        feedback.hidden = false;
        continueBtn.focus();

        sessionLog.push({
            card: currentCard,
            type: currentType,
            userAnswer: userAnswer || '',
            correctAnswer,
            isCorrect,
        });

        if (isCorrect) {
            mastered.add(currentCard.id);
        } else {
            everWrong.add(currentCard.id);
            mistakes++;
        }
        updateProgress();
        commitReview(isCorrect ? 4 : 0);
    }

    function commitReview(quality) {
        if (busy) return;
        busy = true;
        chrome.runtime.sendMessage(
            { action: 'reviewCard', id: currentCard.id, quality },
            () => { busy = false; }
        );
        // If wrong, re-queue at end of session
        if (quality < 3) queue.push(currentCard);
    }

    continueBtn.addEventListener('click', nextExercise);
    skipBtn.addEventListener('click', () => {
        if (answered) return;
        answered = true;
        // Mark visually as wrong on whichever input is active
        if (currentType === 'choice' || currentType === 'listen') {
            const container = currentType === 'choice' ? choiceGrid : listenGrid;
            const expected = currentType === 'choice' ? currentCard.translation : currentCard.word;
            container.querySelectorAll('.choice-btn').forEach(b => {
                if (b.dataset.value === expected) b.classList.add('correct');
                b.disabled = true;
            });
        } else if (currentType === 'type') {
            typeInput.disabled = true;
            typeSubmit.disabled = true;
        } else if (currentType === 'fill') {
            fillInput.disabled = true;
            fillSubmit.disabled = true;
        }
        finalize(false, '');
    });

    // Global keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.repeat) return;
        if (e.key === 'Escape') {
            history.back();
            return;
        }
        if (!answered && (currentType === 'choice' || currentType === 'listen')) {
            if (e.key >= '1' && e.key <= '4') {
                const container = currentType === 'choice' ? choiceGrid : listenGrid;
                const btn = container.querySelectorAll('.choice-btn')[Number(e.key) - 1];
                if (btn) btn.click();
            }
        }
        if (answered && (e.key === 'Enter' || e.key === ' ')) {
            const focusEl = document.activeElement;
            const isTextInput = focusEl && (focusEl.tagName === 'INPUT' || focusEl.tagName === 'TEXTAREA');
            if (!isTextInput || focusEl === continueBtn) {
                e.preventDefault();
                nextExercise();
            }
        }
    });

    // Audio
    function speak(text) {
        if (!window.speechSynthesis || !text) return;
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'en-US';
        window.speechSynthesis.speak(u);
    }
    choiceSpeak.addEventListener('click', (e) => { e.stopPropagation(); speak(currentCard?.word); });
    typeSpeak.addEventListener('click', (e) => { e.stopPropagation(); speak(currentCard?.word); });
    listenPlay.addEventListener('click', () => speak(currentCard?.word));

    // Helpers
    function pickDistractors(card, field, count) {
        const pool = allCards.filter(c => c.id !== card.id && c[field] && c[field] !== card[field]);
        // Deduplicate by field value
        const seen = new Set([normalize(card[field] || '')]);
        const unique = [];
        for (const c of pool) {
            const key = normalize(c[field]);
            if (seen.has(key)) continue;
            seen.add(key);
            unique.push(c[field]);
        }
        const shuffled = shuffle(unique);
        const result = shuffled.slice(0, count);
        // Pad with synthetic alternatives if we don't have enough cards yet
        const fallbacks = field === 'translation'
            ? ['—', '(không có)', '(khác)']
            : ['unknown', 'other', 'none'];
        let i = 0;
        while (result.length < count) {
            const fb = fallbacks[i % fallbacks.length] + (i >= fallbacks.length ? ' ' + (i + 1) : '');
            if (!result.includes(fb) && fb !== card[field]) result.push(fb);
            i++;
        }
        return result;
    }

    function fuzzyMatch(a, b) {
        return normalize(a) === normalize(b);
    }

    function normalize(s) {
        return String(s || '')
            .toLowerCase()
            .trim()
            .replace(/[\s ]+/g, ' ')
            .replace(/[.,;:!?"'`’“”()\[\]{}]/g, '');
    }

    function shuffle(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function escapeRegex(str) {
        return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    closeBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('pages/flashcards/flashcards.html') });
        window.close();
    });
    [backToGridBtn, doneBackBtn].forEach(btn => btn?.addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('pages/flashcards/flashcards.html') });
        window.close();
    }));

    // ========== Theme ==========
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
