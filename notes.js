// EduPeers Notes Area Logic (Cloud Synced & Simplified)
// -----------------------------

let notesData = {
    subjects: [],
    notes: []
};

let currentSubjectId = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initial Login Check
    const user = localStorage.getItem('edupeers_username');
    if (!user) {
        console.warn('No user found in local storage. Redirecting to login.');
        window.location.href = 'login.html';
        return;
    }

    // Populate UI with user name
    const nameEl = document.getElementById('topbar-user-name');
    if (nameEl) nameEl.innerText = user;

    const avatarEl = document.getElementById('topbar-avatar');
    if (avatarEl) avatarEl.innerText = user.charAt(0).toUpperCase();

    // 2. Fetch Initial Data
    await refreshAll();
    
    // UI Events: Subjects
    document.getElementById('btn-add-subject').onclick = () => {
        openModal('modal-subject', 'Create New Subject');
        document.getElementById('subject-name-input').value = '';
        document.getElementById('edit-subject-id').value = '';
    };

    document.getElementById('btn-save-subject').onclick = saveSubject;

    // UI Events: Notes
    const addNoteBtns = [document.getElementById('btn-new-note'), document.getElementById('quick-fab')];
    addNoteBtns.forEach(btn => {
        if (btn) btn.onclick = () => {
            if (!currentSubjectId) {
                showToast('Please select a subject first!');
                return;
            }
            openModal('modal-note', 'Write New Note');
            document.getElementById('note-title-input').value = '';
            document.getElementById('note-content-input').value = '';
            document.getElementById('note-priority-input').value = '0';
            document.getElementById('edit-note-id').value = '';
        };
    });

    document.getElementById('btn-save-note').onclick = saveNote;

    // Handle Enter and ESC logic
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal('modal-subject');
            closeModal('modal-note');
        }
    });

    // Auto-refresh every 30 seconds to keep devices in sync
    setInterval(refreshAll, 60000);
});

// --- CLOUD SYNC LOGIC ---

async function apiFetch(url, options = {}) {
    try {
        const res = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });
        if (res.status === 401 || res.status === 403) {
            console.error('Session expired or unauthorized.');
            window.location.href = 'login.html'; 
            return null;
        }
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            console.error('API Error Response:', err);
            return null;
        }
        return await res.json();
    } catch (e) {
        console.error('Network Fetch Error:', e);
        return null;
    }
}

async function refreshAll() {
    const subjects = await apiFetch('/api/notes/subjects');
    if (subjects) {
        notesData.subjects = subjects;
        if (!currentSubjectId && subjects.length > 0) {
            currentSubjectId = subjects[0].id;
        }
        renderSubjects();
    } else {
        console.log('No subjects retrieved from cloud.');
    }

    if (currentSubjectId) {
        const notes = await apiFetch(`/api/notes?subjectId=${currentSubjectId}`);
        if (notes) {
            notesData.notes = notes;
            renderNotes();
        }
    }
}

// --- SUBJECTS LOGIC ---

function renderSubjects() {
    const container = document.getElementById('subjects-container');
    if (!container) return;
    container.innerHTML = '';

    notesData.subjects.forEach(subject => {
        const div = document.createElement('div');
        div.className = `subject-item ${subject.id === currentSubjectId ? 'active' : ''}`;
        div.innerHTML = `
            <div class="subject-name">
                <i class="fa-solid fa-folder"></i>
                <span title="${subject.name}">${subject.name}</span>
            </div>
            <div class="subject-controls">
                <i class="fa-solid fa-pen" onclick="event.stopPropagation(); editSubject('${subject.id}')"></i>
                <i class="fa-solid fa-trash" onclick="event.stopPropagation(); deleteSubject('${subject.id}')"></i>
            </div>
        `;
        div.onclick = () => selectSubject(subject.id);
        container.appendChild(div);
    });

    if (currentSubjectId) {
        const activeSub = notesData.subjects.find(s => s.id === currentSubjectId);
        if (activeSub) {
            updateMainHeader(activeSub.name);
        }
    } else if (notesData.subjects.length > 0) {
        selectSubject(notesData.subjects[0].id);
    }
}

async function selectSubject(id) {
    currentSubjectId = id;
    renderSubjects();
    
    const actions = document.getElementById('active-subject-actions');
    const fab = document.getElementById('quick-fab');
    if (id) {
        if (actions) actions.style.display = 'block';
        if (fab) fab.style.display = 'flex';
        const notes = await apiFetch(`/api/notes?subjectId=${currentSubjectId}`);
        if (notes) {
            notesData.notes = notes;
            renderNotes();
        }
    } else {
        if (actions) actions.style.display = 'none';
        if (fab) fab.style.display = 'none';
        notesData.notes = [];
        renderNotes();
    }
}

function updateMainHeader(name) {
    const titleEl = document.getElementById('current-subject-title');
    const descEl = document.getElementById('current-subject-desc');
    if (titleEl) titleEl.innerText = name;
    if (descEl) descEl.innerText = `Manage your library of ${name} notes below.`;
}

