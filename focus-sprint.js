/**
 * EduPeers - Focus Sprint game
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
            throw new Error(`Focus Sprint: Missing required element "${id}".`);
        }
        return /** @type {InstanceType<T>} */ (element);
    };

    let launcher;
    let overlay;
    let difficultySelect;
    let restartInlineButton;
    let closeButton;
    let restartButton;
    let timeDisplay;
    let scoreDisplay;
    let clearsDisplay;
    let bestDisplay;
    let statusDisplay;
    let targetTokenDisplay;
    let targetCountDisplay;
    let instructionDisplay;
    let board;
    let feedbackDisplay;
    let resultPanel;
    let resultSummary;
    let sprintCard;

    try {
        launcher = requireElement('game-attention', HTMLDivElement);
        overlay = requireElement('focus-sprint-overlay', HTMLDivElement);
        difficultySelect = requireElement('focus-difficulty', HTMLSelectElement);
        restartInlineButton = requireElement('focus-restart-inline', HTMLButtonElement);
        closeButton = requireElement('focus-close-game', HTMLButtonElement);
        restartButton = requireElement('focus-restart-btn', HTMLButtonElement);
        timeDisplay = requireElement('focus-time-count', HTMLElement);
        scoreDisplay = requireElement('focus-score-count', HTMLElement);
        clearsDisplay = requireElement('focus-round-count', HTMLElement);
        bestDisplay = requireElement('focus-best-score', HTMLElement);
        statusDisplay = requireElement('focus-status', HTMLParagraphElement);
        targetTokenDisplay = requireElement('focus-target-token', HTMLElement);
        targetCountDisplay = requireElement('focus-target-count', HTMLElement);
        instructionDisplay = requireElement('focus-instruction', HTMLDivElement);
        board = requireElement('focus-board', HTMLDivElement);
        feedbackDisplay = requireElement('focus-feedback', HTMLDivElement);
        resultPanel = requireElement('focus-result', HTMLDivElement);
        resultSummary = requireElement('focus-result-summary', HTMLParagraphElement);
        sprintCard = overlay.querySelector('.focus-sprint-card');

        if (!(sprintCard instanceof HTMLDivElement)) {
            throw new Error('Focus Sprint: Missing sprint card shell.');
        }
    } catch (error) {
        console.error(error instanceof Error ? error.message : 'Focus Sprint: Setup failed.');
        return;
    }

    const STORAGE_KEY = 'edupeers_focus_sprint_best_scores';
    const difficultyConfig = {
        easy: {
            label: 'Easy',
            seconds: 45,
            cells: 9,
            columns: 3,
            mobileColumns: 3,
            targets: 3,
            hitPoints: 8,
            missPenalty: 3,
            clearBonus: 18
        },
        medium: {
            label: 'Medium',
            seconds: 40,
            cells: 12,
            columns: 4,
            mobileColumns: 3,
            targets: 4,
            hitPoints: 10,
            missPenalty: 4,
            clearBonus: 24
        },
        hard: {
            label: 'Hard',
            seconds: 35,
            cells: 16,
            columns: 4,
            mobileColumns: 4,
            targets: 5,
            hitPoints: 12,
            missPenalty: 5,
            clearBonus: 32
        }
    };

    const tokenFamilies = [
        { target: 'A7', distractors: ['A1', 'A9', '47', 'AT', 'Z7', 'A4'] },
        { target: 'B3', distractors: ['B8', '83', 'B9', 'R3', 'E3', 'B5'] },
        { target: 'Q5', distractors: ['Q8', 'Q6', 'O5', 'QS', 'G5', '95'] },
        { target: 'L2', distractors: ['L7', '12', 'LZ', 'I2', 'L8', 'LT'] },
        { target: 'M4', distractors: ['N4', 'M1', '44', 'MA', 'H4', 'M9'] },
        { target: 'X9', distractors: ['X8', 'K9', 'XG', '89', 'Y9', 'X3'] },
        { target: 'D6', distractors: ['DG', 'D8', '06', 'O6', 'B6', 'D0'] },
        { target: 'T1', distractors: ['TI', 'T7', '11', 'Y1', 'TL', 'F1'] },
        { target: 'P8', distractors: ['PB', 'P3', 'R8', 'P6', '98', 'PE'] },
        { target: 'C4', distractors: ['CG', 'C1', 'G4', 'O4', 'C9', '44'] }
    ];

    let bestScores = loadBestScores();
    let currentDifficulty = Object.prototype.hasOwnProperty.call(difficultyConfig, difficultySelect.value)
        ? difficultySelect.value
        : 'medium';
    let timeRemaining = 0;
    let score = 0;
    let clears = 0;
    let streak = 0;
    let totalCorrect = 0;
    let totalWrong = 0;
    let targetsRemaining = 0;
    let timerId = null;
    let nextRoundTimeout = null;
    let gameActive = false;
    let lastFocusedElement = null;
    /** @type {{ target: string, distractors: string[] } | null} */
    let activeFamily = null;

    difficultySelect.value = currentDifficulty;

    function loadBestScores() {
        try {
            const rawValue = window.localStorage.getItem(STORAGE_KEY);
            if (!rawValue) return {};
            const parsedValue = JSON.parse(rawValue);
            return parsedValue && typeof parsedValue === 'object' ? parsedValue : {};
        } catch (error) {
            return {};
        }
    }

    function saveBestScores() {
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bestScores));
        } catch (error) {
            console.warn('Focus Sprint: Failed to persist best scores.', error);
        }
    }

    function getConfig() {
        return difficultyConfig[currentDifficulty] || difficultyConfig.medium;
    }

    function formatTime(totalSeconds) {
        const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
        const seconds = (totalSeconds % 60).toString().padStart(2, '0');
        return `${minutes}:${seconds}`;
    }

    function setStatus(message) {
        statusDisplay.textContent = message;
    }

    function updateStats() {
        const best = Number(bestScores[currentDifficulty]) || 0;
        timeDisplay.textContent = formatTime(Math.max(timeRemaining, 0));
        scoreDisplay.textContent = String(score);
        clearsDisplay.textContent = String(clears);
        bestDisplay.textContent = String(best);
        targetCountDisplay.textContent = String(targetsRemaining);
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

    function applyBoardLayout() {
        const config = getConfig();
        board.style.setProperty('--focus-columns', String(config.columns));
        board.style.setProperty('--focus-mobile-columns', String(config.mobileColumns));
    }

    function clearTimer() {
        window.clearInterval(timerId);
        timerId = null;
    }

    function clearNextRoundTimeout() {
        window.clearTimeout(nextRoundTimeout);
        nextRoundTimeout = null;
    }

    function disableBoard() {
        const buttons = board.querySelectorAll('.focus-cell');
        buttons.forEach((button) => {
            if (button instanceof HTMLButtonElement) {
                button.disabled = true;
            }
        });
    }

    function buildBoardTokens(family) {
        const config = getConfig();
        const tokens = [];

        for (let count = 0; count < config.targets; count += 1) {
            tokens.push({ value: family.target, isTarget: true });
        }

        const requiredDistractors = config.cells - config.targets;
        while (tokens.length < config.cells) {
            const distractor = family.distractors[Math.floor(Math.random() * family.distractors.length)];
            tokens.push({ value: distractor, isTarget: false });
        }

        return shuffle(tokens).slice(0, config.cells);
    }

    function renderRound() {
        if (!gameActive) {
            return;
        }

        clearNextRoundTimeout();
        board.innerHTML = '';
        activeFamily = shuffle(tokenFamilies)[0];

        if (!activeFamily) {
            return;
        }

        const config = getConfig();
        const tokens = buildBoardTokens(activeFamily);
        targetsRemaining = config.targets;
        targetTokenDisplay.textContent = activeFamily.target;
        instructionDisplay.textContent = `Tap every "${activeFamily.target}" tile. Similar-looking noise will try to mislead you.`;
        feedbackDisplay.textContent = `Clean round bonus: ${config.clearBonus} points. Wrong taps cost ${config.missPenalty}.`;
        applyBoardLayout();
        updateStats();

        tokens.forEach((token, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'focus-cell';
            button.textContent = token.value;
            button.setAttribute('role', 'gridcell');
            button.setAttribute('aria-label', token.isTarget
                ? `Target tile ${index + 1}, ${token.value}`
                : `Distractor tile ${index + 1}, ${token.value}`);

            button.addEventListener('click', () => {
                handleCellPress(button, token.isTarget);
            });

            board.appendChild(button);
        });

        const firstButton = board.querySelector('.focus-cell');
        if (firstButton instanceof HTMLButtonElement) {
            firstButton.focus();
        }

        setStatus(`Focus lock active. Find ${config.targets} copies of ${activeFamily.target}.`);
    }

    function advanceRound() {
        if (!gameActive) {
            return;
        }

        clears += 1;
        streak += 1;
        score += getConfig().clearBonus + streak * 2;
        feedbackDisplay.textContent = `Board cleared. Bonus secured. New round loading now.`;
        setStatus(`Great focus. ${clears} board${clears === 1 ? '' : 's'} cleared.`);
        updateStats();
        disableBoard();

        nextRoundTimeout = window.setTimeout(() => {
            renderRound();
        }, 450);
    }

    function handleCellPress(button, isTarget) {
        if (!gameActive || button.disabled) {
            return;
        }

        const config = getConfig();
        button.disabled = true;

        if (isTarget) {
            button.classList.add('is-hit');
            score += config.hitPoints;
            totalCorrect += 1;
            targetsRemaining -= 1;
            updateStats();

            if (targetsRemaining <= 0) {
                advanceRound();
                return;
            }

            feedbackDisplay.textContent = `Correct. ${targetsRemaining} target${targetsRemaining === 1 ? '' : 's'} left on this board.`;
            setStatus(`Good catch. Keep filtering the board.`);
            return;
        }

        button.classList.add('is-miss');
        totalWrong += 1;
        streak = 0;
        score = Math.max(0, score - config.missPenalty);
        feedbackDisplay.textContent = `That tile was noise. Stay on ${activeFamily ? activeFamily.target : 'the target'}.`;
        setStatus('Miss registered. Reset your attention and continue.');
        updateStats();
    }

    function endGame() {
        if (!gameActive) {
            return;
        }

        gameActive = false;
        clearTimer();
        clearNextRoundTimeout();
        disableBoard();

        const attempts = totalCorrect + totalWrong;
        const accuracy = attempts > 0 ? Math.round((totalCorrect / attempts) * 100) : 100;
        const currentBest = Number(bestScores[currentDifficulty]) || 0;
        const isNewBest = score > currentBest;

        if (isNewBest) {
            bestScores = {
                ...bestScores,
                [currentDifficulty]: score
            };
            saveBestScores();
        }

        updateStats();
        sprintCard.style.display = 'none';
        resultPanel.style.display = 'block';
        resultSummary.textContent = isNewBest
            ? `You cleared ${clears} board${clears === 1 ? '' : 's'}, landed ${accuracy}% accuracy, and set a new ${getConfig().label.toLowerCase()} best with ${score} points.`
            : `You cleared ${clears} board${clears === 1 ? '' : 's'} with ${accuracy}% accuracy and finished on ${score} points.`;

        setStatus(isNewBest ? 'Sprint complete. New best score saved.' : 'Sprint complete. Ready for another run.');

        const showToast = window['showToast'];
        if (typeof showToast === 'function') {
            showToast(isNewBest ? 'Focus Sprint complete. New best score saved.' : 'Focus Sprint complete.');
        }

        restartButton.focus();
    }

    function startTimer() {
        clearTimer();
        timerId = window.setInterval(() => {
            timeRemaining -= 1;
            updateStats();

            if (timeRemaining <= 0) {
                timeRemaining = 0;
                updateStats();
                endGame();
            }
        }, 1000);
    }

    function startSession() {
        const config = getConfig();
        clearTimer();
        clearNextRoundTimeout();
        gameActive = true;
        timeRemaining = config.seconds;
        score = 0;
        clears = 0;
        streak = 0;
        totalCorrect = 0;
        totalWrong = 0;
        targetsRemaining = config.targets;
        resultPanel.style.display = 'none';
        sprintCard.style.display = 'block';
        updateStats();
        renderRound();
        startTimer();
    }

    function openGame() {
        lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : launcher;
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
        startSession();
        closeButton.focus();
    }

    function closeGame() {
        clearTimer();
        clearNextRoundTimeout();
        gameActive = false;
        overlay.classList.remove('active');
        document.body.style.overflow = '';
        board.innerHTML = '';
        resultPanel.style.display = 'none';
        sprintCard.style.display = 'block';
        feedbackDisplay.textContent = 'Clean rounds build momentum. Wrong taps cost points.';
        targetTokenDisplay.textContent = 'A7';
        targetCountDisplay.textContent = '0';
        instructionDisplay.textContent = 'Tap every matching tile before the clock expires.';
        timeRemaining = 0;
        score = 0;
        clears = 0;
        streak = 0;
        totalCorrect = 0;
        totalWrong = 0;
        targetsRemaining = 0;
        updateStats();
        setStatus('Stay on the target and ignore the visual noise.');

        if (lastFocusedElement instanceof HTMLElement) {
            lastFocusedElement.focus();
        }
    }

    launcher.tabIndex = 0;

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
        event.stopPropagation();
        openGame();
    }, true);

    closeButton.addEventListener('click', (event) => {
        event.preventDefault();
        closeGame();
    });

    restartInlineButton.addEventListener('click', (event) => {
        event.preventDefault();
        startSession();
    });

    restartButton.addEventListener('click', (event) => {
        event.preventDefault();
        startSession();
    });

    difficultySelect.addEventListener('change', () => {
        currentDifficulty = Object.prototype.hasOwnProperty.call(difficultyConfig, difficultySelect.value)
            ? difficultySelect.value
            : 'medium';
        updateStats();

        if (overlay.classList.contains('active')) {
            startSession();
            return;
        }

        setStatus(`Difficulty set to ${getConfig().label}.`);
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
    setStatus('Stay on the target and ignore the visual noise.');
});
