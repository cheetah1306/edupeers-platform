/**
 * EduPeers - Logic Trail game
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
            throw new Error(`Logic Trail: Missing required element "${id}".`);
        }
        return /** @type {InstanceType<T>} */ (element);
    };

    let launcher;
    let overlay;
    let closeButton;
    let restartInlineButton;
    let nextButton;
    let restartButton;
    let roundDisplay;
    let scoreDisplay;
    let streakDisplay;
    let bestDisplay;
    let statusDisplay;
    let categoryLabel;
    let difficultyLabel;
    let promptDisplay;
    let contextDisplay;
    let optionsContainer;
    let feedbackDisplay;
    let resultPanel;
    let resultSummary;
    let trailCard;

    try {
        launcher = requireElement('game-logic', HTMLDivElement);
        overlay = requireElement('logic-trail-overlay', HTMLDivElement);
        closeButton = requireElement('logic-close-game', HTMLButtonElement);
        restartInlineButton = requireElement('logic-restart-inline', HTMLButtonElement);
        nextButton = requireElement('logic-next-btn', HTMLButtonElement);
        restartButton = requireElement('logic-restart-btn', HTMLButtonElement);
        roundDisplay = requireElement('logic-round-count', HTMLElement);
        scoreDisplay = requireElement('logic-score-count', HTMLElement);
        streakDisplay = requireElement('logic-streak-count', HTMLElement);
        bestDisplay = requireElement('logic-best-score', HTMLElement);
        statusDisplay = requireElement('logic-status', HTMLParagraphElement);
        categoryLabel = requireElement('logic-category-label', HTMLElement);
        difficultyLabel = requireElement('logic-difficulty-label', HTMLElement);
        promptDisplay = requireElement('logic-prompt', HTMLDivElement);
        contextDisplay = requireElement('logic-context', HTMLDivElement);
        optionsContainer = requireElement('logic-options', HTMLDivElement);
        feedbackDisplay = requireElement('logic-feedback', HTMLDivElement);
        resultPanel = requireElement('logic-result', HTMLDivElement);
        resultSummary = requireElement('logic-result-summary', HTMLParagraphElement);
        trailCard = overlay.querySelector('.logic-trail-card');

        if (!(trailCard instanceof HTMLDivElement)) {
            throw new Error('Logic Trail: Missing trail card shell.');
        }
    } catch (error) {
        console.error(error instanceof Error ? error.message : 'Logic Trail: Setup failed.');
        return;
    }

    const STORAGE_KEY = 'edupeers_logic_trail_best_score';
    const SESSION_LENGTH = 5;
    const optionLetters = ['A', 'B', 'C', 'D'];
    const difficultyPoints = {
        'Warm-up': 10,
        Core: 15,
        Advanced: 20
    };

    /** @type {Array<{category: string, difficulty: 'Warm-up' | 'Core' | 'Advanced', prompt: string, context: string, options: string[], answer: number, explanation: string}>} */
    const puzzleBank = [
        {
            category: 'Pattern',
            difficulty: 'Warm-up',
            prompt: '2, 6, 12, 20, 30, ?',
            context: 'Each step grows by the next even number. Choose the next value in the sequence.',
            options: ['36', '40', '42', '44'],
            answer: 2,
            explanation: 'The differences are +4, +6, +8, +10, so the next jump is +12, which gives 42.'
        },
        {
            category: 'Arrangement',
            difficulty: 'Core',
            prompt: 'Mira sits left of Dev. Dev sits left of Noor. Who is in the middle?',
            context: 'Only one arrangement satisfies all three seat relations.',
            options: ['Mira', 'Dev', 'Noor', 'Cannot be determined'],
            answer: 1,
            explanation: 'The order is Mira, Dev, Noor, so Dev is in the middle.'
        },
        {
            category: 'Condition',
            difficulty: 'Core',
            prompt: 'If all coders are planners, and some planners are gamers, which statement must be true?',
            context: 'Use only what the statements guarantee.',
            options: ['All gamers are coders', 'Some coders are gamers', 'All coders are planners', 'No planners are gamers'],
            answer: 2,
            explanation: 'The first statement directly guarantees that every coder is a planner.'
        },
        {
            category: 'Pattern',
            difficulty: 'Warm-up',
            prompt: '3, 9, 27, 81, ?',
            context: 'The rule stays consistent through the full trail.',
            options: ['108', '162', '243', '324'],
            answer: 2,
            explanation: 'Each term is multiplied by 3, so 81 becomes 243.'
        },
        {
            category: 'Code',
            difficulty: 'Advanced',
            prompt: 'If STUDY is coded as 19202545, how is LEARN coded?',
            context: 'Each letter becomes its alphabetical position joined together.',
            options: ['12518144', '12511814', '1251181414', '1215181418'],
            answer: 1,
            explanation: 'L=12, E=5, A=1, R=18, N=14, so the code is 12511814.'
        },
        {
            category: 'Selection',
            difficulty: 'Core',
            prompt: 'You have four cards: A, D, 4, 7. Rule: if a card has a vowel on one side, it has an even number on the other. Which cards must you flip?',
            context: 'Choose the exact set needed to test the rule.',
            options: ['A and 4', 'A and 7', 'D and 4', 'Only A'],
            answer: 1,
            explanation: 'You must check the vowel card A and the odd number 7, which could break the rule.'
        },
        {
            category: 'Sequence',
            difficulty: 'Warm-up',
            prompt: '1, 1, 2, 3, 5, 8, ?',
            context: 'Each term depends on the two before it.',
            options: ['11', '12', '13', '15'],
            answer: 2,
            explanation: 'This is the Fibonacci pattern, so 5 + 8 gives 13.'
        },
        {
            category: 'Comparison',
            difficulty: 'Advanced',
            prompt: 'Riya is taller than Sam. Sam is taller than Ishan. Aarav is taller than Riya. Who is the shortest?',
            context: 'Use the full chain from tallest to shortest.',
            options: ['Riya', 'Sam', 'Ishan', 'Aarav'],
            answer: 2,
            explanation: 'The order is Aarav, Riya, Sam, Ishan, so Ishan is the shortest.'
        },
        {
            category: 'Math Logic',
            difficulty: 'Core',
            prompt: 'A bag holds red, blue, and green marbles. You pick one marble without looking. What is the minimum number of picks needed to guarantee two marbles of the same color?',
            context: 'Think about the worst-case draw pattern.',
            options: ['2', '3', '4', '5'],
            answer: 2,
            explanation: 'In the worst case you draw one of each color first, so the fourth marble guarantees a match.'
        },
        {
            category: 'Pattern',
            difficulty: 'Advanced',
            prompt: 'Find the missing term: AZ, BY, CX, ?',
            context: 'One side moves forward through the alphabet while the other moves backward.',
            options: ['DW', 'DV', 'EW', 'EV'],
            answer: 0,
            explanation: 'The first letter advances A, B, C, D while the second retreats Z, Y, X, W.'
        }
    ];

    let bestScore = loadBestScore();
    let roundIndex = 0;
    let score = 0;
    let streak = 0;
    let currentSelection = null;
    let activePuzzles = [];
    let lastFocusedElement = null;

    function loadBestScore() {
        const rawValue = window.localStorage.getItem(STORAGE_KEY);
        const parsedValue = Number(rawValue);
        return Number.isFinite(parsedValue) ? parsedValue : 0;
    }

    function saveBestScore(value) {
        try {
            window.localStorage.setItem(STORAGE_KEY, String(value));
        } catch (error) {
            console.warn('Logic Trail: Failed to save best score.', error);
        }
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

    function setStatus(message) {
        statusDisplay.textContent = message;
    }

    function updateStats() {
        roundDisplay.textContent = `${Math.min(roundIndex + 1, activePuzzles.length || 1)}/${activePuzzles.length || 1}`;
        scoreDisplay.textContent = String(score);
        streakDisplay.textContent = String(streak);
        bestDisplay.textContent = String(bestScore);
    }

    function setNextButtonVisible(isVisible) {
        nextButton.classList.toggle('is-visible', isVisible);
        nextButton.disabled = !isVisible;
    }

    function renderPuzzle() {
        const puzzle = activePuzzles[roundIndex];
        if (!puzzle) {
            return;
        }

        currentSelection = null;
        categoryLabel.textContent = puzzle.category;
        difficultyLabel.textContent = puzzle.difficulty;
        promptDisplay.textContent = puzzle.prompt;
        contextDisplay.textContent = puzzle.context;
        feedbackDisplay.textContent = 'Select one answer to continue.';
        optionsContainer.innerHTML = '';
        setNextButtonVisible(false);
        nextButton.innerHTML = roundIndex === activePuzzles.length - 1
            ? '<span>Finish Trail</span><i class="fa-solid fa-flag-checkered"></i>'
            : '<span>Next Puzzle</span><i class="fa-solid fa-arrow-right"></i>';

        puzzle.options.forEach((optionText, optionIndex) => {
            const optionButton = document.createElement('button');
            optionButton.type = 'button';
            optionButton.className = 'logic-option';
            optionButton.dataset.index = String(optionIndex);
            optionButton.innerHTML = `
                <span class="logic-option-index">${optionLetters[optionIndex] || String(optionIndex + 1)}</span>
                <span class="logic-option-copy">${optionText}</span>
            `;

            optionButton.addEventListener('click', () => {
                handleOptionSelect(optionIndex);
            });

            optionsContainer.appendChild(optionButton);
        });

        updateStats();
        setStatus(`Round ${roundIndex + 1} is ready. Read carefully and choose the strongest answer.`);

        const firstOption = optionsContainer.querySelector('.logic-option');
        if (firstOption instanceof HTMLButtonElement) {
            firstOption.focus();
        }
    }

    function handleOptionSelect(selectedIndex) {
        if (currentSelection !== null) {
            return;
        }

        const puzzle = activePuzzles[roundIndex];
        const optionButtons = Array.from(optionsContainer.querySelectorAll('.logic-option'));
        currentSelection = selectedIndex;

        optionButtons.forEach((button, buttonIndex) => {
            if (!(button instanceof HTMLButtonElement)) {
                return;
            }

            button.disabled = true;
            button.classList.toggle('is-selected', buttonIndex === selectedIndex);

            if (buttonIndex === puzzle.answer) {
                button.classList.add('is-correct');
            } else if (buttonIndex === selectedIndex) {
                button.classList.add('is-wrong');
            }
        });

        if (selectedIndex === puzzle.answer) {
            const basePoints = difficultyPoints[puzzle.difficulty] || 10;
            streak += 1;
            score += basePoints + (streak - 1) * 2;
            feedbackDisplay.textContent = `Correct. ${puzzle.explanation}`;
            setStatus(`Correct answer locked in. Current streak: ${streak}.`);
        } else {
            streak = 0;
            feedbackDisplay.textContent = `Not this time. ${puzzle.explanation}`;
            setStatus('Incorrect answer. Review the rule and continue.');
        }

        updateStats();
        setNextButtonVisible(true);
        nextButton.focus();
    }

    function showResult() {
        trailCard.style.display = 'none';
        resultPanel.style.display = 'block';

        const isNewBest = score > bestScore;
        if (isNewBest) {
            bestScore = score;
            saveBestScore(bestScore);
            updateStats();
        }

        resultSummary.textContent = isNewBest
            ? `You completed ${activePuzzles.length} puzzles with ${score} points and set a new best score.`
            : `You completed ${activePuzzles.length} puzzles with ${score} points. Best score remains ${bestScore}.`;

        setStatus(isNewBest ? 'Trail complete. New best score saved.' : 'Trail complete. Ready for another run.');

        const showToast = window['showToast'];
        if (typeof showToast === 'function') {
            showToast(isNewBest ? 'Logic Trail complete. New best score saved.' : 'Logic Trail complete.');
        }

        restartButton.focus();
    }

    function nextPuzzle() {
        if (currentSelection === null) {
            return;
        }

        if (roundIndex >= activePuzzles.length - 1) {
            showResult();
            return;
        }

        roundIndex += 1;
        renderPuzzle();
    }

    function startSession() {
        activePuzzles = shuffle(puzzleBank).slice(0, Math.min(SESSION_LENGTH, puzzleBank.length));
        roundIndex = 0;
        score = 0;
        streak = 0;
        trailCard.style.display = 'block';
        resultPanel.style.display = 'none';
        updateStats();
        renderPuzzle();
    }

    function openGame() {
        lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : launcher;
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
        startSession();
        closeButton.focus();
    }

    function closeGame() {
        overlay.classList.remove('active');
        document.body.style.overflow = '';
        setStatus('Open the trail and solve each puzzle before moving ahead.');
        feedbackDisplay.textContent = 'Select one answer to continue.';
        optionsContainer.innerHTML = '';
        trailCard.style.display = 'block';
        resultPanel.style.display = 'none';
        setNextButtonVisible(false);
        updateStats();

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

    nextButton.addEventListener('click', (event) => {
        event.preventDefault();
        nextPuzzle();
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
    setStatus('Open the trail and solve each puzzle before moving ahead.');
});