async function saveSubject() {
    const input = document.getElementById('subject-name-input');
    const editId = document.getElementById('edit-subject-id').value;
    const name = input.value.trim();

    if (!name) {
        showToast('Please enter a subject name!');
        return;
    }

    const res = await apiFetch('/api/notes/subjects', {
        method: 'POST',
        body: JSON.stringify({ name, id: editId || undefined })
    });

    if (res) {
        currentSubjectId = res.id;
        await refreshAll();
        closeModal('modal-subject');
        showToast(editId ? 'Subject renamed!' : 'Subject added!');
    }
}

function editSubject(id) {
    const sub = notesData.subjects.find(s => s.id === id);
    if (!sub) return;
    openModal('modal-subject', 'Rename Subject');
    document.getElementById('subject-name-input').value = sub.name;
    document.getElementById('edit-subject-id').value = id;
}

async function deleteSubject(id) {
    if (!confirm('Permanently delete this subject and all its notes?')) return;
    const res = await apiFetch(`/api/notes/subjects/${id}`, { method: 'DELETE' });
    if (res) {
        if (currentSubjectId === id) currentSubjectId = null;
        await refreshAll();
        showToast('Subject deleted.');
    }
}

// --- NOTES LOGIC ---

function renderNotes() {
    const container = document.getElementById('notes-grid');
    if (!container) return;
    container.innerHTML = '';

    if (!currentSubjectId) {
        container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: rgba(255,255,255,0.2);">
            <i class="fa-solid fa-folder-open" style="font-size: 3rem; margin-bottom: 1rem;"></i>
            <p>Pick a subject from the left panel to begin.</p>
        </div>`;
        return;
    }

    if (notesData.notes.length === 0) {
        container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: rgba(255,255,255,0.2);">
            <i class="fa-solid fa-pen-fancy" style="font-size: 3rem; margin-bottom: 1rem;"></i>
            <p>No notes here yet. Click "New Note" to start writing!</p>
        </div>`;
        return;
    }

    notesData.notes.forEach(note => {
        const priorityLabels = ['Normal', 'High', 'Urgent'];
        const priorityColors = ['transparent', 'rgba(255, 193, 7, 0.2)', 'rgba(255, 51, 102, 0.2)'];
        const pColor = priorityColors[note.priority || 0];
        
        const priorityTag = note.priority > 0 
            ? `<span style="background: ${pColor}; border: 1px solid rgba(255,255,255,0.1); padding: 2px 8px; border-radius: 4px; font-size: 0.7rem; margin-left: 10px; color: #fff;">${priorityLabels[note.priority]}</span>` 
            : '';

        const card = document.createElement('div');
        card.className = 'note-card';
        card.innerHTML = `
            <div class="note-title">
                <span>${note.title}${priorityTag}</span>
                <i class="fa-solid fa-trash" style="font-size: 0.8rem; opacity: 0.3;" onclick="event.stopPropagation(); deleteNote('${note.id}')"></i>
            </div>
            <div class="note-preview">${note.content}</div>
            <div class="note-meta">
                <span><i class="fa-solid fa-cloud"></i> Cloud</span>
                <span>${new Date(note.updated_at).toLocaleDateString()}</span>
            </div>
        `;
        card.onclick = () => openEditNote(note.id);
        container.appendChild(card);
    });
}

function openEditNote(id) {
    const note = notesData.notes.find(n => n.id === id);
    if (!note) return;
    openModal('modal-note', 'Edit Note');
    document.getElementById('note-title-input').value = note.title;
    document.getElementById('note-content-input').value = note.content;
    document.getElementById('note-priority-input').value = note.priority || '0';
    document.getElementById('edit-note-id').value = id;
}

async function saveNote() {
    const title = document.getElementById('note-title-input').value.trim();
    const content = document.getElementById('note-content-input').value.trim();
    const priority = document.getElementById('note-priority-input').value;
    const editId = document.getElementById('edit-note-id').value;

    if (!title || !content) {
        showToast('Both title and content are required!');
        return;
    }

    const res = await apiFetch('/api/notes', {
        method: 'POST',
        body: JSON.stringify({ 
            id: editId || undefined,
            subjectId: currentSubjectId,
            title, 
            content,
            priority: parseInt(priority)
        })
    });

    if (res) {
        await refreshAll();
        closeModal('modal-note');
        showToast(editId ? 'Note updated!' : 'Note saved!');
    }
}

async function deleteNote(id) {
    if (!confirm('Permanent delete this note?')) return;
    const res = await apiFetch(`/api/notes/${id}`, { method: 'DELETE' });
    if (res) {
        await refreshAll();
        showToast('Note deleted.');
    }
}

// --- UTILITIES ---

function openModal(id, title) {
    const m = document.getElementById(id);
    if (!m) return;
    m.classList.add('active');
    const titleEl = m.querySelector('.modal-title');
    if (titleEl) titleEl.innerText = title;
}

function closeModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.remove('active');
}

function showToast(msg) {
    // Attempt local toast first
    const toast = document.getElementById('ui-toast');
    if (toast) {
        toast.textContent = msg;
        toast.style.opacity = '1';
        setTimeout(() => { toast.style.opacity = '0'; }, 2000);
    } else {
        console.log('System Status:', msg);
    }
}

window['closeModal'] = closeModal;
