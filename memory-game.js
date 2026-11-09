/**
 * EduPeers - Memory Match Game Logic
 */

window.addEventListener('DOMContentLoaded', () => {
    /**
     * @template {typeof HTMLElement} T
     * @param {string} id
     * @param {T} ElementType
     * @returns {InstanceType<T>}
     */
    const requireElement = (id, ElementType) => {
        const element = document.getElementById(id);
        if (!(element instanceof ElementType)) {
            throw new Error(`Memory Game: Missing required element "${id}".`);
        }
        return /** @type {InstanceType<T>} */ (element);
    };

    let launcher;
    let overlay;
    let closeBtn;
    let restartInlineBtn;
    let grid;
    let moveDisplay;
    let timerDisplay;
    let matchDisplay;
    let bestDisplay;
    let statusDisplay;
    let resultDiv;
    let resultSummary;
    let restartBtn;
    let difficultySelect;

    try {
        launcher = requireElement('game-memory', HTMLElement);
        overlay = requireElement('memory-game-overlay', HTMLDivElement);
        closeBtn = requireElement('close-game', HTMLButtonElement);
        restartInlineBtn = requireElement('restart-game-inline', HTMLButtonElement);
        grid = requireElement('memory-grid', HTMLDivElement);
        moveDisplay = requireElement('move-count', HTMLElement);
        timerDisplay = requireElement('game-timer', HTMLElement);
        matchDisplay = requireElement('match-count', HTMLElement);
        bestDisplay = requireElement('best-score', HTMLElement);
        statusDisplay = requireElement('memory-status', HTMLParagraphElement);
        resultDiv = requireElement('game-result', HTMLDivElement);
        resultSummary = requireElement('game-result-summary', HTMLParagraphElement);
        restartBtn = requireElement('restart-game', HTMLButtonElement);
        difficultySelect = requireElement('memory-difficulty', HTMLSelectElement);
    } catch (error) {
        console.error(error instanceof Error ? error.message : 'Memory Game: Required elements not found.');
        return;
    }

    const STORAGE_KEY = 'edupeers_memory_match_best_runs';
    const difficultyConfig = {
        easy: { label: 'Easy', pairs: 6, columns: 4, mobileColumns: 3 },
        medium: { label: 'Medium', pairs: 8, columns: 4, mobileColumns: 3 },
        hard: { label: 'Hard', pairs: 10, columns: 5, mobileColumns: 4 }
    };

    const iconPool = [
        { icon: 'fa-atom', label: 'atom' },
        { icon: 'fa-brain', label: 'brain' },
        { icon: 'fa-microscope', label: 'microscope' },
        { icon: 'fa-dna', label: 'DNA' },
        { icon: 'fa-calculator', label: 'calculator' },
        { icon: 'fa-book-open', label: 'book' },
        { icon: 'fa-robot', label: 'robot' },
        { icon: 'fa-lightbulb', label: 'lightbulb' },
        { icon: 'fa-flask', label: 'flask' },
        { icon: 'fa-compass-drafting', label: 'drafting compass' },
        { icon: 'fa-globe', label: 'globe' },
        { icon: 'fa-graduation-cap', label: 'graduation cap' }
    ];

    let firstCard = null;
    let secondCard = null;
    let moves = 0;
    let matchedPairs = 0;
    let secondsElapsed = 0;
    let timerId = null;
    let boardLocked = false;
    let gameStarted = false;
    let lastFocusedElement = null;
    let currentDifficulty = Object.prototype.hasOwnProperty.call(difficultyConfig, difficultySelect.value)
        ? difficultySelect.value
        : 'medium';
    let bestRuns = loadBestRuns();

    difficultySelect.value = currentDifficulty;

    function loadBestRuns() {
        try {
            const rawValue = window.localStorage.getItem(STORAGE_KEY);
            if (!rawValue) return {};

            const parsedValue = JSON.parse(rawValue);
            return parsedValue && typeof parsedValue === 'object' ? parsedValue : {};
        } catch (error) {
            return {};
        }
    }

    function saveBestRuns() {
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bestRuns));
        } catch (error) {
            console.warn('Memory Game: Failed to persist best runs.', error);
        }
    }

    function getCurrentConfig() {
        return difficultyConfig[currentDifficulty] || difficultyConfig.medium;
    }

    function formatTime(totalSeconds) {
        const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
        const seconds = (totalSeconds % 60).toString().padStart(2, '0');
        return `${minutes}:${seconds}`;
    }

    function formatBestRun(run) {
        if (!run || typeof run.moves !== 'number' || typeof run.seconds !== 'number') {
            return '--';
        }

        return `${run.moves} moves / ${formatTime(run.seconds)}`;
    }

    function setStatus(message) {
        statusDisplay.textContent = message;
    }

    function updateStats() {
        const config = getCurrentConfig();
        moveDisplay.innerText = String(moves);
        timerDisplay.innerText = formatTime(secondsElapsed);
        matchDisplay.innerText = `${matchedPairs}/${config.pairs}`;
        bestDisplay.innerText = formatBestRun(bestRuns[currentDifficulty]);
    }

    function resetTimer() {
        window.clearInterval(timerId);
        timerId = null;
        secondsElapsed = 0;
        gameStarted = false;
        updateStats();
    }

    function startTimer() {
        if (gameStarted) return;

        gameStarted = true;
        window.clearInterval(timerId);
        timerId = window.setInterval(() => {
            secondsElapsed += 1;
            updateStats();
        }, 1000);
    }

    function shuffle(items) {
        const cloned = items.slice();

        for (let index = cloned.length - 1; index > 0; index -= 1) {
            const randomIndex = Math.floor(Math.random() * (index + 1));
            const temp = cloned[index];
            cloned[index] = cloned[randomIndex];
            cloned[randomIndex] = temp;
        }

        return cloned;
    }

    function resetTurn() {
        firstCard = null;
        secondCard = null;
        boardLocked = false;
    }

    function updateCardAccessibility(card, state) {
        const position = card.dataset.position;
        const label = card.dataset.label;

        if (state === 'matched') {
            card.setAttribute('aria-label', `Matched card ${position}, ${label}.`);
            return;
        }

        if (state === 'revealed') {
            card.setAttribute('aria-label', `Revealed card ${position}, ${label}.`);
            return;
        }

        card.setAttribute('aria-label', `Hidden card ${position}.`);
    }

    function revealCard(card) {
        card.classList.add('flipped');
        card.setAttribute('aria-pressed', 'true');
        updateCardAccessibility(card, 'revealed');
    }

    function hideCard(card) {
        card.classList.remove('flipped');
        card.setAttribute('aria-pressed', 'false');
        updateCardAccessibility(card, 'hidden');
    }

    function markMatched(card) {
        card.classList.add('matched', 'flipped');
        card.setAttribute('aria-disabled', 'true');
        card.disabled = true;

        const backFace = card.querySelector('.card-back');
        if (backFace) {
            backFace.classList.add('matched');
        }

        updateCardAccessibility(card, 'matched');
    }

    function isBetterRun(candidate, existing) {
        if (!existing) return true;
        if (candidate.moves < existing.moves) return true;
        if (candidate.moves === existing.moves && candidate.seconds < existing.seconds) return true;
        return false;
    }

    function storeBestRun() {
        const candidate = {
            difficulty: currentDifficulty,
            moves,
            seconds: secondsElapsed,
            updatedAt: Date.now()
        };

        const existing = bestRuns[currentDifficulty];
        const isNewBest = isBetterRun(candidate, existing);

        if (isNewBest) {
            bestRuns = {
                ...bestRuns,
                [currentDifficulty]: candidate
            };
            saveBestRuns();
        }

        return isNewBest;
    }

    function endGame() {
        const config = getCurrentConfig();
        const isNewBest = storeBestRun();

        window.clearInterval(timerId);
        timerId = null;

        grid.style.display = 'none';
        resultDiv.style.display = 'block';
        updateStats();

        resultSummary.innerText = `You cleared ${config.pairs} pairs on ${config.label} in ${moves} moves and ${formatTime(secondsElapsed)}.${isNewBest ? ' New personal best.' : ''}`;
        setStatus(isNewBest ? 'Board cleared. New personal best saved.' : 'Board cleared. Try another run.');

        const showToast = window['showToast'];
        if (typeof showToast === 'function') {
            showToast(isNewBest ? 'Memory Match complete. New best run saved.' : 'Memory Match complete.');
        }

        restartBtn.focus();
    }

    function handleMatchCheck() {
        if (!firstCard || !secondCard) {
            resetTurn();
            return;
        }

        const isMatch = firstCard.dataset.icon === secondCard.dataset.icon;

        if (isMatch) {
            markMatched(firstCard);
            markMatched(secondCard);
            matchedPairs += 1;
            updateStats();
            setStatus(`Match locked in. ${matchedPairs} of ${getCurrentConfig().pairs} pairs found.`);
            resetTurn();

            if (matchedPairs === getCurrentConfig().pairs) {
                window.setTimeout(endGame, 280);
            }
            return;
        }

        boardLocked = true;
        setStatus('Not a match. Try again.');
        window.setTimeout(() => {
            hideCard(firstCard);
            hideCard(secondCard);
            resetTurn();
        }, 850);
    }

    function handleCardInteraction(card) {
        if (boardLocked || card.classList.contains('flipped') || card.classList.contains('matched')) {
            return;
        }

        startTimer();
        revealCard(card);

        if (!firstCard) {
            firstCard = card;
            setStatus(`Card ${card.dataset.position} revealed. Pick one more.`);
            return;
        }

        secondCard = card;
        moves += 1;
        updateStats();
        handleMatchCheck();
    }

    function buildCard(cardData, index) {
        // Outer wrapper holds the square shape reliably across all browsers
        const wrapper = document.createElement('div');
        wrapper.className = 'memory-card-wrapper';

        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'memory-card';
        card.dataset.icon = cardData.icon;
        card.dataset.label = cardData.label;
        card.dataset.position = String(index + 1);
        card.style.animationDelay = `${index * 0.04}s`;
        card.setAttribute('aria-pressed', 'false');
        card.setAttribute('aria-disabled', 'false');
        updateCardAccessibility(card, 'hidden');
        card.innerHTML = `
            <div class="card-face card-front"></div>
            <div class="card-face card-back">
                <i class="fa-solid ${cardData.icon}" aria-hidden="true"></i>
            </div>
        `;

        card.addEventListener('click', () => {
            handleCardInteraction(card);
        });

        wrapper.appendChild(card);
        return wrapper;
    }

    function buildDeck() {
        const config = getCurrentConfig();
        const selectedIcons = shuffle(iconPool).slice(0, config.pairs);
        return shuffle(selectedIcons.concat(selectedIcons));
    }

    function applyBoardLayout() {
        const config = getCurrentConfig();
        grid.style.setProperty('--memory-columns', String(config.columns));
        grid.style.setProperty('--memory-mobile-columns', String(config.mobileColumns));
    }

    function initGame() {
        window.clearInterval(timerId);
        timerId = null;
        firstCard = null;
        secondCard = null;
        boardLocked = false;
        matchedPairs = 0;
        moves = 0;
        grid.innerHTML = '';
        grid.style.display = 'grid';
        resultDiv.style.display = 'none';
        applyBoardLayout();
        resetTimer();

        const deck = buildDeck();
        deck.forEach((cardData, index) => {
            grid.appendChild(buildCard(cardData, index));
        });

        // Focus first card for keyboard users
        const firstCard = grid.querySelector('.memory-card');
        if (firstCard instanceof HTMLElement) firstCard.focus();

        updateStats();
        setStatus(`Difficulty: ${getCurrentConfig().label}. Match all ${getCurrentConfig().pairs} pairs.`);
    }

    function openGame() {
        lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : launcher;
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
        initGame();
        closeBtn.focus();
    }

    function closeGame() {
        overlay.classList.remove('active');
        document.body.style.overflow = '';
        grid.innerHTML = '';
        grid.style.display = 'grid';
        resultDiv.style.display = 'none';
        matchedPairs = 0;
        moves = 0;
        resetTurn();
        resetTimer();
        setStatus('Select a difficulty and start matching.');

        if (lastFocusedElement instanceof HTMLElement) {
            lastFocusedElement.focus();
        }
    }

    function restartCurrentGame() {
        initGame();
        grid.focus();
    }

    launcher.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        openGame();
    }, true);

    launcher.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
            return;
        }

        event.preventDefault();
        openGame();
    });

    closeBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeGame();
    });

    restartInlineBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        restartCurrentGame();
    });

    restartBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        restartCurrentGame();
    });

    difficultySelect.addEventListener('change', () => {
        currentDifficulty = Object.prototype.hasOwnProperty.call(difficultyConfig, difficultySelect.value)
            ? difficultySelect.value
            : 'medium';

        if (overlay.classList.contains('active')) {
            initGame();
        } else {
            matchedPairs = 0;
            moves = 0;
            secondsElapsed = 0;
            updateStats();
            setStatus(`Difficulty set to ${getCurrentConfig().label}.`);
        }
    });

    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) {
            closeGame();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && overlay.classList.contains('active')) {
            closeGame();
        }
    });

    updateStats();
    setStatus('Select a difficulty and start matching.');
    window['launchMemoryGame'] = openGame;
});
