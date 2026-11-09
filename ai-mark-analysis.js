document.addEventListener('DOMContentLoaded', () => {
  const currentUser = localStorage.getItem('edupeers_username');
  if (!currentUser) {
    window.location.href = 'login.html';
    return;
  }

  const profilePhoto = localStorage.getItem('edupeers_photo');
  const topbarName = document.getElementById('topbar-user-name');
  const topbarAvatar = document.getElementById('topbar-avatar');
  const marksContainer = document.getElementById('marks-container');
  const addSubjectBtn = document.getElementById('add-subject-btn');
  const analyzeBtn = document.getElementById('analyze-btn');
  const loader = document.getElementById('analysis-loader');
  const resultContainer = document.getElementById('analysis-result');
  const defaultTotal = 100;

  let currentEntries = [];
  let currentSummary = null;
  let currentAnalysis = null;

  if (topbarName) topbarName.textContent = currentUser;
  if (topbarAvatar) {
    if (profilePhoto) {
      topbarAvatar.innerHTML = `<img src="${profilePhoto}" alt="Avatar" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
    } else {
      topbarAvatar.textContent = currentUser.charAt(0).toUpperCase();
    }
  }

  const showToast = (message) => {
    let toast = document.getElementById('ui-toast');
    if (!(toast instanceof HTMLElement)) {
      toast = document.createElement('div');
      toast.id = 'ui-toast';
      toast.style.position = 'fixed';
      toast.style.left = '50%';
      toast.style.bottom = '20px';
      toast.style.transform = 'translateX(-50%)';
      toast.style.background = 'rgba(10, 14, 23, 0.92)';
      toast.style.color = '#fff';
      toast.style.padding = '0.8rem 1rem';
      toast.style.borderRadius = '999px';
      toast.style.fontSize = '0.92rem';
      toast.style.fontWeight = '600';
      toast.style.zIndex = '9999';
      toast.style.boxShadow = '0 12px 28px rgba(0, 0, 0, 0.35)';
      toast.style.border = '1px solid rgba(255,255,255,0.08)';
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 180ms ease';
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.opacity = '1';
    window.clearTimeout(showToast.timerId);
    showToast.timerId = window.setTimeout(() => {
      toast.style.opacity = '0';
    }, 1800);
  };

  const escapeHtml = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const createMarkRow = (entry = {}) => {
    const row = document.createElement('div');
    row.className = 'mark-entry-row';
    row.innerHTML = `
      <input type="text" class="subject-input" placeholder="Subject" value="${escapeHtml(entry.subject || '')}" maxlength="80">
      <input type="number" class="score-input" placeholder="Scored" value="${entry.score ?? ''}" min="0" step="0.01" inputmode="decimal" style="max-width: 150px;">
      <input type="number" class="total-input" placeholder="Out of" value="${entry.total ?? defaultTotal}" min="1" step="0.01" inputmode="decimal" style="max-width: 140px;">
      <button type="button" class="remove-row-btn" title="Remove subject">
        <i class="fa-solid fa-trash"></i>
      </button>
    `;

    const removeBtn = row.querySelector('.remove-row-btn');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        row.remove();
        ensureAtLeastOneRow();
      });
    }

    return row;
  };

  const ensureAtLeastOneRow = () => {
    if (!marksContainer) return;
    if (marksContainer.children.length === 0) {
      marksContainer.appendChild(createMarkRow());
    }
  };

  const seedRows = () => {
    if (!marksContainer) return;
    const starterRows = [
      { subject: '', score: '', total: defaultTotal },
      { subject: '', score: '', total: defaultTotal },
      { subject: '', score: '', total: defaultTotal }
    ];

    starterRows.forEach((entry) => {
      marksContainer.appendChild(createMarkRow(entry));
    });
  };

  const collectEntries = () => {
    if (!marksContainer) return [];

    const rows = Array.from(marksContainer.querySelectorAll('.mark-entry-row'));
    const entries = [];

    for (const row of rows) {
      const subject = row.querySelector('.subject-input')?.value.trim() || '';
      const scoreRaw = row.querySelector('.score-input')?.value.trim() || '';
      const totalRaw = row.querySelector('.total-input')?.value.trim() || '';

      if (!subject && !scoreRaw) {
        continue;
      }

      if (!subject || !scoreRaw) {
        throw new Error('Each filled row needs both a subject name and scored marks.');
      }

      const score = Number(scoreRaw);
      const total = totalRaw ? Number(totalRaw) : defaultTotal;

      if (!Number.isFinite(score) || score < 0) {
        throw new Error(`Enter valid scored marks for ${subject}.`);
      }

      if (!Number.isFinite(total) || total <= 0) {
        throw new Error(`Enter a valid total marks value for ${subject}.`);
      }

      if (score > total) {
        throw new Error(`${subject} has scored marks greater than total marks.`);
      }

      entries.push({ subject, score, total });
    }

    if (entries.length === 0) {
      throw new Error('Add at least one subject before starting the analysis.');
    }

    return entries;
  };

  const renderSummary = (summary) => {
    if (!summary) return '';

    const best = summary.highest || {};
    const weakest = summary.lowest || {};

    return `
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.8rem; margin-bottom: 1.4rem;">
        <div style="padding: 0.9rem 1rem; border-radius: 14px; background: rgba(0, 243, 255, 0.08); border: 1px solid rgba(0, 243, 255, 0.18);">
          <div style="font-size: 0.78rem; letter-spacing: 1px; text-transform: uppercase; opacity: 0.7;">Average</div>
          <div style="font-size: 1.4rem; font-weight: 700;">${summary.averagePercentage}%</div>
        </div>
        <div style="padding: 0.9rem 1rem; border-radius: 14px; background: rgba(76, 217, 100, 0.08); border: 1px solid rgba(76, 217, 100, 0.2);">
          <div style="font-size: 0.78rem; letter-spacing: 1px; text-transform: uppercase; opacity: 0.7;">Best Subject</div>
          <div style="font-size: 1rem; font-weight: 700;">${escapeHtml(best.subject || '-')}</div>
          <div style="opacity: 0.78;">${best.percentage ?? '-'}%</div>
        </div>
        <div style="padding: 0.9rem 1rem; border-radius: 14px; background: rgba(255, 159, 67, 0.08); border: 1px solid rgba(255, 159, 67, 0.2);">
          <div style="font-size: 0.78rem; letter-spacing: 1px; text-transform: uppercase; opacity: 0.7;">Needs Focus</div>
          <div style="font-size: 1rem; font-weight: 700;">${escapeHtml(weakest.subject || '-')}</div>
          <div style="opacity: 0.78;">${weakest.percentage ?? '-'}%</div>
        </div>
      </div>
    `;
  };

  const extractQuestions = (analysisText) => {
    const questions = [];
    const lines = analysisText.split('\n');
    
    let inQuestionsSection = false;
    for (const line of lines) {
      if (line.toLowerCase().includes('follow-up questions') || line.toLowerCase().includes('questions to sharpen')) {
        inQuestionsSection = true;
        continue;
      }
      
      if (inQuestionsSection) {
        const qMatch = line.match(/Q:\s*(.+)/i) || line.match(/^(\d+[\.\)]\s*.+)/);
        if (qMatch) {
          const questionText = qMatch[1] ? qMatch[1].trim() : qMatch[0].replace(/^[\d\.\)]+\s*/, '').trim();
          if (questionText && questionText.length > 10) {
            questions.push(questionText);
          }
        } else if (line.trim() && !line.trim().startsWith('#') && questions.length > 0 && !line.trim().startsWith('-') && !line.trim().startsWith('|')) {
          break;
        }
      }
    }
    
    return questions.slice(0, 3);
  };

  const renderFollowUpQuestions = (questions, analysisText) => {
    if (!questions || questions.length === 0) return '';
    
    const questionsHtml = questions.map((q, i) => `
      <div style="margin-bottom: 1.2rem; padding: 1rem; background: rgba(0, 243, 255, 0.05); border-radius: 12px; border: 1px solid rgba(0, 243, 255, 0.15);">
        <div style="font-size: 0.85rem; color: var(--hud-cyan, #00f3ff); margin-bottom: 0.5rem; font-weight: 600;">Question ${i + 1}</div>
        <div style="font-size: 1rem; color: white; margin-bottom: 0.8rem;">${escapeHtml(q)}</div>
        <textarea class="followup-answer" data-question="${i}" placeholder="Your answer..." style="width: 100%; padding: 0.8rem; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.3); color: white; font-size: 0.95rem; resize: vertical; min-height: 80px; box-sizing: border-box;"></textarea>
      </div>
    `).join('');

    return `
      <div id="followup-section" style="margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid rgba(255,255,255,0.1);">
        <div style="display: flex; align-items: center; gap: 0.8rem; margin-bottom: 1.5rem;">
          <i class="fa-solid fa-circle-question" style="color: var(--hud-cyan, #00f3ff); font-size: 1.4rem;"></i>
          <h3 style="color: white; margin: 0; font-size: 1.2rem;">Help us personalize your plan</h3>
        </div>
        <p style="color: rgba(255,255,255,0.7); margin-bottom: 1.5rem; font-size: 0.95rem;">Answer these 3 questions to get a highly customized study plan:</p>
        ${questionsHtml}
        <button id="get-refined-btn" class="feature-link-cta" style="width: 100%; margin-top: 1rem; background: linear-gradient(135deg, var(--hud-cyan, #00f3ff), #00c4b8); color: #0a0e17; font-weight: 700;">
          <i class="fa-solid fa-wand-magic-sparkles"></i> Get Personalized Plan
        </button>
      </div>
    `;
  };

  const renderRefinedResult = (refinedAnalysis) => {
    return `
      <div style="margin-top: 2rem; padding: 1.5rem; background: linear-gradient(135deg, rgba(0, 243, 255, 0.1), rgba(0, 200, 180, 0.05)); border-radius: 16px; border: 2px solid var(--hud-cyan, #00f3ff);">
        <div style="display: flex; align-items: center; gap: 0.8rem; margin-bottom: 1rem;">
          <i class="fa-solid fa-award" style="color: var(--hud-cyan, #00f3ff); font-size: 1.5rem;"></i>
          <h3 style="color: var(--hud-cyan, #00f3ff); margin: 0; font-size: 1.3rem;">Your Personalized Study Plan</h3>
        </div>
        <div style="color: white; line-height: 1.7;">${parseMarkdown(refinedAnalysis)}</div>
      </div>
    `;
  };

  const setLoadingState = (isLoading) => {
    if (loader) loader.classList.toggle('active', isLoading);
    if (analyzeBtn instanceof HTMLButtonElement) {
      analyzeBtn.disabled = isLoading;
      analyzeBtn.style.opacity = isLoading ? '0.7' : '1';
      analyzeBtn.style.cursor = isLoading ? 'wait' : 'pointer';
    }
    const refineBtn = document.getElementById('get-refined-btn');
    if (refineBtn) {
      refineBtn.disabled = isLoading;
      refineBtn.style.opacity = isLoading ? '0.7' : '1';
      refineBtn.innerHTML = isLoading 
        ? '<i class="fa-solid fa-circle-notch fa-spin"></i> Generating...'
        : '<i class="fa-solid fa-wand-magic-sparkles"></i> Get Personalized Plan';
    }
  };

  const parseMarkdown = (markdown) => {
    const markedLib = window.marked;
    return markedLib && typeof markedLib.parse === 'function'
      ? markedLib.parse(markdown)
      : `<pre style="white-space: pre-wrap; font-family: inherit;">${escapeHtml(markdown)}</pre>`;
  };

  const apiFetch = async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });

    const data = await response.json().catch(() => {});

    if (response.status === 401 || response.status === 403) {
      throw new Error('Your session expired. Please log in again.');
    }

    if (!response.ok) {
      throw new Error(data.error || 'Request failed.');
    }

    return data;
  };

  const runAnalysis = async () => {
    try {
      const entries = collectEntries();
      currentEntries = entries;
      setLoadingState(true);
      if (resultContainer) {
        resultContainer.classList.remove('active');
        resultContainer.innerHTML = '';
      }

      const response = await apiFetch('/api/ai/mark-analysis', {
        method: 'POST',
        body: JSON.stringify({ entries })
      });

      if (!resultContainer) return;

      currentSummary = response.summary;
      currentAnalysis = response.analysis;

      const questions = extractQuestions(response.analysis);
      const followUpHtml = renderFollowUpQuestions(questions, response.analysis);

      resultContainer.innerHTML = `
        ${renderSummary(response.summary)}
        <div class="analysis-markdown">${parseMarkdown(response.analysis || 'No analysis returned.')}</div>
        ${followUpHtml}
      `;
      resultContainer.classList.add('active');
      resultContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
      showToast('Analysis ready.');

      const refineBtn = document.getElementById('get-refined-btn');
      if (refineBtn) {
        refineBtn.addEventListener('click', runRefinedAnalysis);
      }
    } catch (error) {
      if (error && error.message === 'Your session expired. Please log in again.') {
        showToast(error.message);
        window.setTimeout(() => {
          window.location.href = 'login.html';
        }, 700);
      } else {
        showToast(error.message || 'Could not analyze marks right now.');
      }
    } finally {
      setLoadingState(false);
    }
  };

  const runRefinedAnalysis = async () => {
    try {
      const answerInputs = document.querySelectorAll('.followup-answer');
      const answers = [];
      
      for (const input of answerInputs) {
        const value = input.value.trim();
        if (!value) {
          throw new Error('Please answer all follow-up questions to get your personalized plan.');
        }
        answers.push(value);
      }

      setLoadingState(true);

      const response = await apiFetch('/api/ai/mark-analysis/followup', {
        method: 'POST',
        body: JSON.stringify({
          entries: currentEntries,
          summary: currentSummary,
          answers: answers.join('\n\n'),
          previousAnalysis: currentAnalysis
        })
      });

      const refinedSection = document.getElementById('refined-result');
      if (refinedSection) {
        refinedSection.remove();
      }

      const refinedHtml = renderRefinedResult(response.refinedAnalysis);
      
      const followupSection = document.getElementById('followup-section');
      if (followupSection) {
        const refinedDiv = document.createElement('div');
        refinedDiv.id = 'refined-result';
        refinedDiv.innerHTML = refinedHtml;
        followupSection.after(refinedDiv);
        refinedDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      showToast('Your personalized plan is ready!');
    } catch (error) {
      if (error && error.message === 'Your session expired. Please log in again.') {
        showToast(error.message);
        window.setTimeout(() => {
          window.location.href = 'login.html';
        }, 700);
      } else {
        showToast(error.message || 'Could not generate personalized plan.');
      }
    } finally {
      setLoadingState(false);
    }
  };

  seedRows();
  ensureAtLeastOneRow();

  if (addSubjectBtn) {
    addSubjectBtn.addEventListener('click', () => {
      marksContainer?.appendChild(createMarkRow({ total: defaultTotal }));
    });
  }

  if (analyzeBtn) {
    analyzeBtn.addEventListener('click', runAnalysis);
  }
});