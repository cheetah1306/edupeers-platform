/**
 * EduPeers L&D Enterprise Single-Page Application Controller
 * Strict 3-Role Governance: Trainee, Trainer, Admin
 */

const API_BASE = '';
let currentUser = null;
let currentToken = null;
let currentRole = null;
let activeSubjects = [];
let examTimerInterval = null;
let activeExamData = null;
let currentViewingResourceId = null;
let activeDashboardChart = null;

// ==========================================================
// 1. INITIALIZATION & AUTH STATE
// ==========================================================
document.addEventListener('DOMContentLoaded', async () => {
    currentToken = localStorage.getItem('edupeers_token');
    const storedUser = localStorage.getItem('edupeers_user');

    if (!currentToken || !storedUser) {
        window.location.href = 'login.html';
        return;
    }

    try {
        currentUser = JSON.parse(storedUser);
    } catch (e) {
        window.location.href = 'login.html';
        return;
    }

    currentRole = currentUser.role;

    // Verify token with server
    try {
        const res = await apiRequest('/api/auth/me');
        if (!res.ok) {
            handleLogout();
            return;
        }
        const data = await res.json();
        currentUser = { ...currentUser, ...data.user };
        currentRole = currentUser.user_role || currentUser.role;
        currentUser.role = currentRole;
        localStorage.setItem('edupeers_user', JSON.stringify(currentUser));
        localStorage.setItem('edupeers_role', currentRole);
        localStorage.setItem('edupeers_status', currentUser.status || 'pending');
    } catch (err) {
        console.warn('Offline or local state fallback');
    }

    initHeaderUI();
    initRoleNav();
    showPendingApprovalBanner();
    loadSubjects();
    loadNotifications();
    initAppWebSocket();

    // If current trainer is pending, check status periodically every 10 seconds
    if (currentRole === 'trainer' && (currentUser.status !== 'active')) {
        setInterval(() => checkTrainerApprovalStatus(false), 10000);
    }

    // Default view
    switchNavTab('home');
});

// Helper for authenticated HTTP requests
async function apiRequest(endpoint, options = {}) {
    options.headers = options.headers || {};
    options.headers['Authorization'] = `Bearer ${currentToken}`;
    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(options.body);
    }
    return fetch(endpoint, options);
}

function handleLogout() {
    localStorage.removeItem('edupeers_token');
    localStorage.removeItem('edupeers_user');
    localStorage.removeItem('edupeers_username');
    localStorage.removeItem('edupeers_role');
    window.location.href = 'login.html';
}

// ==========================================================
// 2. HEADER & NAVIGATION SETUP
// ==========================================================
function initHeaderUI() {
    const badgeEl = document.getElementById('nav-role-badge');
    const badgeText = document.getElementById('role-badge-text');
    const topAvatar = document.getElementById('topbar-avatar');
    const topName = document.getElementById('topbar-user-name');
    const topRole = document.getElementById('topbar-user-role');
    const heroName = document.getElementById('hero-user-name');

    const name = currentUser.username || currentUser.email.split('@')[0];
    const initial = name.charAt(0).toUpperCase();

    if (topName) topName.innerText = name;
    if (topAvatar) topAvatar.innerText = initial;
    if (topRole) topRole.innerText = currentRole.toUpperCase();
    if (heroName) heroName.innerText = name;

    if (badgeEl && badgeText) {
        badgeEl.className = `role-badge role-${currentRole}`;
        let icon = 'fa-user-graduate';
        if (currentRole === 'trainer') icon = 'fa-chalkboard-user';
        if (currentRole === 'admin') icon = 'fa-user-shield';
        badgeEl.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${currentRole.toUpperCase()}</span>`;
    }
}

function initRoleNav() {
    const tabsContainer = document.getElementById('role-nav-tabs');
    const mobileBottomNav = document.getElementById('mobile-bottom-nav');

    // Show mobile logout pill on small screens only
    const logoutPill = document.getElementById('mobile-logout-pill');
    if (logoutPill) {
        logoutPill.style.display = window.innerWidth <= 768 ? 'block' : 'none';
    }

    const userStatus = currentUser.status || localStorage.getItem('edupeers_status') || 'pending';
    const isTrainerPending = currentRole === 'trainer' && userStatus !== 'active';

    let tabs = [];
    let mobileTabs = [];

    if (currentRole === 'trainee') {
        tabs = [
            { id: 'home',        icon: 'fa-house',            label: 'Home' },
            { id: 'profile',     icon: 'fa-user-graduate',    label: 'Trainee Profile' },
            { id: 'courses',     icon: 'fa-graduation-cap',   label: 'Course Catalog' },
            { id: 'resources',   icon: 'fa-folder-open',      label: 'Learning Resources' },
            { id: 'assessments', icon: 'fa-clipboard-check',  label: 'Assessments' }
        ];
        mobileTabs = [
            { id: 'home',        icon: 'fa-house',           label: 'Home',      symbol: '🏠' },
            { id: 'courses',     icon: 'fa-graduation-cap',  label: 'Courses',   symbol: '🎓' },
            { id: 'resources',   icon: 'fa-folder-open',     label: 'Resources', symbol: '📂' },
            { id: 'assessments', icon: 'fa-clipboard-check', label: 'Quizzes',   symbol: '📝' },
            { id: 'profile',     icon: 'fa-user-graduate',   label: 'Profile',   symbol: '👨‍🎓' }
        ];
    } else if (currentRole === 'trainer') {
        tabs = [
            { id: 'home',             icon: 'fa-house',            label: 'Home' },
            { id: 'trainer-builder',  icon: 'fa-pen-ruler',        label: isTrainerPending ? 'Questionnaire Studio 🔒' : 'Questionnaire Studio' },
            { id: 'trainer-trainees', icon: 'fa-chart-user',       label: isTrainerPending ? 'Trainee Performance 🔒' : 'Trainee Performance' },
            { id: 'trainer-library',  icon: 'fa-cloud-arrow-up',   label: isTrainerPending ? 'Content Library 🔒' : 'Content Library' },
            { id: 'profile',          icon: 'fa-chalkboard-user',  label: 'Trainer Profile' }
        ];
        mobileTabs = [
            { id: 'home',             icon: 'fa-house',           label: 'Home',    symbol: '🏠' },
            { id: 'trainer-builder',  icon: 'fa-pen-ruler',       label: isTrainerPending ? 'Studio'   : 'Studio',   symbol: isTrainerPending ? '🔒' : '🎨' },
            { id: 'trainer-trainees', icon: 'fa-chart-user',      label: isTrainerPending ? 'Trainees' : 'Trainees', symbol: isTrainerPending ? '🔒' : '📊' },
            { id: 'trainer-library',  icon: 'fa-cloud-arrow-up',  label: isTrainerPending ? 'Library'  : 'Library',  symbol: isTrainerPending ? '🔒' : '📁' },
            { id: 'profile',          icon: 'fa-chalkboard-user', label: 'Profile', symbol: '👨‍🏫' }
        ];
    } else if (currentRole === 'admin') {
        tabs = [
            { id: 'home',             icon: 'fa-house',            label: 'Home' },
            { id: 'admin-users',      icon: 'fa-user-shield',      label: 'User Approvals & Directory' },
            { id: 'admin-dashboards', icon: 'fa-chart-pie',        label: '5 Analytics Dashboards' },
            { id: 'admin-publisher',  icon: 'fa-bullhorn',         label: 'Homepage Publisher' },
            { id: 'admin-competency', icon: 'fa-diagram-project',  label: 'Competency Matrix' },
            { id: 'profile',          icon: 'fa-user-shield',      label: 'Admin Profile' }
        ];
        mobileTabs = [
            { id: 'home',             icon: 'fa-house',       label: 'Home',    symbol: '🏠'  },
            { id: 'admin-users',      icon: 'fa-user-shield', label: 'Users',   symbol: '🛡️' },
            { id: 'admin-dashboards', icon: 'fa-chart-pie',   label: 'Stats',   symbol: '📊'  },
            { id: 'admin-publisher',  icon: 'fa-bullhorn',    label: 'Publish', symbol: '📢'  },
            { id: 'profile',          icon: 'fa-user-shield', label: 'Admin',   symbol: '🛡️' }
        ];
    }

    if (tabsContainer) {
        tabsContainer.innerHTML = tabs.map(tab => `
            <button class="role-nav-tab ${tab.id === 'home' ? 'active' : ''}" id="navtab-${tab.id}" onclick="switchNavTab('${tab.id}')">
                <i class="fa-solid ${tab.icon}"></i> ${tab.label}
            </button>
        `).join('');
    }

    if (mobileBottomNav) {
        mobileBottomNav.innerHTML = mobileTabs.map(tab => `
            <button
                class="mobile-nav-tab ${tab.id === 'home' ? 'active' : ''}"
                id="mobile-navtab-${tab.id}"
                onclick="switchNavTab('${tab.id}')"
                aria-label="${tab.label}"
                title="${tab.label}"
            >
                <i class="fa-solid ${tab.icon}"></i>
                <span class="mobile-nav-label">${tab.symbol ? tab.symbol + '\u200a' : ''}${tab.label}</span>
            </button>
        `).join('');
    }
}


function switchNavTab(viewName) {
    // Trainer-specific tabs locked until active — only home and profile always allowed
    const trainerLockedTabs = ['trainer-builder', 'trainer-trainees', 'trainer-library'];
    const userStatus = currentUser.status || localStorage.getItem('edupeers_status') || 'pending';

    if (currentRole === 'trainer' && userStatus !== 'active' && trainerLockedTabs.includes(viewName)) {
        alert(`🔒 Specialist Feature Locked (Pending Admin Approval)\n\nYour trainer account (${currentUser.username || currentUser.email}) is currently awaiting review and approval by an Administrator.\n\nWhile pending approval, you have full access to Core Intelligence & Productivity tools:\n• ✨ AI Tutor & Knowledge Engine\n• 📝 Notes Workspace & Markdown\n• 🎮 Cognitive Brain Games\n• 👥 Peers Connect & Chat\n• 🚀 EduGroups\n• 👤 My Profile (Qualifications & Skills)\n\nOnce approved by an Admin, Questionnaire Studio, Trainee Performance, and Content Library will automatically unlock!`);
        return;
    }

    // Hide all views
    document.querySelectorAll('.app-view').forEach(view => view.classList.remove('active'));
    document.querySelectorAll('.role-nav-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.mobile-nav-tab').forEach(tab => tab.classList.remove('active'));

    const targetView = document.getElementById(`view-${viewName}`);
    const targetTab = document.getElementById(`navtab-${viewName}`);
    const targetMobileTab = document.getElementById(`mobile-navtab-${viewName}`);

    if (targetView) targetView.classList.add('active');
    if (targetTab) {
        targetTab.classList.add('active');
        targetTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
    if (targetMobileTab) targetMobileTab.classList.add('active');

    // Tactile haptic feedback on mobile if supported
    if (navigator.vibrate) {
        try { navigator.vibrate(10); } catch(e) {}
    }

    // Scroll to top of content smoothly
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Trigger data loader for view
    switch (viewName) {
        case 'home':
            loadHomeFeed();
            loadHomeStats();
            loadHomeRoleActionHub();
            break;
        case 'profile':
            loadProfileData();
            break;
        case 'courses':
            loadCourseCatalog();
            loadMyCourses();
            break;
        case 'resources':
            loadLearningResources();
            break;
        case 'assessments':
            loadTraineeAssessments();
            break;
        case 'trainer-builder':
            loadTrainerQuestionnaires();
            break;
        case 'trainer-trainees':
            loadTrainerOverview();
            break;
        case 'trainer-library':
            loadTrainerResources();
            break;
        case 'admin-users':
            loadAdminUsers('pending');
            break;
        case 'admin-dashboards':
            switchAdminDashboard('courses');
            break;
        case 'admin-publisher':
            loadAdminPosts();
            break;
        case 'admin-competency':
            loadCompetencyMatrix();
            break;
    }
}

// Mobile Bottom Sheet & Search Modal Controllers
function toggleMobileToolsSheet() {
    const sheet = document.getElementById('mobile-tools-sheet');
    if (sheet) {
        sheet.classList.toggle('active');
    }
}

function closeMobileToolsSheet() {
    const sheet = document.getElementById('mobile-tools-sheet');
    if (sheet) {
        sheet.classList.remove('active');
    }
}

function openMobileSearch() {
    const modal = document.getElementById('mobile-search-modal');
    const input = document.getElementById('mobile-search-input');
    if (modal) {
        modal.classList.add('active');
        if (input) {
            setTimeout(() => input.focus(), 150);
        }
    }
}

function closeMobileSearch() {
    const modal = document.getElementById('mobile-search-modal');
    if (modal) {
        modal.classList.remove('active');
    }
}

let searchDebounceTimeout = null;
async function handleGlobalSearch(query) {
    const dropdown = document.getElementById('search-results-dropdown');
    if (!dropdown) return;

    if (!query || query.trim().length < 2) {
        dropdown.style.display = 'none';
        dropdown.innerHTML = '';
        return;
    }

    clearTimeout(searchDebounceTimeout);
    searchDebounceTimeout = setTimeout(async () => {
        try {
            dropdown.style.display = 'block';
            dropdown.innerHTML = '<div style="padding:12px; color:rgba(255,255,255,0.5); text-align:center;"><i class="fa-solid fa-spinner fa-spin"></i> Searching...</div>';

            const res = await apiRequest(`/api/search?q=${encodeURIComponent(query.trim())}`);
            if (res.ok) {
                const data = await res.json();
                renderSearchResults(data, dropdown, false);
            }
        } catch (e) {
            console.error('Search error:', e);
        }
    }, 250);
}

async function handleMobileSearch(query) {
    const resultsContainer = document.getElementById('mobile-search-results');
    if (!resultsContainer) return;

    if (!query || query.trim().length < 2) {
        resultsContainer.innerHTML = '<div style="text-align:center; padding:2rem; color:rgba(255,255,255,0.4); font-size:0.85rem;">Type to search courses, modules, resources and more...</div>';
        return;
    }

    clearTimeout(searchDebounceTimeout);
    searchDebounceTimeout = setTimeout(async () => {
        try {
            resultsContainer.innerHTML = '<div style="padding:2rem; color:var(--hud-cyan); text-align:center;"><i class="fa-solid fa-spinner fa-spin"></i> Searching platform...</div>';

            const res = await apiRequest(`/api/search?q=${encodeURIComponent(query.trim())}`);
            if (res.ok) {
                const data = await res.json();
                renderSearchResults(data, resultsContainer, true);
            }
        } catch (e) {
            console.error('Mobile search error:', e);
        }
    }, 250);
}

function renderSearchResults(data, container, isMobile = false) {
    const results = data.results || [];
    if (!results.length) {
        container.innerHTML = '<div style="padding:16px; color:rgba(255,255,255,0.5); text-align:center;">No matching results found</div>';
        return;
    }

    container.innerHTML = results.map(item => {
        let icon = 'fa-book';
        let badgeColor = 'var(--hud-cyan)';
        let targetAction = `switchNavTab('courses');`;

        if (item.type === 'resource') {
            icon = 'fa-folder-open';
            badgeColor = '#7cf29a';
            targetAction = `switchNavTab('resources');`;
        } else if (item.type === 'assessment' || item.type === 'questionnaire') {
            icon = 'fa-file-signature';
            badgeColor = 'var(--hud-purple)';
            targetAction = `switchNavTab('assessments');`;
        } else if (item.type === 'trainer' || item.type === 'user') {
            icon = 'fa-user';
            badgeColor = '#ffd166';
            targetAction = `switchNavTab('home');`;
        }

        const clickHandler = isMobile ? `closeMobileSearch(); ${targetAction}` : `document.getElementById('search-results-dropdown').style.display='none'; ${targetAction}`;

        return `
            <div class="search-result-item" onclick="${clickHandler}" style="padding:10px 12px; border-radius:10px; background:rgba(255,255,255,0.03); margin-bottom:6px; cursor:pointer; display:flex; align-items:center; gap:12px;">
                <div style="width:36px; height:36px; border-radius:10px; background:rgba(255,255,255,0.06); display:flex; align-items:center; justify-content:center; color:${badgeColor}; flex-shrink:0;">
                    <i class="fa-solid ${icon}"></i>
                </div>
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:600; color:#fff; font-size:0.9rem; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${item.title || item.name || 'Result'}</div>
                    <div style="font-size:0.75rem; color:rgba(255,255,255,0.5);">${item.subject || item.subtitle || item.type}</div>
                </div>
                <span class="badge" style="font-size:0.65rem; background:rgba(255,255,255,0.08); text-transform:uppercase;">${item.type}</span>
            </div>
        `;
    }).join('');
}

// Dropdowns
function toggleToolsMenu() {
    const menu = document.getElementById('tools-dropdown');
    menu.classList.toggle('show');
    document.getElementById('user-dropdown').classList.remove('show');
    document.getElementById('notifications-drawer').style.display = 'none';
}

function toggleUserDropdown() {
    const menu = document.getElementById('user-dropdown');
    menu.classList.toggle('show');
    document.getElementById('tools-dropdown').classList.remove('show');
    document.getElementById('notifications-drawer').style.display = 'none';
}

function toggleNotificationsDrawer() {
    const drawer = document.getElementById('notifications-drawer');
    drawer.style.display = drawer.style.display === 'none' ? 'block' : 'none';
    document.getElementById('tools-dropdown').classList.remove('show');
    document.getElementById('user-dropdown').classList.remove('show');
}

// Close menus on outside click
window.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown')) {
        document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('show'));
    }
    if (!e.target.closest('#btn-notifications') && !e.target.closest('#notifications-drawer')) {
        const d = document.getElementById('notifications-drawer');
        if (d) d.style.display = 'none';
    }
    if (!e.target.closest('.global-search-container')) {
        const dropdown = document.getElementById('search-results-dropdown');
        if (dropdown) dropdown.style.display = 'none';
    }
});

// ==========================================================
// 3. GLOBAL SUBJECT TAXONOMY & SEARCH
// ==========================================================
async function loadSubjects() {
    try {
        const res = await apiRequest('/api/subjects');
        if (res.ok) {
            const data = await res.json();
            activeSubjects = data.subjects || [];

            // Populate subject dropdowns
            const questSub = document.getElementById('quest-subject');
            const resSub = document.getElementById('res-subject');

            const options = activeSubjects.map(s => `<option value="${s.name}">${s.name}</option>`).join('');
            if (questSub) questSub.innerHTML = options;
            if (resSub) resSub.innerHTML = options;

            // Populate course filter pills
            const filterPills = document.getElementById('course-filter-pills');
            if (filterPills) {
                filterPills.innerHTML = `
                    <button class="filter-pill active" onclick="filterCoursesBySubject('all', this)">All Subjects</button>
                    ${activeSubjects.map(s => `
                        <button class="filter-pill" onclick="filterCoursesBySubject('${s.name}', this)">${s.name}</button>
                    `).join('')}
                `;
            }
        }
    } catch (e) {
        console.error('Error loading subjects:', e);
    }
}

async function handleGlobalSearch(query) {
    const dropdown = document.getElementById('search-results-dropdown');
    if (!query || query.trim().length < 2) {
        dropdown.style.display = 'none';
        return;
    }

    try {
        const res = await apiRequest(`/api/search?q=${encodeURIComponent(query.trim())}`);
        if (res.ok) {
            const data = await res.json();
            const total = (data.courses?.length || 0) + (data.resources?.length || 0) + (data.trainers?.length || 0);

            if (total === 0) {
                dropdown.innerHTML = '<div class="empty-state-sm">No matching items found</div>';
            } else {
                let html = '';
                if (data.courses?.length) {
                    html += '<div style="font-size:0.75rem; color:var(--hud-cyan); font-weight:700; padding:4px 8px; text-transform:uppercase;">Courses</div>';
                    html += data.courses.slice(0, 3).map(c => `
                        <div class="search-result-item" onclick="openCourseDetails('${c.id}')">
                            <i class="fa-solid fa-book" style="color:var(--hud-cyan);"></i>
                            <div>
                                <div><strong>${c.title}</strong></div>
                                <div style="font-size:0.75rem; color:rgba(255,255,255,0.6);">${c.subject} • ${c.level}</div>
                            </div>
                        </div>
                    `).join('');
                }
                if (data.resources?.length) {
                    html += '<div style="font-size:0.75rem; color:var(--hud-purple); font-weight:700; padding:4px 8px; text-transform:uppercase;">Resources</div>';
                    html += data.resources.slice(0, 3).map(r => `
                        <div class="search-result-item" onclick="openResourceViewer('${r.id}')">
                            <i class="fa-solid fa-file" style="color:var(--hud-purple);"></i>
                            <div>
                                <div><strong>${r.title}</strong></div>
                                <div style="font-size:0.75rem; color:rgba(255,255,255,0.6);">${r.type.toUpperCase()} • ${r.subject}</div>
                            </div>
                        </div>
                    `).join('');
                }
                dropdown.innerHTML = html;
            }
            dropdown.style.display = 'block';
        }
    } catch (e) {
        console.error(e);
    }
}

// ==========================================================
// 4. NOTIFICATIONS
// ==========================================================
async function loadNotifications() {
    try {
        const res = await apiRequest('/api/notifications');
        if (res.ok) {
            const data = await res.json();
            const list = document.getElementById('notifications-list');
            const badge = document.getElementById('notification-badge');
            const notifs = data.notifications || [];

            if (notifs.length > 0) {
                if (badge) {
                    badge.innerText = notifs.length;
                    badge.style.display = 'inline-block';
                }
                if (list) {
                    list.innerHTML = notifs.map(n => {
                        const dateObj = new Date(n.created_at);
                        const timeStr = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' · ' + dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        let icon = 'fa-bell';
                        let iconColor = 'var(--hud-cyan)';
                        if (n.type === 'announcement') { icon = 'fa-bullhorn'; iconColor = '#ffd166'; }
                        else if (n.type === 'course') { icon = 'fa-graduation-cap'; iconColor = 'var(--hud-purple)'; }
                        else if (n.type === 'assessment') { icon = 'fa-list-check'; iconColor = '#ff758f'; }
                        else if (n.type === 'success') { icon = 'fa-circle-check'; iconColor = '#7cf29a'; }

                        const targetTab = n.link ? n.link.replace('#', '') : '';
                        const clickAttr = targetTab ? `onclick="handleNotificationClick('${targetTab}', '${n.id}')" style="cursor:pointer;"` : '';

                        return `
                            <div class="notification-card" ${clickAttr}>
                                <div style="display:flex; align-items:flex-start; gap:8px;">
                                    <i class="fa-solid ${icon}" style="color:${iconColor}; margin-top:3px; font-size:0.9rem;"></i>
                                    <div style="flex:1; min-width:0;">
                                        <div style="font-weight:600; color:#fff; display:flex; justify-content:space-between; gap:6px;">
                                            <span>${n.title}</span>
                                            <span style="font-size:0.68rem; color:rgba(255,255,255,0.45); white-space:nowrap;">${timeStr}</span>
                                        </div>
                                        <div style="color:rgba(255,255,255,0.78); font-size:0.84rem; margin-top:3px; line-height:1.4;">${n.message}</div>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('');
                }
            } else {
                if (badge) badge.style.display = 'none';
                if (list) list.innerHTML = '<div class="empty-state-sm">No new notifications</div>';
            }
        }
    } catch (e) {
        console.error('Error loading notifications:', e);
    }
}

async function handleNotificationClick(targetTab, notifId) {
    if (notifId) {
        try {
            await apiRequest(`/api/notifications/${notifId}/read`, { method: 'POST' });
        } catch (e) {}
    }
    const drawer = document.getElementById('notifications-drawer');
    if (drawer) drawer.style.display = 'none';
    loadNotifications(); // refresh badge after dismissal
    if (targetTab) {
        switchNavTab(targetTab);
    }
}

async function markAllNotificationsRead() {
    // Optimistic UI — clear instantly
    const list = document.getElementById('notifications-list');
    const badge = document.getElementById('notification-badge');
    if (list) list.innerHTML = '<div class="empty-state-sm">No new notifications</div>';
    if (badge) { badge.style.display = 'none'; badge.innerText = '0'; }
    try {
        await apiRequest('/api/notifications/read-all', { method: 'POST' });
        loadNotifications();
    } catch (e) {
        console.error(e);
        loadNotifications(); // reload even on error to sync state
    }
}

// ==========================================================
// 5. HOMEPAGE FEED & STATS
// ==========================================================
async function loadHomeFeed() {
    const container = document.getElementById('homepage-feed-container');
    if (!container) return;

    try {
        const res = await apiRequest('/api/homepage/feed');
        if (res.ok) {
            const data = await res.json();
            const posts = data.posts || [];

            // Update last-updated timestamp
            const tsEl = document.getElementById('announcements-last-updated');
            if (tsEl) tsEl.textContent = 'Updated ' + new Date().toLocaleTimeString();

            const homePublishBtn = document.getElementById('btn-home-publish-announcement');
            if (homePublishBtn) {
                homePublishBtn.style.display = currentRole === 'admin' ? 'inline-flex' : 'none';
            }

            if (posts.length === 0) {
                container.innerHTML = `
                    <div class="glass-card" style="padding:2.5rem; text-align:center; grid-column:1/-1;">
                        <i class="fa-solid fa-bullhorn" style="font-size:2.8rem; color:rgba(255,255,255,0.2); display:block; margin-bottom:14px;"></i>
                        <div style="color:rgba(255,255,255,0.85); font-size:1.05rem; font-weight:600;">No announcements yet</div>
                        <div style="color:rgba(255,255,255,0.45); font-size:0.85rem; margin-top:4px; margin-bottom:1.2rem;">Admin broadcasts and organization updates will appear here in real time.</div>
                        ${currentRole === 'admin' ? `
                            <button class="btn-primary" onclick="openCreatePostModal()" style="margin:0 auto; padding:8px 18px; font-size:0.88rem;">
                                <i class="fa-solid fa-plus"></i> Post First Announcement
                            </button>
                        ` : ''}
                    </div>`;
                return;
            }

            container.innerHTML = posts.map(post => {
                const isHigh = post.priority === 'high';
                const audienceLabel = post.target_role
                    ? `<span style="font-size:0.72rem; padding:2px 8px; border-radius:20px; background:rgba(0,242,255,0.15); color:#00f2ff; margin-left:6px;"><i class="fa-solid fa-users" style="margin-right:3px;"></i>${post.target_role}</span>`
                    : '';
                const typeColors = { announcement: '#ffd166', achievement: '#7cf29a', featured_content: '#9d4edd', notification: '#00f2ff' };
                const typeColor = typeColors[post.type] || '#fff';
                return `
                    <div class="glass-card feed-card" style="${isHigh ? 'border:1px solid rgba(255,82,82,0.5); box-shadow:0 0 18px rgba(255,82,82,0.12);' : ''} position:relative; overflow:hidden;">
                        ${isHigh ? '<div style="position:absolute; top:0; left:0; right:0; height:3px; background:linear-gradient(90deg,#ff5252,#ffa000);"></div>' : ''}
                        <div style="padding-top:${isHigh ? '6px' : '0'};">
                            <div class="feed-header" style="margin-bottom:10px;">
                                <span style="font-size:0.75rem; font-weight:700; padding:3px 10px; border-radius:20px; background:rgba(255,255,255,0.08); color:${typeColor};">
                                    ${isHigh ? '📌 ' : ''}${(post.type || 'announcement').replace('_', ' ').toUpperCase()}
                                </span>
                                ${audienceLabel}
                                <span style="margin-left:auto; font-size:0.72rem; color:rgba(255,255,255,0.4);">
                                    ${new Date(post.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}
                                </span>
                            </div>
                            <h3 style="margin:0 0 8px; font-size:1.05rem; color:#fff; line-height:1.4;">${post.title}</h3>
                            <p style="font-size:0.88rem; color:rgba(255,255,255,0.78); line-height:1.6; margin:0; white-space:pre-wrap;">${post.content}</p>
                        </div>
                        <div style="font-size:0.72rem; color:rgba(255,255,255,0.35); margin-top:14px; padding-top:10px; border-top:1px solid rgba(255,255,255,0.06);">
                            <i class="fa-solid fa-user-shield" style="margin-right:4px;"></i> Posted by ${post.author_name || 'L&D Leadership'}
                        </div>
                    </div>`;
            }).join('');
        }
    } catch (e) {
        container.innerHTML = '<div class="empty-state">Unable to load announcements.</div>';
    }
}

let appWs = null;
let appWsReconnectTimeout = null;

function initAppWebSocket() {
    if (appWs && (appWs.readyState === WebSocket.OPEN || appWs.readyState === WebSocket.CONNECTING)) {
        return;
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    try {
        appWs = new WebSocket(wsUrl);
        appWs.onopen = () => {
            if (currentUser && currentUser.id) {
                appWs.send(JSON.stringify({
                    type: 'identify',
                    userId: currentUser.id,
                    email: currentUser.email,
                    username: currentUser.username,
                    role: currentRole,
                    status: currentUser.status
                }));
            }
        };

        appWs.onmessage = (event) => {
            let data;
            try { data = JSON.parse(event.data); } catch { return; }

            if (data.type === 'admin_approval_request') {
                if (currentRole === 'admin') {
                    loadNotifications();
                    const activeView = document.querySelector('.app-view.active');
                    if (activeView && activeView.id === 'view-admin-users') {
                        loadAdminUsers('pending');
                    }
                    if (activeView && activeView.id === 'view-home') {
                        loadHomeRoleActionHub();
                    }
                }
            } else if (data.type === 'account_approved') {
                if (data.userId === currentUser.id) {
                    currentUser.status = 'active';
                    localStorage.setItem('edupeers_status', 'active');
                    showPendingApprovalBanner();
                    initRoleNav();
                    loadHomeRoleActionHub();
                    alert('🎉 Congratulations! Your Trainer Account has been approved by the Administrator. All features (Questionnaire Studio, Trainee Performance, Content Library) are now fully unlocked!');
                }
            } else if (data.type === 'user_approved_broadcast') {
                if (currentRole === 'admin') {
                    const activeView = document.querySelector('.app-view.active');
                    if (activeView && activeView.id === 'view-admin-users') {
                        loadAdminUsers('pending');
                    }
                }
            }
        };

        appWs.onclose = () => {
            clearTimeout(appWsReconnectTimeout);
            appWsReconnectTimeout = setTimeout(initAppWebSocket, 5000);
        };
        appWs.onerror = () => {
            appWs.close();
        };
    } catch (e) {
        console.warn('Live event nexus connection error:', e);
    }
}

async function checkTrainerApprovalStatus(isManual = false) {
    try {
        const res = await apiRequest('/api/auth/me');
        if (res.ok) {
            const data = await res.json();
            if (data.user) {
                const prevStatus = currentUser.status;
                currentUser = { ...currentUser, ...data.user };
                localStorage.setItem('edupeers_user', JSON.stringify(currentUser));
                localStorage.setItem('edupeers_status', data.user.status);

                if (data.user.status === 'active' && prevStatus !== 'active') {
                    showPendingApprovalBanner();
                    initRoleNav();
                    loadHomeRoleActionHub();
                    alert('🎉 Congratulations! Your Trainer Account has been approved by the Administrator. All features are now unlocked.');
                } else if (isManual) {
                    if (data.user.status === 'active') {
                        showPendingApprovalBanner();
                        initRoleNav();
                        loadHomeRoleActionHub();
                        alert('✅ Your account is active and approved! All features are unlocked.');
                    } else {
                        alert(`⏳ Status: Pending Approval\n\nYour trainer account (${currentUser.username || currentUser.email}) is currently awaiting review by an Administrator. All Core Intelligence and Productivity tools (AI Tutor, Notes, Brain Games, Peers Connect, EduGroups, Profile) are active.`);
                    }
                }
            }
        }
    } catch (e) {
        if (isManual) alert('Unable to check approval status. Please check your connection.');
    }
}

// Show pending approval banner for trainee and trainer users
function showPendingApprovalBanner() {
    const userStatus = currentUser.status || localStorage.getItem('edupeers_status') || 'pending';
    let banner = document.getElementById('pending-approval-banner');

    if ((currentRole === 'trainee' || currentRole === 'trainer') && userStatus !== 'active') {
        const mainContent = document.getElementById('app-main-content');
        if (!banner && mainContent) {
            banner = document.createElement('div');
            banner.id = 'pending-approval-banner';
            banner.style.cssText = `
                margin-bottom: 1.2rem;
                background: linear-gradient(135deg, rgba(255,170,0,0.18), rgba(255,100,0,0.12));
                border: 1px solid rgba(255,170,0,0.4);
                color: #ffd166; padding: 12px 18px;
                display: flex; align-items: center; justify-content: space-between; gap: 12px;
                font-size: 0.88rem; font-weight: 500;
                border-radius: 14px;
                box-shadow: 0 4px 20px rgba(255,170,0,0.15);
                backdrop-filter: blur(12px);
                position: relative;
            `;
            mainContent.insertBefore(banner, mainContent.firstChild);
        }
        const roleMsg = currentRole === 'trainer'
            ? '⏳ Your <strong>Trainer</strong> account is awaiting Administrator approval. Core Intelligence & Productivity tools are accessible. Specialist features remain locked until approved.'
            : '⏳ Your <strong>Trainee</strong> account is awaiting Admin approval. An administrator will review and activate your account shortly.';
        if (banner) {
            banner.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px;">
                    <i class="fa-solid fa-triangle-exclamation" style="font-size: 1.1rem; color: #ffa200;"></i>
                    <span>${roleMsg}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 10px; flex-shrink: 0;">
                    <span style="font-size:0.75rem; opacity:0.85;">Logged in as: <strong>${currentUser.username || currentUser.email}</strong></span>
                    <button onclick="checkAccountApproval(true)" class="btn-text-sm" style="padding: 4px 10px; background: rgba(255,255,255,0.08); border-radius: 8px; border: 1px solid rgba(255,255,255,0.15); color: #fff; cursor: pointer;">Refresh Status</button>
                </div>
            `;
        }
    } else {
        if (banner) {
            banner.remove();
        }
        document.body.style.paddingTop = '0px';
    }
}

async function loadHomeRoleActionHub() {
    const hub = document.getElementById('home-role-action-hub');
    if (!hub) return;

    const userStatus = currentUser.status || localStorage.getItem('edupeers_status') || 'pending';

    if (currentRole === 'trainee') {
        if (userStatus !== 'active') {
            hub.innerHTML = `
                <div class="panel-section">
                    <div class="section-title"><i class="fa-solid fa-circle-info" style="color:#ffd166;"></i> Account Status</div>
                    <div class="glass-card" style="padding:1.5rem; text-align:center; border-color:rgba(255,170,0,0.3);">
                        <div style="font-size:2.5rem; margin-bottom:0.5rem;">⏳</div>
                        <h3 style="color:#ffd166; margin:0 0 0.5rem;">Pending Admin Approval</h3>
                        <p style="color:rgba(255,255,255,0.75); font-size:0.9rem;">Your registration has been submitted. An Administrator will review and activate your account. You'll receive a notification once approved.</p>
                        <p style="color:rgba(255,255,255,0.5); font-size:0.8rem; margin-top:0.5rem;">Meanwhile, enjoy all the common learning tools above!</p>
                    </div>
                </div>
            `;
        } else {
            try {
                const res = await apiRequest('/api/trainee/my-courses');
                const data = await res.json();
                const enrollments = data.enrollments || [];
                const active = enrollments.filter(e => e.progress_pct < 100);
                hub.innerHTML = `
                    <div class="panel-section">
                        <div class="section-title"><i class="fa-solid fa-book-open-reader" style="color:var(--hud-cyan);"></i> Continue Learning</div>
                        ${active.length > 0 ? `
                            <div class="tools-bento-grid">
                                ${active.slice(0, 3).map(e => `
                                    <div class="glass-card tool-bento-card" onclick="openCourseDetails('${e.course_id}')" style="cursor:pointer;">
                                        <div class="tool-bento-icon" style="background:rgba(0,242,255,0.12); color:var(--hud-cyan);">
                                            <i class="fa-solid fa-book"></i>
                                        </div>
                                        <div class="tool-bento-info">
                                            <h4>${e.title}</h4>
                                            <p>${e.progress_pct}% complete · ${e.trainer_name || 'EduPeers Faculty'}</p>
                                            <div class="progress-bar-bg" style="margin-top:6px;"><div class="progress-bar-fill" style="width:${e.progress_pct}%;"></div></div>
                                        </div>
                                        <span class="tool-bento-arrow"><i class="fa-solid fa-arrow-right"></i></span>
                                    </div>
                                `).join('')}
                            </div>
                        ` : '<div class="glass-card" style="padding:1.5rem; text-align:center;"><i class="fa-solid fa-graduation-cap" style="font-size:2rem; color:var(--hud-cyan); margin-bottom:0.5rem;"></i><p style="color:rgba(255,255,255,0.75);">No active courses yet. Browse the <a href="javascript:void(0)" onclick="switchNavTab(\'courses\')" style="color:var(--hud-cyan);">Course Catalog</a> to enroll!</p></div>'}
                    </div>
                `;
            } catch (e) { hub.innerHTML = ''; }
        }
    } else if (currentRole === 'trainer') {
        if (userStatus !== 'active') {
            hub.innerHTML = `
                <div class="panel-section">
                    <div class="section-title"><i class="fa-solid fa-circle-info" style="color:#ffd166;"></i> Trainer Activation Status</div>
                    <div class="glass-card" style="padding:1.8rem; border-color:rgba(255,170,0,0.4); background:rgba(25, 20, 10, 0.45);">
                        <div style="display:flex; align-items:flex-start; gap:1.2rem; margin-bottom:1.5rem;">
                            <div style="font-size:2.8rem; line-height:1;">🔐</div>
                            <div style="flex:1;">
                                <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
                                    <h3 style="color:#ffd166; margin:0; font-size:1.25rem;">Specialist Trainer Features Locked</h3>
                                    <span class="badge" style="background:rgba(255,170,0,0.2); color:#ffd166; border:1px solid rgba(255,170,0,0.5); padding:4px 10px; font-size:0.78rem;">
                                        <i class="fa-solid fa-clock"></i> PENDING ADMIN APPROVAL
                                    </span>
                                </div>
                                <p style="color:rgba(255,255,255,0.8); font-size:0.92rem; line-height:1.6; margin-top:8px;">
                                    Your profile as <strong>${currentUser.username || currentUser.email}</strong> is under review by an Administrator. Until approved, you have full access to Core Intelligence & Productivity tools while specialist trainer features remain safely locked.
                                </p>
                            </div>
                        </div>

                        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:16px; margin-bottom:1.5rem;">
                            <!-- Active Core Tools -->
                            <div style="background:rgba(0, 242, 255, 0.05); border:1px solid rgba(0, 242, 255, 0.2); border-radius:10px; padding:1.2rem;">
                                <h4 style="color:var(--hud-cyan); margin:0 0 10px; font-size:0.95rem; display:flex; align-items:center; gap:8px;">
                                    <i class="fa-solid fa-circle-check" style="color:#7cf29a;"></i> Core Intelligence Tools (Active)
                                </h4>
                                <ul style="color:rgba(255,255,255,0.75); font-size:0.85rem; margin:0; padding-left:1.2rem; line-height:1.9;">
                                    <li><strong>AI Tutor</strong> & Knowledge Engine</li>
                                    <li><strong>Notes Workspace</strong> & Markdown Editor</li>
                                    <li><strong>Cognitive Brain Games</strong></li>
                                    <li><strong>Peers Connect</strong> & Direct Messaging</li>
                                    <li><strong>EduGroups</strong> & Collaboration</li>
                                    <li><strong>My Profile</strong> (Qualifications & Skills)</li>
                                </ul>
                            </div>

                            <!-- Locked Specialist Tools -->
                            <div style="background:rgba(255, 100, 100, 0.05); border:1px solid rgba(255, 100, 100, 0.2); border-radius:10px; padding:1.2rem;">
                                <h4 style="color:#ff758f; margin:0 0 10px; font-size:0.95rem; display:flex; align-items:center; gap:8px;">
                                    <i class="fa-solid fa-lock" style="color:#ff758f;"></i> Specialist Tools (Locked)
                                </h4>
                                <ul style="color:rgba(255,255,255,0.65); font-size:0.85rem; margin:0; padding-left:1.2rem; line-height:1.9;">
                                    <li><strong>Questionnaire Studio</strong> (MCQs & Assessments)</li>
                                    <li><strong>Trainee Performance</strong> (Analytics & Test Marks)</li>
                                    <li><strong>Content Library</strong> (Resource Uploads)</li>
                                    <li><strong>Course Publishing</strong> & Delivery</li>
                                </ul>
                            </div>
                        </div>

                        <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:center;">
                            <button class="btn-primary" onclick="checkTrainerApprovalStatus(true)">
                                <i class="fa-solid fa-rotate"></i> Check Approval Status
                            </button>
                            <button class="btn-outline-sm" onclick="switchNavTab('profile')">
                                <i class="fa-solid fa-user-pen"></i> Complete My Profile
                            </button>
                        </div>
                    </div>
                </div>
            `;
        } else {
            try {
                const res = await apiRequest('/api/trainer/overview');
                const data = await res.json();
                const metrics = data.metrics || {};
                hub.innerHTML = `
                    <div class="panel-section">
                        <div class="section-title"><i class="fa-solid fa-chart-user" style="color:var(--hud-purple);"></i> Your Trainer Dashboard Snapshot</div>
                        <div class="dashboard-stats-grid">
                            <div class="glass-card stat-metric-card">
                                <div class="stat-chip-num" style="color:var(--hud-cyan);">${metrics.totalCourses || 0}</div>
                                <div class="stat-chip-lbl">Courses Authored</div>
                            </div>
                            <div class="glass-card stat-metric-card">
                                <div class="stat-chip-num" style="color:var(--hud-purple);">${metrics.totalEnrollments || 0}</div>
                                <div class="stat-chip-lbl">Enrolled Trainees</div>
                            </div>
                            <div class="glass-card stat-metric-card">
                                <div class="stat-chip-num" style="color:#7cf29a;">${metrics.passRate || 0}%</div>
                                <div class="stat-chip-lbl">Pass Rate</div>
                            </div>
                            <div class="glass-card stat-metric-card">
                                <div class="stat-chip-num" style="color:#ffd166;">${metrics.avgRating || '5.0'}</div>
                                <div class="stat-chip-lbl">Avg Rating</div>
                            </div>
                        </div>
                        <div style="margin-top:1rem; display:flex; gap:12px; flex-wrap:wrap;">
                            <button class="btn-primary" onclick="switchNavTab('trainer-builder')">
                                <i class="fa-solid fa-plus"></i> Create Assessment
                            </button>
                            <button class="btn-outline-sm" onclick="switchNavTab('trainer-library')">
                                <i class="fa-solid fa-upload"></i> Upload Resource
                            </button>
                        </div>
                    </div>
                `;
            } catch (e) { hub.innerHTML = ''; }
        }
    } else if (currentRole === 'admin') {
        try {
            const res = await apiRequest('/api/admin/users?status=pending');
            const data = await res.json();
            const pendingUsers = data.users || [];
            hub.innerHTML = `
                <div class="panel-section">
                    <div class="section-title"><i class="fa-solid fa-user-shield" style="color:#ffd166;"></i> Admin Action Center</div>
                    ${pendingUsers.length > 0 ? `
                        <div class="glass-card" style="padding:1.5rem; border-color:rgba(255,170,0,0.35); margin-bottom:1rem;">
                            <h4 style="color:#ffd166; margin:0 0 0.5rem;"><i class="fa-solid fa-bell"></i> ${pendingUsers.length} Pending Approval${pendingUsers.length !== 1 ? 's' : ''}</h4>
                            <p style="color:rgba(255,255,255,0.75); font-size:0.88rem; margin:0 0 1rem;">New user registrations await your review:</p>
                            <div style="display:flex; flex-direction:column; gap:8px;">
                                ${pendingUsers.slice(0, 3).map(u => `
                                    <div style="display:flex; align-items:center; justify-content:space-between; background:rgba(255,255,255,0.05); padding:10px 14px; border-radius:10px;">
                                        <div>
                                            <strong>${u.username}</strong> 
                                            <span class="badge badge-purple" style="font-size:0.72rem;">${(u.user_role || 'trainee').toUpperCase()}</span>
                                            <br>
                                            <span style="font-size:0.75rem; color:rgba(255,255,255,0.5);">${u.email} · ${u.institution || u.department || 'General'}</span>
                                        </div>
                                        <div style="display:flex; gap:6px;">
                                            <button class="btn-success" style="padding:5px 12px; font-size:0.78rem;" onclick="approveUser('${u.id}').then(() => loadHomeRoleActionHub())">
                                                <i class="fa-solid fa-check"></i> Approve
                                            </button>
                                            <button class="btn-outline-sm text-danger" style="padding:5px 8px; font-size:0.78rem;" onclick="rejectUser('${u.id}').then(() => loadHomeRoleActionHub())">
                                                <i class="fa-solid fa-xmark"></i>
                                            </button>
                                        </div>
                                    </div>
                                `).join('')}
                                ${pendingUsers.length > 3 ? `<button class="btn-outline-sm" onclick="switchNavTab('admin-users')" style="margin-top:4px;">View all ${pendingUsers.length} pending →</button>` : ''}
                            </div>
                        </div>
                    ` : `
                        <div class="glass-card" style="padding:1.5rem; text-align:center; border-color:rgba(0,242,255,0.2);">
                            <i class="fa-solid fa-circle-check" style="font-size:2rem; color:#7cf29a; margin-bottom:0.5rem;"></i>
                            <p style="color:rgba(255,255,255,0.75);">No pending approvals! All users are verified.</p>
                        </div>
                    `}
                    <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:0.5rem;">
                        <button class="btn-outline-sm" onclick="switchNavTab('admin-dashboards')"><i class="fa-solid fa-chart-pie"></i> View Analytics</button>
                        <button class="btn-outline-sm" onclick="switchNavTab('admin-publisher')"><i class="fa-solid fa-bullhorn"></i> Publish Announcement</button>
                        <button class="btn-outline-sm" onclick="switchNavTab('admin-competency')"><i class="fa-solid fa-diagram-project"></i> Competency Matrix</button>
                    </div>
                </div>
            `;
        } catch (e) { hub.innerHTML = ''; }
    }
}

async function loadHomeStats() {
    const statsContainer = document.getElementById('hero-quick-stats');
    if (!statsContainer) return;

    try {
        if (currentRole === 'trainee') {
            const res = await apiRequest('/api/trainee/my-courses');
            const data = await res.json();
            const enrolled = data.enrollments?.length || 0;
            const completed = data.enrollments?.filter(e => e.progress_pct === 100).length || 0;

            statsContainer.innerHTML = `
                <div class="stat-chip">
                    <div class="stat-chip-num">${enrolled}</div>
                    <div class="stat-chip-lbl">Enrolled</div>
                </div>
                <div class="stat-chip">
                    <div class="stat-chip-num">${completed}</div>
                    <div class="stat-chip-lbl">Completed</div>
                </div>
            `;
        } else if (currentRole === 'trainer') {
            const res = await apiRequest('/api/trainer/overview');
            const data = await res.json();
            const metrics = data.metrics || {};
            statsContainer.innerHTML = `
                <div class="stat-chip">
                    <div class="stat-chip-num">${metrics.total_courses || 0}</div>
                    <div class="stat-chip-lbl">Courses</div>
                </div>
                <div class="stat-chip">
                    <div class="stat-chip-num">${metrics.total_trainees_enrolled || 0}</div>
                    <div class="stat-chip-lbl">Trainees</div>
                </div>
            `;
        } else if (currentRole === 'admin') {
            const res = await apiRequest('/api/admin/users?status=pending');
            const data = await res.json();
            const pendingCount = data.users?.length || 0;
            statsContainer.innerHTML = `
                <div class="stat-chip">
                    <div class="stat-chip-num" style="color:#ffd166;">${pendingCount}</div>
                    <div class="stat-chip-lbl">Pending Approvals</div>
                </div>
            `;
        }
    } catch (e) {
        console.error(e);
    }
}

// ==========================================================
// ==========================================================
// 6. PROFILE BUILDER & COMPLETENESS GAUGE (Multi-Role)
// ==========================================================
async function loadProfileData() {
    try {
        const res = await apiRequest('/api/profile');
        if (!res.ok) return;

        const data = await res.json();
        const user = data.user || {};
        const profile = data.profile || {};

        // 1. User Header Display
        const avatarEl = document.getElementById('profile-avatar-display');
        const nameEl = document.getElementById('profile-full-name');
        const emailEl = document.getElementById('profile-email-text');
        const roleBadgeEl = document.getElementById('profile-role-badge');
        const deptLabelEl = document.getElementById('profile-department-label');
        const desigTextEl = document.getElementById('profile-designation-text');
        const managerTextEl = document.getElementById('profile-manager-text');

        const displayName = user.username || user.email || 'User';
        if (avatarEl) {
            if (user.photo_url && user.photo_url.length > 10) {
                avatarEl.innerHTML = `<img src="${user.photo_url}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
            } else {
                avatarEl.innerText = displayName.charAt(0).toUpperCase();
            }
        }
        if (nameEl) nameEl.innerText = displayName;
        if (emailEl) emailEl.innerText = user.email || '';
        if (roleBadgeEl) {
            const role = (user.user_role || user.role || 'trainee').toLowerCase();
            roleBadgeEl.innerText = role.toUpperCase();
            roleBadgeEl.className = `badge ${role === 'admin' ? 'badge-gold' : role === 'trainer' ? 'badge-cyan' : 'badge-purple'}`;
        }

        if (user.user_role === 'trainee') {
            if (deptLabelEl) deptLabelEl.innerHTML = `<i class="fa-solid fa-building"></i> ${user.department || profile.department || ''}`;
            if (desigTextEl) desigTextEl.innerText = user.designation || profile.designation || '';
            if (managerTextEl) managerTextEl.innerText = profile.manager_name || profile.manager || '';
        } else if (user.user_role === 'trainer') {
            if (deptLabelEl) deptLabelEl.innerHTML = `<i class="fa-solid fa-building"></i> ${user.department || user.profession || profile.department || ''}`;
            const expYears = profile.experience_years ? `${profile.experience_years} Years Experience` : '';
            if (desigTextEl) desigTextEl.innerText = expYears;
            const tags = Array.isArray(profile.expertise_tags) ? profile.expertise_tags : [];
            if (managerTextEl) managerTextEl.innerText = tags.join(', ');
        } else if (user.user_role === 'admin') {
            if (deptLabelEl) deptLabelEl.innerHTML = `<i class="fa-solid fa-building"></i> ${user.department || ''}`;
            if (desigTextEl) desigTextEl.innerText = user.designation || '';
            if (managerTextEl) managerTextEl.innerText = '';
        }

        // 2. Render Skills with Delete Button
        const skills = Array.isArray(profile.skills) ? profile.skills : [];
        const skillsList = document.getElementById('profile-skills-list');
        if (skillsList) {
            if (skills.length > 0) {
                skillsList.innerHTML = skills.map((s, idx) => `
                    <div class="skill-card">
                        <div style="display:flex; flex-direction:column; gap:2px;">
                            <strong>${typeof s === 'string' ? s : s.name}</strong>
                            <span class="skill-level-pill" style="align-self:flex-start;">${(typeof s === 'object' && s.level) ? s.level : 'Intermediate'}</span>
                        </div>
                        <button class="btn-delete-item" onclick="deleteProfileItem('skills', ${idx})" title="Remove skill" style="background:transparent; border:none; color:rgba(255,100,100,0.7); cursor:pointer; font-size:1.1rem; padding:4px 8px; border-radius:6px; transition:0.2s;">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                `).join('');
            } else {
                skillsList.innerHTML = '<div class="empty-state-sm">No skills added yet. Click "+ Add Skill" to start building your profile.</div>';
            }
        }

        // 3. Render Qualifications with Delete Button
        const quals = Array.isArray(profile.qualifications) ? profile.qualifications : [];
        const qualsList = document.getElementById('profile-qualifications-list');
        if (qualsList) {
            if (quals.length > 0) {
                qualsList.innerHTML = quals.map((q, idx) => `
                    <div class="timeline-item" style="position:relative;">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                            <div>
                                <div style="font-weight:600; color:#fff; font-size:0.95rem;">${q.degree || 'Degree'}</div>
                                <div style="font-size:0.82rem; color:var(--hud-cyan);">${q.institution || 'Institution'} • ${q.year || ''}</div>
                                ${q.grade ? `<div style="font-size:0.78rem; color:rgba(255,255,255,0.6);">Grade: ${q.grade}</div>` : ''}
                            </div>
                            <button class="btn-delete-item" onclick="deleteProfileItem('qualifications', ${idx})" title="Remove qualification" style="background:transparent; border:none; color:rgba(255,100,100,0.7); cursor:pointer; font-size:1rem; padding:4px 8px;">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </div>
                `).join('');
            } else {
                qualsList.innerHTML = '<div class="empty-state-sm">No qualifications recorded. Click "+ Add Qualification" to add your education.</div>';
            }
        }

        // 4. Render Experience with Delete Button
        const exps = Array.isArray(profile.work_experience) ? profile.work_experience : [];
        const expList = document.getElementById('profile-experience-list');
        if (expList) {
            if (exps.length > 0) {
                expList.innerHTML = exps.map((e, idx) => `
                    <div class="timeline-item" style="position:relative;">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                            <div style="flex:1;">
                                <div style="font-weight:600; color:#fff; font-size:0.95rem;">${e.role || 'Role'} @ ${e.company || 'Company'}</div>
                                <div style="font-size:0.82rem; color:var(--hud-gold);">${e.duration || ''}</div>
                                ${e.description ? `<div style="font-size:0.82rem; color:rgba(255,255,255,0.75); margin-top:4px; line-height:1.4;">${e.description}</div>` : ''}
                            </div>
                            <button class="btn-delete-item" onclick="deleteProfileItem('work_experience', ${idx})" title="Remove experience" style="background:transparent; border:none; color:rgba(255,100,100,0.7); cursor:pointer; font-size:1rem; padding:4px 8px;">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </div>
                `).join('');
            } else {
                expList.innerHTML = '<div class="empty-state-sm">No work experience entries recorded. Click "+ Add Experience" to add your career history.</div>';
            }
        }

        // 5. Render Certificates with Delete Button
        const certs = Array.isArray(profile.certificates) ? profile.certificates : [];
        const certsList = document.getElementById('profile-certificates-list');
        if (certsList) {
            if (certs.length > 0) {
                certsList.innerHTML = certs.map((c, idx) => `
                    <div class="cert-card">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                            <strong style="color:#7cf29a;"><i class="fa-solid fa-award"></i> ${c.title || 'Certificate'}</strong>
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span style="font-size:0.7rem; color:rgba(255,255,255,0.5);">${c.issue_date ? new Date(c.issue_date).toLocaleDateString() : ''}</span>
                                <button class="btn-delete-item" onclick="deleteProfileItem('certificates', ${idx})" title="Remove certificate" style="background:transparent; border:none; color:rgba(255,100,100,0.7); cursor:pointer; font-size:0.85rem; padding:2px 4px;">
                                    <i class="fa-solid fa-xmark"></i>
                                </button>
                            </div>
                        </div>
                        <div style="font-size:0.78rem; color:rgba(255,255,255,0.7);">Issuer: ${c.issuer || 'EduPeers L&D'}</div>
                        ${c.certificate_code ? `
                            <div style="font-size:0.75rem; color:var(--hud-cyan); font-family:monospace; margin-top:4px;">
                                ${c.certificate_code}
                            </div>
                        ` : ''}
                    </div>
                `).join('');
            } else {
                certsList.innerHTML = '<div class="empty-state-sm">No certifications recorded. Complete assessments or upload credentials to verify your profile.</div>';
            }
        }

        // 6. Calculate & Display Profile Completeness Score
        let score = profile.completeness_percentage;
        if (typeof score !== 'number' || isNaN(score)) {
            score = 25;
            if (skills.length > 0) score += 25;
            if (quals.length > 0) score += 25;
            if (exps.length > 0 || certs.length > 0) score += 25;
        }
        score = Math.min(100, Math.max(25, score));

        const pctLabel = document.getElementById('profile-completeness-pct');
        const bar = document.getElementById('profile-completeness-bar');
        const hint = document.getElementById('profile-completeness-hint');

        if (pctLabel) pctLabel.innerText = `${score}%`;
        if (bar) {
            bar.style.width = `${score}%`;
            bar.style.background = score === 100 
                ? 'linear-gradient(90deg, #00f2ff, #7cf29a)'
                : score >= 75 
                    ? 'linear-gradient(90deg, #00f2ff, #6b8afd)' 
                    : 'linear-gradient(90deg, #ff758f, #ffd166)';
        }
        if (hint) {
            if (score === 100) {
                hint.innerHTML = '<span style="color:#7cf29a; font-weight:600;"><i class="fa-solid fa-circle-check"></i> Profile is 100% complete and fully verified!</span>';
            } else if (score >= 75) {
                hint.innerHTML = '<span style="color:#00f2ff;">Almost there! Add work experience or certifications to reach 100%.</span>';
            } else if (score >= 50) {
                hint.innerHTML = '<span style="color:#ffd166;">Good progress! Add qualifications and skills to complete your profile.</span>';
            } else {
                hint.innerText = 'Add skills, qualifications, and past experience to reach 100%.';
            }
        }
    } catch (e) {
        console.error('Error loading profile:', e);
    }
}

// Modal Openers for Profile
function openAddSkillModal() { document.getElementById('modal-add-skill').style.display = 'flex'; }
function openAddQualificationModal() { document.getElementById('modal-add-qualification').style.display = 'flex'; }
function openAddExperienceModal() { document.getElementById('modal-add-experience').style.display = 'flex'; }
function openUploadCertificateModal() { 
    const modal = document.getElementById('modal-add-certificate');
    if (modal) modal.style.display = 'flex';
    else alert('Certificates are automatically awarded when you achieve a passing score on course assessments!'); 
}

// Modal Submission Handlers
async function handleAddSkillSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('skill-name').value.trim();
    const level = document.getElementById('skill-level').value;

    try {
        const getRes = await apiRequest('/api/profile');
        const data = await getRes.json();
        const skills = data.profile?.skills || [];
        skills.push({ name, level });

        await apiRequest('/api/profile', {
            method: 'PUT',
            body: { skills }
        });

        document.getElementById('skill-name').value = '';
        closeModal('modal-add-skill');
        loadProfileData();
    } catch (err) {
        alert('Failed to save skill: ' + err.message);
    }
}

async function handleAddQualificationSubmit(e) {
    e.preventDefault();
    const degree = document.getElementById('qual-degree').value.trim();
    const institution = document.getElementById('qual-institution').value.trim();
    const year = document.getElementById('qual-year').value.trim();
    const grade = document.getElementById('qual-grade').value.trim();

    try {
        const getRes = await apiRequest('/api/profile');
        const data = await getRes.json();
        const qualifications = data.profile?.qualifications || [];
        qualifications.push({ degree, institution, year, grade });

        await apiRequest('/api/profile', {
            method: 'PUT',
            body: { qualifications }
        });

        document.getElementById('qual-degree').value = '';
        document.getElementById('qual-institution').value = '';
        document.getElementById('qual-year').value = '';
        document.getElementById('qual-grade').value = '';
        closeModal('modal-add-qualification');
        loadProfileData();
    } catch (err) {
        alert('Failed to save qualification: ' + err.message);
    }
}

async function handleAddExperienceSubmit(e) {
    e.preventDefault();
    const company = document.getElementById('exp-company').value.trim();
    const role = document.getElementById('exp-role').value.trim();
    const duration = document.getElementById('exp-duration').value.trim();
    const description = document.getElementById('exp-desc').value.trim();

    try {
        const getRes = await apiRequest('/api/profile');
        const data = await getRes.json();
        const work_experience = data.profile?.work_experience || [];
        work_experience.push({ company, role, duration, description });

        await apiRequest('/api/profile', {
            method: 'PUT',
            body: { work_experience }
        });

        document.getElementById('exp-company').value = '';
        document.getElementById('exp-role').value = '';
        document.getElementById('exp-duration').value = '';
        document.getElementById('exp-desc').value = '';
        closeModal('modal-add-experience');
        loadProfileData();
    } catch (err) {
        alert('Failed to save experience: ' + err.message);
    }
}

async function handleAddCertificateSubmit(e) {
    e.preventDefault();
    const title = document.getElementById('cert-title').value.trim();
    const issuer = document.getElementById('cert-issuer').value.trim();
    const issue_date = document.getElementById('cert-date').value;
    const certificate_code = document.getElementById('cert-code').value.trim();

    try {
        const getRes = await apiRequest('/api/profile');
        const data = await getRes.json();
        const certificates = data.profile?.certificates || [];
        certificates.push({ title, issuer, issue_date, certificate_code });

        await apiRequest('/api/profile', {
            method: 'PUT',
            body: { certificates, certifications: certificates }
        });

        document.getElementById('cert-title').value = '';
        document.getElementById('cert-issuer').value = '';
        document.getElementById('cert-date').value = '';
        document.getElementById('cert-code').value = '';
        closeModal('modal-add-certificate');
        loadProfileData();
    } catch (err) {
        alert('Failed to save certificate: ' + err.message);
    }
}

async function deleteProfileItem(itemType, index) {
    if (!confirm('Remove this item from your profile?')) return;

    try {
        const getRes = await apiRequest('/api/profile');
        const data = await getRes.json();
        const currentList = Array.isArray(data.profile?.[itemType]) ? data.profile[itemType] : [];
        currentList.splice(index, 1);

        const payload = {};
        payload[itemType] = currentList;
        if (itemType === 'certificates') payload['certifications'] = currentList;

        await apiRequest('/api/profile', {
            method: 'PUT',
            body: payload
        });

        loadProfileData();
    } catch (err) {
        alert('Failed to remove item: ' + err.message);
    }
}

// ==========================================================
// 7. COURSE CATALOG & ENROLLMENT (Trainee)
// ==========================================================
let allLoadedCourses = [];

async function loadCourseCatalog() {
    const grid = document.getElementById('course-catalog-grid');
    if (!grid) return;

    try {
        const res = await apiRequest('/api/courses');
        if (res.ok) {
            const data = await res.json();
            allLoadedCourses = data.courses || [];
            renderCourseGrid(allLoadedCourses);
        }
    } catch (e) {
        grid.innerHTML = '<div class="empty-state">Unable to load courses.</div>';
    }
}

function renderCourseGrid(courses) {
    const grid = document.getElementById('course-catalog-grid');
    if (!grid) return;

    if (courses.length === 0) {
        grid.innerHTML = '<div class="empty-state">No courses found matching this subject filter.</div>';
        return;
    }

    grid.innerHTML = courses.map(c => `
        <div class="glass-card course-card">
            <div>
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.8rem;">
                    <span class="badge badge-cyan">${c.subject}</span>
                    <span style="font-size:0.75rem; color:rgba(255,255,255,0.6);"><i class="fa-solid fa-clock"></i> ${c.duration_hours}h</span>
                </div>
                <h3 style="margin:0 0 0.5rem; font-size:1.15rem; color:#fff;">${c.title}</h3>
                <p style="font-size:0.85rem; color:rgba(255,255,255,0.7); line-height:1.5; margin-bottom:1rem;">${c.description}</p>
            </div>
            <div>
                <div style="font-size:0.78rem; color:rgba(255,255,255,0.5); margin-bottom:0.8rem;">
                    <i class="fa-solid fa-chalkboard-user"></i> Trainer: <strong>${c.trainer_name || 'Staff Instructor'}</strong>
                </div>
                <div style="display:flex; gap:8px;">
                    <button class="btn-outline-sm" style="flex:1;" onclick="openCourseDetails('${c.id}')">View Syllabus</button>
                    ${c.is_enrolled ? `
                        <button class="btn-success" style="padding:6px 12px; font-size:0.8rem;" onclick="openCourseDetails('${c.id}')">
                            <i class="fa-solid fa-check"></i> Enrolled
                        </button>
                    ` : `
                        <button class="btn-primary" style="flex:1;" onclick="enrollInCourse('${c.id}')">
                            <i class="fa-solid fa-plus"></i> Enroll
                        </button>
                    `}
                </div>
            </div>
        </div>
    `).join('');
}

function filterCoursesBySubject(subject, btnEl) {
    document.querySelectorAll('#course-filter-pills .filter-pill').forEach(p => p.classList.remove('active'));
    btnEl.classList.add('active');

    if (subject === 'all') {
        renderCourseGrid(allLoadedCourses);
    } else {
        const filtered = allLoadedCourses.filter(c => c.subject === subject);
        renderCourseGrid(filtered);
    }
}

function switchCourseSubTab(subTab) {
    const tabCat = document.getElementById('tab-btn-catalog');
    const tabMy = document.getElementById('tab-btn-mycourses');
    const gridCat = document.getElementById('course-catalog-grid');
    const gridMy = document.getElementById('my-courses-container');

    if (subTab === 'catalog') {
        tabCat.classList.add('active');
        tabMy.classList.remove('active');
        gridCat.style.display = 'grid';
        gridMy.style.display = 'none';
    } else {
        tabMy.classList.add('active');
        tabCat.classList.remove('active');
        gridMy.style.display = 'grid';
        gridCat.style.display = 'none';
        loadMyCourses();
    }
}

async function loadMyCourses() {
    const grid = document.getElementById('my-courses-container');
    const countBadge = document.getElementById('my-courses-count');
    if (!grid) return;

    try {
        const res = await apiRequest('/api/trainee/my-courses');
        if (res.ok) {
            const data = await res.json();
            const enrollments = data.enrollments || [];
            if (countBadge) countBadge.innerText = enrollments.length;

            if (enrollments.length === 0) {
                grid.innerHTML = '<div class="empty-state">You are not currently enrolled in any courses. Browse the catalog to get started!</div>';
                return;
            }

            grid.innerHTML = enrollments.map(e => `
                <div class="glass-card course-card">
                    <div>
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.8rem;">
                            <span class="badge badge-purple">${e.subject}</span>
                            <span class="badge ${e.progress_pct === 100 ? 'badge-success' : 'badge-cyan'}">${e.progress_pct}% Completed</span>
                        </div>
                        <h3 style="margin:0 0 0.5rem; font-size:1.15rem; color:#fff;">${e.title}</h3>
                        
                        <!-- Progress Bar -->
                        <div class="progress-bar-bg" style="margin: 0.8rem 0;">
                            <div class="progress-bar-fill" style="width: ${e.progress_pct}%;"></div>
                        </div>

                        <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:rgba(255,255,255,0.6);">
                            <span>Resources: ${e.completed_resources || 0} / ${e.total_resources || 0}</span>
                            <span>Assessments: ${e.passed_assessments || 0} / ${e.total_assessments || 0}</span>
                        </div>
                    </div>
                    <div style="margin-top:1.2rem; display:flex; gap:8px;">
                        <button class="btn-primary" style="flex:1;" onclick="openCourseDetails('${e.course_id}')">
                            <i class="fa-solid fa-arrow-right"></i> Open Course
                        </button>
                        <button class="btn-outline-sm" title="Give Feedback" onclick="openFeedbackModal('${e.course_id}', '${e.trainer_name}')">
                            <i class="fa-solid fa-star" style="color:var(--hud-gold);"></i>
                        </button>
                    </div>
                </div>
            `).join('');
        }
    } catch (e) {
        console.error(e);
    }
}

async function enrollInCourse(courseId) {
    try {
        const res = await apiRequest(`/api/courses/${courseId}/enroll`, { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
            alert(data.message);
            loadCourseCatalog();
            loadMyCourses();
            loadNotifications();
        } else {
            alert('Enrollment error: ' + data.error);
        }
    } catch (err) {
        alert('Network error: ' + err.message);
    }
}

async function openCourseDetails(courseId) {
    const modal = document.getElementById('modal-course-detail');
    const titleEl = document.getElementById('modal-course-title');
    const bodyEl = document.getElementById('modal-course-body');

    bodyEl.innerHTML = '<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i> Loading syllabus...</div>';
    modal.style.display = 'flex';

    try {
        const res = await apiRequest(`/api/courses/${courseId}`);
        if (res.ok) {
            const data = await res.json();
            const course = data.course;
            const resources = data.resources || [];
            const questionnaires = data.questionnaires || [];

            titleEl.innerText = course.title;
            bodyEl.innerHTML = `
                <div style="margin-bottom:1.5rem;">
                    <div style="display:flex; gap:8px; margin-bottom:0.8rem;">
                        <span class="badge badge-cyan">${course.subject}</span>
                        <span class="badge badge-purple">${course.level}</span>
                        <span class="badge badge-gold"><i class="fa-solid fa-clock"></i> ${course.duration_hours} Hours</span>
                    </div>
                    <p style="color:rgba(255,255,255,0.8); line-height:1.6;">${course.description}</p>
                    ${course.prerequisites ? `<div style="font-size:0.82rem; color:rgba(255,255,255,0.6); margin-top:6px;"><strong>Prerequisites:</strong> ${course.prerequisites}</div>` : ''}
                </div>

                <!-- Learning Resources in this course -->
                <div style="margin-bottom:1.5rem;">
                    <h4 style="margin-bottom:0.8rem; color:#fff; display:flex; align-items:center; gap:8px;">
                        <i class="fa-solid fa-folder-open" style="color:var(--hud-cyan);"></i> Syllabus Modules & Resources (${resources.length})
                    </h4>
                    ${resources.length > 0 ? `
                        <div class="timeline-list">
                            ${resources.map(r => `
                                <div class="timeline-item" style="display:flex; justify-content:space-between; align-items:center;">
                                    <div>
                                        <div style="font-weight:600; color:#fff;">
                                            <i class="fa-solid ${r.type === 'video' ? 'fa-video' : (r.type === 'slides' ? 'fa-file-powerpoint' : 'fa-file-pdf')}" style="color:var(--hud-cyan); margin-right:6px;"></i>
                                            ${r.title}
                                        </div>
                                        <div style="font-size:0.75rem; color:rgba(255,255,255,0.6);">${r.description || ''}</div>
                                    </div>
                                    <button class="btn-outline-sm" onclick="openResourceViewer('${r.id}')">View</button>
                                </div>
                            `).join('')}
                        </div>
                    ` : '<div class="empty-state-sm">No attached resources yet.</div>'}
                </div>

                <!-- Assessments in this course -->
                <div>
                    <h4 style="margin-bottom:0.8rem; color:#fff; display:flex; align-items:center; gap:8px;">
                        <i class="fa-solid fa-file-signature" style="color:var(--hud-purple);"></i> Certifying Assessments (${questionnaires.length})
                    </h4>
                    ${questionnaires.length > 0 ? `
                        <div class="timeline-list">
                            ${questionnaires.map(q => `
                                <div class="timeline-item" style="display:flex; justify-content:space-between; align-items:center;">
                                    <div>
                                        <div style="font-weight:600; color:#fff;">${q.title}</div>
                                        <div style="font-size:0.75rem; color:var(--hud-gold);">
                                            <i class="fa-solid fa-hourglass-half"></i> Deadline: ${new Date(q.deadline).toLocaleString()} • ${q.duration_minutes} mins
                                        </div>
                                    </div>
                                    <button class="btn-primary" style="padding:6px 12px; font-size:0.8rem;" onclick="startAssessment('${q.id}')">Take Quiz</button>
                                </div>
                            `).join('')}
                        </div>
                    ` : '<div class="empty-state-sm">No assessments attached yet.</div>'}
                </div>
            `;
        }
    } catch (e) {
        bodyEl.innerHTML = '<div class="empty-state">Unable to load course syllabus.</div>';
    }
}

// ==========================================================
// 8. LEARNING RESOURCES & MULTIMEDIA VIEWER
// ==========================================================
let allLoadedResources = [];

async function loadLearningResources() {
    const grid = document.getElementById('resources-grid');
    if (!grid) return;

    try {
        const res = await apiRequest('/api/resources');
        if (res.ok) {
            const data = await res.json();
            allLoadedResources = data.resources || [];
            renderResourcesGrid(allLoadedResources);
        }
    } catch (e) {
        grid.innerHTML = '<div class="empty-state">Unable to load learning resources.</div>';
    }
}

function renderResourcesGrid(resources) {
    const grid = document.getElementById('resources-grid');
    if (!grid) return;

    if (resources.length === 0) {
        grid.innerHTML = '<div class="empty-state">No resources found matching this filter.</div>';
        return;
    }

    grid.innerHTML = resources.map(r => `
        <div class="glass-card resource-card">
            <div>
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.8rem;">
                    <span class="badge badge-purple"><i class="fa-solid ${r.type === 'video' ? 'fa-video' : (r.type === 'slides' ? 'fa-file-powerpoint' : 'fa-file-pdf')}"></i> ${r.type.toUpperCase()}</span>
                    <span style="font-size:0.75rem; color:rgba(255,255,255,0.6);">${r.subject}</span>
                </div>
                <h3 style="margin:0 0 0.5rem; font-size:1.1rem; color:#fff;">${r.title}</h3>
                <p style="font-size:0.85rem; color:rgba(255,255,255,0.7); line-height:1.5; margin-bottom:1rem;">${r.description || 'Comprehensive learning material.'}</p>
            </div>
            <div>
                <div style="font-size:0.75rem; color:rgba(255,255,255,0.5); margin-bottom:0.8rem;">
                    Trainer: ${r.trainer_name || 'EduPeers Faculty'}
                </div>
                <button class="btn-primary" style="width:100%;" onclick="openResourceViewer('${r.id}')">
                    <i class="fa-solid fa-eye"></i> Open Resource
                </button>
            </div>
        </div>
    `).join('');
}

function filterResourcesByType(type, btnEl) {
    document.querySelectorAll('.resource-type-filters .filter-pill').forEach(p => p.classList.remove('active'));
    btnEl.classList.add('active');

    if (type === 'all') {
        renderResourcesGrid(allLoadedResources);
    } else {
        const filtered = allLoadedResources.filter(r => r.type === type);
        renderResourcesGrid(filtered);
    }
}

async function openResourceViewer(resourceId) {
    currentViewingResourceId = resourceId;
    const modal = document.getElementById('modal-resource-viewer');
    const titleEl = document.getElementById('modal-resource-title');
    const bodyEl = document.getElementById('modal-resource-body');
    const footerEl = document.getElementById('modal-resource-footer');

    modal.style.display = 'flex';
    bodyEl.innerHTML = '<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i> Loading resource...</div>';

    try {
        const res = await apiRequest('/api/resources');
        const data = await res.json();
        const resource = (data.resources || []).find(r => r.id === resourceId);

        if (!resource) {
            bodyEl.innerHTML = '<div class="empty-state">Resource not found or no longer available.</div>';
            return;
        }

        titleEl.innerHTML = `<span class="badge badge-purple" style="margin-right:8px;">${(resource.type || 'ASSET').toUpperCase()}</span> ${resource.title}`;

        let downloadBtnHtml = '';
        if (resource.file_data || resource.file_url) {
            downloadBtnHtml = `
                <button class="btn-outline" onclick="downloadResourceFile('${resource.id}')">
                    <i class="fa-solid fa-download"></i> Download Attached Asset ${resource.file_size ? `(${resource.file_size})` : ''}
                </button>
            `;
        }

        if (footerEl) {
            if (currentRole === 'trainee') {
                footerEl.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; width:100%; flex-wrap:wrap; gap:10px;">
                        <div>${downloadBtnHtml}</div>
                        <button class="btn-success" id="btn-mark-resource-complete" onclick="markCurrentResourceCompleted()">
                            <i class="fa-solid fa-check"></i> ${resource.is_viewed ? 'Completed ✓' : 'Mark as Completed (+Progress)'}
                        </button>
                    </div>
                `;
            } else {
                footerEl.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; width:100%; flex-wrap:wrap; gap:10px;">
                        <div>${downloadBtnHtml}</div>
                        <button class="btn-outline" onclick="closeModal('modal-resource-viewer')">Close</button>
                    </div>
                `;
            }
        }

        if (resource.type === 'video') {
            const hasVideoData = resource.file_data && resource.file_data.startsWith('data:video');
            const isEmbedUrl = resource.file_url && (resource.file_url.includes('youtube') || resource.file_url.includes('youtu.be') || resource.file_url.includes('vimeo') || resource.file_url.includes('loom'));
            
            let videoEmbedUrl = resource.file_url;
            if (isEmbedUrl && resource.file_url.includes('watch?v=')) {
                videoEmbedUrl = resource.file_url.replace('watch?v=', 'embed/');
            } else if (isEmbedUrl && resource.file_url.includes('youtu.be/')) {
                const vidId = resource.file_url.split('youtu.be/')[1].split('?')[0];
                videoEmbedUrl = `https://www.youtube.com/embed/${vidId}`;
            }

            bodyEl.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; width:100%;">
                    <div style="width:100%; max-height:480px; background:#000; border-radius:14px; overflow:hidden; display:flex; align-items:center; justify-content:center; aspect-ratio:16/9;">
                        ${hasVideoData ? `
                            <video controls style="width:100%; height:100%; object-fit:contain;" src="${resource.file_data}"></video>
                        ` : isEmbedUrl ? `
                            <iframe width="100%" height="100%" src="${videoEmbedUrl}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
                        ` : resource.file_url ? `
                            <video controls style="width:100%; height:100%; object-fit:contain;" src="${resource.file_url}">
                                Your browser does not support the video tag.
                            </video>
                        ` : `
                            <div style="text-align:center; padding:3rem; color:rgba(255,255,255,0.7);">
                                <i class="fa-solid fa-circle-play" style="font-size:3rem; color:var(--hud-cyan); margin-bottom:1rem;"></i>
                                <div>Ready for HD Streaming: <strong>${resource.file_name || resource.title}</strong></div>
                            </div>
                        `}
                    </div>
                    <div style="width:100%; margin-top:1.2rem; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:1.2rem;">
                        <h4 style="margin:0 0 0.5rem; color:#fff;">Overview & Key Topics</h4>
                        <p style="color:rgba(255,255,255,0.85); font-size:0.9rem; line-height:1.6; margin:0;">
                            ${resource.description || 'No description provided.'}
                        </p>
                    </div>
                </div>
            `;
        } else {
            const hasFileData = resource.file_data && resource.file_data.startsWith('data:');
            bodyEl.innerHTML = `
                <div style="background:#090d16; border:1px solid rgba(255,255,255,0.1); border-radius:14px; padding:2rem; min-height:300px;">
                    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:1.5rem; flex-wrap:wrap; gap:12px;">
                        <div style="display:flex; align-items:center; gap:14px;">
                            <div style="width:48px; height:48px; border-radius:12px; background:linear-gradient(135deg, rgba(0,242,255,0.2), rgba(199,125,255,0.2)); display:flex; align-items:center; justify-content:center; color:var(--hud-cyan); font-size:1.5rem;">
                                <i class="fa-solid ${resource.type === 'slides' ? 'fa-file-powerpoint' : resource.type === 'link' ? 'fa-link' : 'fa-file-pdf'}"></i>
                            </div>
                            <div>
                                <h4 style="margin:0; color:#fff; font-size:1.1rem;">${resource.file_name || resource.title}</h4>
                                <span style="font-size:0.75rem; color:rgba(255,255,255,0.5);">${resource.file_size || 'Attached File'} • ${(resource.type || 'DOCUMENT').toUpperCase()}</span>
                            </div>
                        </div>
                        ${resource.file_url ? `
                            <a href="${resource.file_url}" target="_blank" rel="noopener noreferrer" class="btn-outline-sm" style="text-decoration:none;">
                                <i class="fa-solid fa-arrow-up-right-from-square"></i> Open External Link
                            </a>
                        ` : ''}
                    </div>

                    <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:12px; padding:1.5rem; margin-bottom:1.5rem;">
                        <h5 style="margin:0 0 0.5rem; color:var(--hud-cyan); font-size:0.85rem; text-transform:uppercase; letter-spacing:0.5px;">Summary & Study Guide</h5>
                        <p style="color:rgba(255,255,255,0.85); line-height:1.7; margin:0; font-size:0.92rem; white-space:pre-line;">
                            ${resource.description || 'Comprehensive learning reference material published by your trainer.'}
                        </p>
                    </div>

                    ${hasFileData ? `
                        <div style="padding:1.2rem; background:rgba(0,242,255,0.05); border:1px solid rgba(0,242,255,0.2); border-radius:12px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
                            <div>
                                <div style="font-weight:600; color:#fff;"><i class="fa-solid fa-file-arrow-down" style="color:var(--hud-cyan);"></i> ${resource.file_name || 'Attached Resource Document'}</div>
                                <div style="font-size:0.75rem; color:rgba(255,255,255,0.6);">Ready for instant offline study</div>
                            </div>
                            <button class="btn-primary" onclick="downloadResourceFile('${resource.id}')">
                                <i class="fa-solid fa-download"></i> Download Asset
                            </button>
                        </div>
                    ` : ''}
                </div>
            `;
        }
    } catch (e) {
        bodyEl.innerHTML = '<div class="empty-state">Unable to load resource details.</div>';
    }
}

async function markCurrentResourceCompleted() {
    if (!currentViewingResourceId) return;
    try {
        const res = await apiRequest(`/api/resources/${currentViewingResourceId}/complete`, { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
            alert('✅ Marked as completed! Your course progress has been updated.');
            closeModal('modal-resource-viewer');
            loadMyCourses();
            loadLearningResources();
            loadNotifications();
        } else {
            alert('Error: ' + data.error);
        }
    } catch (err) {
        alert('Network error: ' + err.message);
    }
}

// ==========================================================
// 9. MCQ ASSESSMENT ENGINE (Timed Quizzes & Certs)
// ==========================================================
async function loadTraineeAssessments() {
    const grid = document.getElementById('assessments-grid');
    if (!grid) return;

    try {
        const res = await apiRequest('/api/questionnaires');
        if (res.ok) {
            const data = await res.json();
            const questionnaires = data.questionnaires || [];

            if (questionnaires.length === 0) {
                grid.innerHTML = '<div class="empty-state">No assessments are currently active.</div>';
                return;
            }

            grid.innerHTML = questionnaires.map(q => {
                const isOverdue = new Date(q.deadline) < new Date();
                return `
                    <div class="glass-card assessment-card">
                        <div>
                            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.8rem;">
                                <span class="badge badge-purple">${q.subject}</span>
                                <span class="badge ${isOverdue ? 'badge-danger' : 'badge-gold'}">
                                    <i class="fa-solid fa-clock"></i> ${isOverdue ? 'Deadline Passed' : 'Active'}
                                </span>
                            </div>
                            <h3 style="margin:0 0 0.5rem; font-size:1.15rem; color:#fff;">${q.title}</h3>
                            <p style="font-size:0.85rem; color:rgba(255,255,255,0.7); line-height:1.5;">${q.description || 'Subject mastery assessment.'}</p>
                            
                            <div style="display:flex; flex-direction:column; gap:4px; font-size:0.78rem; color:rgba(255,255,255,0.6); margin:1rem 0;">
                                <div><i class="fa-solid fa-hourglass-half"></i> Duration: <strong>${q.duration_minutes} mins</strong></div>
                                <div><i class="fa-solid fa-calendar"></i> Deadline: <strong>${new Date(q.deadline).toLocaleString()}</strong></div>
                                <div><i class="fa-solid fa-bullseye"></i> Pass Threshold: <strong>${q.pass_threshold}%</strong></div>
                                ${q.user_attempts > 0 ? `<div><i class="fa-solid fa-chart-simple"></i> Your Best Score: <strong>${q.best_score}%</strong> (${q.is_passed ? 'PASSED 🎓' : 'Attempted'})</div>` : ''}
                            </div>
                        </div>

                        <div>
                            ${isOverdue ? `
                                <button class="btn-outline-sm" style="width:100%; opacity:0.6;" disabled>
                                    <i class="fa-solid fa-lock"></i> Deadline Passed
                                </button>
                            ` : `
                                <button class="btn-primary" style="width:100%;" onclick="startAssessment('${q.id}')">
                                    <i class="fa-solid fa-play"></i> ${q.user_attempts > 0 ? 'Retake Assessment' : 'Start Assessment'}
                                </button>
                            `}
                        </div>
                    </div>
                `;
            }).join('');
        }
    } catch (e) {
        grid.innerHTML = '<div class="empty-state">Unable to load assessments.</div>';
    }
}

async function startAssessment(questionnaireId) {
    const modal = document.getElementById('modal-exam-arena');
    const titleEl = document.getElementById('exam-title');
    const subjectBadge = document.getElementById('exam-subject-badge');
    const container = document.getElementById('exam-questions-container');

    container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i> Initializing exam session...</div>';
    modal.style.display = 'flex';

    try {
        const res = await apiRequest(`/api/questionnaires/${questionnaireId}`);
        if (!res.ok) {
            const data = await res.json();
            alert('Cannot start exam: ' + data.error);
            closeModal('modal-exam-arena');
            return;
        }

        const data = await res.json();
        activeExamData = data;
        const qData = data.questionnaire;
        const questions = data.questions || [];

        titleEl.innerText = qData.title;
        subjectBadge.innerText = qData.subject;

        // Render Questions
        container.innerHTML = questions.map((q, idx) => {
            const options = Array.isArray(q.options) ? q.options : JSON.parse(q.options || '[]');
            return `
                <div class="exam-question-item">
                    <div style="font-weight:600; font-size:0.95rem; color:#fff; margin-bottom:8px;">
                        Q${idx + 1}. ${q.question_text}
                    </div>
                    <div class="exam-options-stack">
                        ${options.map((opt, optIdx) => `
                            <label class="exam-option-label">
                                <input type="radio" name="q_${q.id}" value="${optIdx}">
                                <span>${opt}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>
            `;
        }).join('');

        // Start Countdown Timer
        startExamTimer(qData.duration_minutes);
    } catch (err) {
        alert('Error loading exam: ' + err.message);
        closeModal('modal-exam-arena');
    }
}

function startExamTimer(durationMinutes) {
    if (examTimerInterval) clearInterval(examTimerInterval);

    let remainingSeconds = (durationMinutes || 20) * 60;
    const clockEl = document.getElementById('exam-timer-clock');

    function updateClock() {
        const m = Math.floor(remainingSeconds / 60);
        const s = remainingSeconds % 60;
        clockEl.innerText = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

        if (remainingSeconds <= 0) {
            clearInterval(examTimerInterval);
            alert('⏰ Time is up! Submitting your answers automatically.');
            submitAssessmentExam();
        }
        remainingSeconds--;
    }

    updateClock();
    examTimerInterval = setInterval(updateClock, 1000);
}

function closeExamConfirm() {
    if (confirm('Are you sure you want to exit the exam arena? Your current progress will not be saved.')) {
        if (examTimerInterval) clearInterval(examTimerInterval);
        closeModal('modal-exam-arena');
    }
}

async function submitAssessmentExam() {
    if (!activeExamData) return;
    if (examTimerInterval) clearInterval(examTimerInterval);

    const questionnaireId = activeExamData.questionnaire.id;
    const questions = activeExamData.questions || [];
    const answers = {};

    for (const q of questions) {
        const selected = document.querySelector(`input[name="q_${q.id}"]:checked`);
        if (selected) {
            answers[q.id] = parseInt(selected.value);
        }
    }

    const btn = document.getElementById('btn-submit-exam');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Grading Attempt...';
    }

    try {
        const res = await apiRequest(`/api/questionnaires/${questionnaireId}/attempt`, {
            method: 'POST',
            body: { answers }
        });
        const data = await res.json();

        closeModal('modal-exam-arena');

        if (res.ok) {
            showExamResultsModal(data);
            loadTraineeAssessments();
            loadMyCourses();
            loadNotifications();
        } else {
            alert('Submission error: ' + data.error);
        }
    } catch (err) {
        alert('Network error submitting exam: ' + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit Answers for Grading';
        }
    }
}

function showExamResultsModal(resultData) {
    const modal = document.getElementById('modal-exam-result');
    const body = document.getElementById('exam-result-body');
    const sub = resultData.submission;
    const isPassed = sub.is_passed;

    body.innerHTML = `
        <div style="font-size:3rem; margin-bottom:1rem;">
            ${isPassed ? '🏆' : '📚'}
        </div>
        <h2 style="color:${isPassed ? '#7cf29a' : '#ffd166'}; margin-bottom:0.5rem;">
            ${isPassed ? 'Assessment Passed!' : 'Assessment Completed'}
        </h2>
        <div style="font-size:2rem; font-weight:700; color:#fff; margin-bottom:0.5rem;">
            ${sub.score_percentage}%
        </div>
        <p style="color:rgba(255,255,255,0.7); font-size:0.9rem; margin-bottom:1.5rem;">
            You scored <strong>${sub.correct_answers}</strong> out of <strong>${sub.total_questions}</strong> correctly.
        </p>

        ${resultData.certificate ? `
            <div style="background:rgba(0,255,136,0.08); border:1px solid rgba(0,255,136,0.3); border-radius:14px; padding:1.2rem; margin-bottom:1.5rem; text-align:center;">
                <div style="font-weight:700; color:#7cf29a; font-size:1.1rem; margin-bottom:4px;">
                    <i class="fa-solid fa-award"></i> Certificate Issued!
                </div>
                <div style="font-size:0.85rem; color:rgba(255,255,255,0.85);">${resultData.certificate.title}</div>
                <div style="font-size:0.75rem; font-family:monospace; color:var(--hud-cyan); margin-top:6px;">
                    Verification Code: ${resultData.certificate.certificate_code}
                </div>
            </div>
        ` : ''}

        <button class="btn-primary" onclick="closeModal('modal-exam-result')">Done</button>
    `;

    modal.style.display = 'flex';
}

// ==========================================================
// 10. FEEDBACK
// ==========================================================
function openFeedbackModal(courseId, trainerName) {
    document.getElementById('feedback-course-id').value = courseId;
    document.getElementById('modal-feedback').style.display = 'flex';
}

function setRating(rating) {
    document.getElementById('feedback-rating-val').value = rating;
    const stars = document.querySelectorAll('#feedback-stars .fa-star');
    stars.forEach((star, idx) => {
        star.classList.toggle('active', idx < rating);
    });
}

async function handleFeedbackSubmit(e) {
    e.preventDefault();
    const course_id = document.getElementById('feedback-course-id').value;
    const rating = parseInt(document.getElementById('feedback-rating-val').value) || 5;
    const comments = document.getElementById('feedback-comments').value.trim();

    try {
        const res = await apiRequest('/api/feedback', {
            method: 'POST',
            body: { course_id, target_type: 'course', rating, comments }
        });
        const data = await res.json();
        if (res.ok) {
            alert('Thank you! Your feedback has been submitted.');
            closeModal('modal-feedback');
        } else {
            alert('Error: ' + data.error);
        }
    } catch (err) {
        alert('Network error: ' + err.message);
    }
}

// ==========================================================
// 11. TRAINER STUDIO: QUESTIONNAIRES, TRAINEES & LIBRARY
// ==========================================================
async function loadTrainerQuestionnaires() {
    const list = document.getElementById('trainer-questionnaires-list');
    if (!list) return;

    try {
        const res = await apiRequest('/api/questionnaires');
        if (res.ok) {
            const data = await res.json();
            const quests = data.questionnaires || [];

            if (quests.length === 0) {
                list.innerHTML = '<div class="empty-state">You have not created any questionnaires yet. Click "+ Create New Assessment" to start.</div>';
                return;
            }

            list.innerHTML = quests.map(q => `
                <div class="glass-card assessment-card">
                    <div>
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.8rem;">
                            <span class="badge badge-purple">${q.subject}</span>
                            <span class="badge badge-cyan">${q.question_count || 0} Questions</span>
                        </div>
                        <h3 style="margin:0 0 0.5rem; font-size:1.15rem; color:#fff;">${q.title}</h3>
                        <p style="font-size:0.85rem; color:rgba(255,255,255,0.7); line-height:1.5;">${q.description || ''}</p>
                        <div style="font-size:0.78rem; color:rgba(255,255,255,0.6); margin-top:0.8rem;">
                            <i class="fa-solid fa-clock"></i> Deadline: ${new Date(q.deadline).toLocaleString()}
                        </div>
                    </div>
                </div>
            `).join('');
        }
    } catch (e) {
        list.innerHTML = '<div class="empty-state">Unable to load questionnaires.</div>';
    }
}

function openCreateQuestionnaireModal() {
    const container = document.getElementById('quest-builder-items');
    container.innerHTML = '';
    addQuestionItem(); // add 1 initial question
    document.getElementById('modal-create-questionnaire').style.display = 'flex';
}

function addQuestionItem() {
    const container = document.getElementById('quest-builder-items');
    const qIndex = container.children.length + 1;
    const div = document.createElement('div');
    div.className = 'exam-question-item';
    div.style.marginBottom = '1rem';
    div.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <strong>Question ${qIndex}</strong>
            ${qIndex > 1 ? `<button type="button" class="btn-text-sm text-danger" onclick="this.parentElement.parentElement.remove(); updateQuestionCount();">Remove</button>` : ''}
        </div>
        <div class="form-group">
            <input type="text" class="auth-input q-text" placeholder="Enter question text..." required>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px;">
            <input type="text" class="auth-input q-opt" placeholder="Option 1" required>
            <input type="text" class="auth-input q-opt" placeholder="Option 2" required>
            <input type="text" class="auth-input q-opt" placeholder="Option 3" required>
            <input type="text" class="auth-input q-opt" placeholder="Option 4" required>
        </div>
        <div style="display:flex; gap:12px; align-items:center; margin-top:8px;">
            <label style="font-size:0.82rem; color:rgba(255,255,255,0.7);">Correct Option (1-4):</label>
            <select class="auth-input q-correct" style="width:90px;">
                <option value="0">Opt 1</option>
                <option value="1">Opt 2</option>
                <option value="2">Opt 3</option>
                <option value="3">Opt 4</option>
            </select>
        </div>
    `;
    container.appendChild(div);
    updateQuestionCount();
}

function updateQuestionCount() {
    const container = document.getElementById('quest-builder-items');
    document.getElementById('quest-count-label').innerText = container.children.length;
}

async function handleCreateQuestionnaireSubmit(e) {
    e.preventDefault();
    const title = document.getElementById('quest-title').value.trim();
    const subject = document.getElementById('quest-subject').value;
    const deadline = document.getElementById('quest-deadline').value;
    const duration_minutes = document.getElementById('quest-duration').value;
    const pass_threshold = document.getElementById('quest-threshold').value;
    const description = document.getElementById('quest-description').value.trim();

    const items = document.querySelectorAll('#quest-builder-items .exam-question-item');
    const questions = [];

    items.forEach(item => {
        const text = item.querySelector('.q-text').value.trim();
        const opts = Array.from(item.querySelectorAll('.q-opt')).map(o => o.value.trim());
        const correct = parseInt(item.querySelector('.q-correct').value) || 0;
        questions.push({
            question_text: text,
            options: opts,
            correct_option_index: correct,
            marks: 1
        });
    });

    try {
        const res = await apiRequest('/api/questionnaires', {
            method: 'POST',
            body: {
                title, subject, deadline, duration_minutes, pass_threshold, description, questions
            }
        });
        const data = await res.json();
        if (res.ok) {
            alert('Assessment published successfully!');
            closeModal('modal-create-questionnaire');
            loadTrainerQuestionnaires();
        } else {
            alert('Error: ' + data.error);
        }
    } catch (err) {
        alert('Network error: ' + err.message);
    }
}

async function loadTrainerOverview() {
    try {
        const res = await apiRequest('/api/trainer/overview');
        if (res.ok) {
            const data = await res.json();
            const metrics = data.metrics || {};
            const domain = data.trainer_domain || 'General';

            // Set Domain Badge
            const badgeContainer = document.getElementById('trainer-domain-badge-container');
            const domainTag = document.getElementById('trainer-domain-tag');
            if (badgeContainer) {
                badgeContainer.innerHTML = `
                    <div style="background:rgba(0,242,255,0.1); border:1px solid rgba(0,242,255,0.3); padding:6px 14px; border-radius:12px; font-size:0.85rem; color:#fff; display:flex; align-items:center; gap:8px;">
                        <i class="fa-solid fa-chalkboard-user" style="color:var(--hud-cyan);"></i>
                        <span>Domain Focus: <strong>${domain}</strong></span>
                    </div>
                `;
            }
            if (domainTag) {
                domainTag.innerText = `Domain: ${domain}`;
            }

            const cardsContainer = document.getElementById('trainer-metric-cards');
            if (cardsContainer) {
                cardsContainer.innerHTML = `
                    <div class="glass-card stat-metric-card">
                        <div class="stat-chip-num" style="color:var(--hud-cyan);">${metrics.totalCourses || 0}</div>
                        <div class="stat-chip-lbl">Courses Authored</div>
                    </div>
                    <div class="glass-card stat-metric-card">
                        <div class="stat-chip-num" style="color:var(--hud-purple);">${metrics.totalEnrollments || 0}</div>
                        <div class="stat-chip-lbl">Domain Trainees</div>
                    </div>
                    <div class="glass-card stat-metric-card">
                        <div class="stat-chip-num" style="color:#7cf29a;">${metrics.passRate || 0}%</div>
                        <div class="stat-chip-lbl">Pass Rate</div>
                    </div>
                    <div class="glass-card stat-metric-card">
                        <div class="stat-chip-num" style="color:#ffd166;">${metrics.totalSubmissions || 0}</div>
                        <div class="stat-chip-lbl">Assessments Submitted</div>
                    </div>
                `;
            }

            // Domain-Matched Trainees Table
            const matchedTbody = document.getElementById('trainer-matched-trainees-tbody');
            if (matchedTbody) {
                const trainees = data.matched_trainees || [];
                if (trainees.length > 0) {
                    matchedTbody.innerHTML = trainees.map(t => {
                        const avgScore = t.avg_test_score ? parseFloat(t.avg_test_score).toFixed(1) + '%' : 'No tests yet';
                        return `
                            <tr>
                                <td>
                                    <div style="display:flex; align-items:center; gap:8px;">
                                        <div style="width:32px; height:32px; border-radius:50%; background:linear-gradient(135deg, var(--hud-purple), var(--hud-cyan)); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.85rem; color:#fff; flex-shrink:0;">
                                            ${(t.username || t.email).charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <strong>${t.username}</strong><br>
                                            <span style="font-size:0.75rem; color:rgba(255,255,255,0.5);">${t.email}</span>
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <span>Age: <strong>${t.age || 'N/A'}</strong></span><br>
                                    <span style="font-size:0.75rem; color:rgba(255,255,255,0.6);">${t.gender ? t.gender.toUpperCase() : 'N/A'}</span>
                                </td>
                                <td><strong>${t.institution || 'General'}</strong></td>
                                <td><span class="badge badge-purple">${t.profession || t.department || domain}</span></td>
                                <td><strong>${t.total_enrolled_courses || 0}</strong> Active</td>
                                <td>
                                    <span class="badge ${parseFloat(t.avg_test_score) >= 60 ? 'badge-success' : 'badge-gold'}">
                                        Avg: ${avgScore} (${t.passed_tests_count || 0} Passed)
                                    </span>
                                </td>
                                <td>
                                    <button class="btn-outline-sm" style="padding:4px 8px; font-size:0.75rem;" onclick='openUserDetailModal(${JSON.stringify(t).replace(/'/g, "&apos;")})'>
                                        <i class="fa-solid fa-id-card"></i> Profile
                                    </button>
                                </td>
                            </tr>
                        `;
                    }).join('');
                } else {
                    matchedTbody.innerHTML = `<tr><td colspan="7" class="text-center">No trainees registered under <strong>${domain}</strong> yet.</td></tr>`;
                }
            }

            // Submissions table
            const tbody = document.querySelector('#trainer-submissions-table tbody');
            if (tbody) {
                const subs = data.submissions || [];
                if (subs.length > 0) {
                    tbody.innerHTML = subs.map(s => `
                        <tr>
                            <td>
                                <strong>${s.trainee_name}</strong><br>
                                <span style="font-size:0.75rem; color:rgba(255,255,255,0.5);">${s.trainee_email}</span>
                                ${s.trainee_domain ? `<br><span style="font-size:0.72rem; color:var(--hud-cyan);"><i class="fa-solid fa-graduation-cap"></i> ${s.trainee_domain}</span>` : ''}
                            </td>
                            <td>
                                <strong>${s.questionnaire_title}</strong>
                                ${s.questionnaire_subject ? `<br><span style="font-size:0.75rem; color:rgba(255,255,255,0.5);">${s.questionnaire_subject}</span>` : ''}
                            </td>
                            <td><strong style="color:${s.score_percentage >= 60 ? '#7cf29a' : '#ff758f'}; font-size:0.95rem;">${s.score_percentage}%</strong></td>
                            <td><span class="badge ${s.is_passed ? 'badge-success' : 'badge-danger'}">${s.is_passed ? 'PASSED' : 'FAILED'}</span></td>
                            <td>Attempt #${s.attempt_number || 1}</td>
                            <td>${new Date(s.submitted_at).toLocaleString()}</td>
                        </tr>
                    `).join('');
                } else {
                    tbody.innerHTML = '<tr><td colspan="6" class="text-center">No trainee submissions recorded for your domain yet.</td></tr>';
                }
            }
        }
    } catch (e) {
        console.error('Error loading trainer overview:', e);
    }
}

function toggleResourceFormatFields(type) {
    const fileUploadBox = document.getElementById('res-file-upload')?.closest('.form-group')?.parentElement;
    const urlField = document.getElementById('res-file-url')?.closest('.form-group');

    // For "link" type, suggest URL and make file optional; otherwise both are available
    if (type === 'link') {
        if (urlField) urlField.style.outline = '2px solid var(--hud-cyan)';
        if (fileUploadBox) fileUploadBox.style.opacity = '0.5';
    } else {
        if (urlField) urlField.style.outline = '';
        if (fileUploadBox) fileUploadBox.style.opacity = '1';
    }
}

let trainerLoadedResources = [];
let selectedResourceFile = null;

async function loadTrainerResources() {
    const list = document.getElementById('trainer-resources-list');
    if (!list) return;

    try {
        const res = await apiRequest('/api/resources');
        if (res.ok) {
            const data = await res.json();
            trainerLoadedResources = data.resources || [];

            // Compute summary statistics
            const total = trainerLoadedResources.length;
            const published = trainerLoadedResources.filter(r => r.status === 'published').length;
            const drafts = trainerLoadedResources.filter(r => r.status === 'draft').length;
            const views = trainerLoadedResources.reduce((sum, r) => sum + parseInt(r.views_count || 0), 0);

            const totalEl = document.getElementById('trainer-lib-total');
            const pubEl = document.getElementById('trainer-lib-published');
            const draftEl = document.getElementById('trainer-lib-drafts');
            const viewsEl = document.getElementById('trainer-lib-views');

            if (totalEl) totalEl.innerText = total;
            if (pubEl) pubEl.innerText = published;
            if (draftEl) draftEl.innerText = drafts;
            if (viewsEl) viewsEl.innerText = views;

            renderTrainerResourcesList(trainerLoadedResources);
        } else {
            list.innerHTML = '<div class="empty-state">Unable to load library items.</div>';
        }
    } catch (e) {
        console.error('Error loading trainer library:', e);
        list.innerHTML = '<div class="empty-state">Unable to load library items.</div>';
    }
}

function renderTrainerResourcesList(resources) {
    const list = document.getElementById('trainer-resources-list');
    if (!list) return;

    if (resources.length === 0) {
        list.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1; padding: 3rem 1.5rem;">
                <i class="fa-solid fa-cloud-arrow-up" style="font-size:3rem; color:rgba(255,255,255,0.2); margin-bottom:1rem;"></i>
                <div style="font-size:1.15rem; font-weight:600; color:#fff; margin-bottom:0.4rem;">Your Content Library is Empty</div>
                <p style="color:rgba(255,255,255,0.6); max-width:450px; margin:0 auto 1.2rem; font-size:0.88rem;">
                    Upload video lessons, presentation slide decks, or technical guides so your enrolled trainees can view and complete them.
                </p>
                <button class="btn-primary" onclick="openUploadResourceModal()">
                    <i class="fa-solid fa-upload"></i> + Upload First Resource
                </button>
            </div>
        `;
        return;
    }

    list.innerHTML = resources.map(r => {
        const isPublished = r.status === 'published';
        const typeIcon = r.type === 'video' ? 'fa-video' : (r.type === 'slides' ? 'fa-file-powerpoint' : (r.type === 'link' ? 'fa-link' : 'fa-file-pdf'));
        const hasFile = !!(r.file_data || r.file_url);

        return `
            <div class="glass-card resource-card" style="display:flex; flex-direction:column; justify-content:space-between;">
                <div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.8rem;">
                        <span class="badge badge-purple"><i class="fa-solid ${typeIcon}"></i> ${(r.type || 'DOC').toUpperCase()}</span>
                        <span class="badge ${isPublished ? 'badge-success' : 'badge-gold'}">
                            <i class="fa-solid ${isPublished ? 'fa-circle-check' : 'fa-pen-ruler'}"></i> ${isPublished ? 'PUBLISHED' : 'DRAFT'}
                        </span>
                    </div>

                    <h3 style="margin:0 0 0.5rem; font-size:1.1rem; color:#fff; line-height:1.4;">${r.title}</h3>
                    
                    <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:0.8rem;">
                        <span class="badge badge-cyan" style="font-size:0.7rem;">${r.subject || 'General'}</span>
                        ${r.course_title ? `<span class="badge badge-purple" style="font-size:0.7rem;"><i class="fa-solid fa-graduation-cap"></i> ${r.course_title}</span>` : ''}
                        ${r.file_size ? `<span style="font-size:0.72rem; color:rgba(255,255,255,0.5); align-self:center;">${r.file_size}</span>` : ''}
                    </div>

                    <p style="font-size:0.85rem; color:rgba(255,255,255,0.7); line-height:1.5; margin-bottom:1rem;">
                        ${r.description || 'No description provided.'}
                    </p>
                </div>

                <div>
                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.78rem; color:rgba(255,255,255,0.5); margin-bottom:1rem; padding-top:0.8rem; border-top:1px solid rgba(255,255,255,0.06);">
                        <span><i class="fa-solid fa-calendar-days"></i> ${new Date(r.created_at).toLocaleDateString()}</span>
                        <span style="color:#7cf29a; font-weight:600;"><i class="fa-solid fa-eye"></i> ${r.views_count || 0} completions</span>
                    </div>

                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
                        <button class="btn-outline-sm" onclick="openResourceViewer('${r.id}')" style="justify-content:center;">
                            <i class="fa-solid fa-eye"></i> Preview
                        </button>
                        <button class="btn-outline-sm" onclick="toggleResourceStatus('${r.id}', '${r.status}')" style="justify-content:center; color:${isPublished ? '#ffd166' : '#7cf29a'};">
                            <i class="fa-solid ${isPublished ? 'fa-eye-slash' : 'fa-upload'}"></i> ${isPublished ? 'Unpublish' : 'Publish'}
                        </button>
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
                        ${hasFile ? `
                            <button class="btn-text-sm" onclick="downloadResourceFile('${r.id}')" style="color:var(--hud-cyan); padding:4px 0;">
                                <i class="fa-solid fa-download"></i> Download
                            </button>
                        ` : `<span></span>`}
                        <div style="display:flex; gap:12px;">
                            <button class="btn-text-sm" onclick="openEditResourceModal('${r.id}')" style="color:rgba(255,255,255,0.7);">
                                <i class="fa-solid fa-pen"></i> Edit
                            </button>
                            <button class="btn-text-sm" onclick="deleteTrainerResource('${r.id}')" style="color:var(--hud-red);">
                                <i class="fa-solid fa-trash"></i> Delete
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function filterTrainerResources(type, btnEl) {
    document.querySelectorAll('#view-trainer-library .filter-pill').forEach(p => p.classList.remove('active'));
    btnEl.classList.add('active');

    if (type === 'all') {
        renderTrainerResourcesList(trainerLoadedResources);
    } else {
        const filtered = trainerLoadedResources.filter(r => r.type === type);
        renderTrainerResourcesList(filtered);
    }
}

function handleTrainerResourceSearch(query) {
    const q = (query || '').toLowerCase().trim();
    if (!q) {
        renderTrainerResourcesList(trainerLoadedResources);
        return;
    }
    const filtered = trainerLoadedResources.filter(r => 
        (r.title && r.title.toLowerCase().includes(q)) ||
        (r.subject && r.subject.toLowerCase().includes(q)) ||
        (r.description && r.description.toLowerCase().includes(q)) ||
        (r.course_title && r.course_title.toLowerCase().includes(q))
    );
    renderTrainerResourcesList(filtered);
}

function handleResourceFileSelected(event) {
    const file = event.target.files[0];
    const infoBox = document.getElementById('res-file-info');
    const infoText = document.getElementById('res-file-info-text');

    if (!file) {
        selectedResourceFile = null;
        if (infoBox) infoBox.style.display = 'none';
        return;
    }

    if (file.size > 15 * 1024 * 1024) {
        alert('File is too large. Maximum allowed attachment size is 15MB.');
        event.target.value = '';
        selectedResourceFile = null;
        if (infoBox) infoBox.style.display = 'none';
        return;
    }

    const formattedSize = file.size > 1024 * 1024 ? (file.size / (1024 * 1024)).toFixed(1) + ' MB' : (file.size / 1024).toFixed(0) + ' KB';
    if (infoBox && infoText) {
        infoText.innerText = `${file.name} (${formattedSize})`;
        infoBox.style.display = 'block';
    }

    const reader = new FileReader();
    reader.onload = () => {
        selectedResourceFile = {
            name: file.name,
            size: formattedSize,
            type: file.type,
            data: reader.result
        };
    };
    reader.readAsDataURL(file);
}

async function openUploadResourceModal() {
    selectedResourceFile = null;
    const fileInput = document.getElementById('res-file-upload');
    if (fileInput) fileInput.value = '';
    const infoBox = document.getElementById('res-file-info');
    if (infoBox) infoBox.style.display = 'none';

    // Populate Subjects dropdown
    const subjSelect = document.getElementById('res-subject');
    if (subjSelect) {
        try {
            const res = await apiRequest('/api/subjects');
            if (res.ok) {
                const data = await res.json();
                const subjects = data.subjects || [];
                subjSelect.innerHTML = subjects.map(s => `<option value="${s.name}">${s.name}</option>`).join('');
            }
        } catch (e) {}
    }

    // Populate Courses dropdown
    const courseSelect = document.getElementById('res-course-link');
    if (courseSelect) {
        try {
            const res = await apiRequest('/api/courses');
            if (res.ok) {
                const data = await res.json();
                const courses = data.courses || [];
                courseSelect.innerHTML = '<option value="">General Subject Library</option>' + 
                    courses.map(c => `<option value="${c.id}">${c.title} (${c.subject})</option>`).join('');
            }
        } catch (e) {}
    }

    document.getElementById('modal-upload-resource').style.display = 'flex';
}

async function handleUploadResourceSubmit(e) {
    e.preventDefault();
    const submitBtn = document.getElementById('res-upload-submit-btn');
    if (submitBtn) submitBtn.disabled = true;

    const title = document.getElementById('res-title').value.trim();
    const type = document.getElementById('res-type').value;
    const subject = document.getElementById('res-subject').value;
    const course_id = document.getElementById('res-course-link').value || null;
    const status = document.getElementById('res-status').value || 'published';
    const file_url = document.getElementById('res-file-url').value.trim();
    const description = document.getElementById('res-description').value.trim();

    const payload = {
        title,
        type,
        subject,
        course_id,
        status,
        file_url: file_url || null,
        description: description || null,
        file_name: selectedResourceFile ? selectedResourceFile.name : null,
        file_size: selectedResourceFile ? selectedResourceFile.size : null,
        file_type: selectedResourceFile ? selectedResourceFile.type : null,
        file_data: selectedResourceFile ? selectedResourceFile.data : null
    };

    try {
        const res = await apiRequest('/api/resources', {
            method: 'POST',
            body: payload
        });
        const data = await res.json();
        if (res.ok) {
            alert('✅ Resource published to Content Library successfully!');
            closeModal('modal-upload-resource');
            loadTrainerResources();
            loadLearningResources();
        } else {
            alert('Error: ' + (data.error || 'Failed to upload resource.'));
        }
    } catch (err) {
        alert('Network error: ' + err.message);
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

function openEditResourceModal(resourceId) {
    const resource = trainerLoadedResources.find(r => r.id === resourceId);
    if (!resource) return;

    document.getElementById('edit-res-id').value = resource.id;
    document.getElementById('edit-res-title').value = resource.title || '';
    document.getElementById('edit-res-status').value = resource.status || 'published';
    document.getElementById('edit-res-file-url').value = resource.file_url || '';
    document.getElementById('edit-res-description').value = resource.description || '';

    document.getElementById('modal-edit-resource').style.display = 'flex';
}

async function handleEditResourceSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('edit-res-id').value;
    const title = document.getElementById('edit-res-title').value.trim();
    const status = document.getElementById('edit-res-status').value;
    const file_url = document.getElementById('edit-res-file-url').value.trim();
    const description = document.getElementById('edit-res-description').value.trim();

    try {
        const res = await apiRequest(`/api/resources/${id}`, {
            method: 'PUT',
            body: { title, status, file_url: file_url || null, description: description || null }
        });
        const data = await res.json();
        if (res.ok) {
            alert('✅ Changes saved successfully!');
            closeModal('modal-edit-resource');
            loadTrainerResources();
            loadLearningResources();
        } else {
            alert('Error: ' + data.error);
        }
    } catch (err) {
        alert('Network error: ' + err.message);
    }
}

async function toggleResourceStatus(resourceId, currentStatus) {
    const newStatus = currentStatus === 'published' ? 'draft' : 'published';
    try {
        const res = await apiRequest(`/api/resources/${resourceId}`, {
            method: 'PUT',
            body: { status: newStatus }
        });
        if (res.ok) {
            loadTrainerResources();
            loadLearningResources();
        } else {
            const data = await res.json();
            alert('Error: ' + data.error);
        }
    } catch (err) {
        alert('Network error: ' + err.message);
    }
}

async function deleteTrainerResource(resourceId) {
    if (!confirm('Are you sure you want to delete this resource from your Content Library?')) return;
    try {
        const res = await apiRequest(`/api/resources/${resourceId}`, { method: 'DELETE' });
        if (res.ok) {
            loadTrainerResources();
            loadLearningResources();
        } else {
            const data = await res.json();
            alert('Error: ' + data.error);
        }
    } catch (err) {
        alert('Network error: ' + err.message);
    }
}

function downloadResourceFile(resourceId) {
    const resource = (trainerLoadedResources.find(r => r.id === resourceId) || allLoadedResources.find(r => r.id === resourceId));
    if (!resource) return;

    if (resource.file_data && resource.file_data.startsWith('data:')) {
        const a = document.createElement('a');
        a.href = resource.file_data;
        a.download = resource.file_name || `${resource.title.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } else if (resource.file_url) {
        window.open(resource.file_url, '_blank', 'noopener,noreferrer');
    } else {
        alert('No downloadable file is attached to this resource.');
    }
}

// ==========================================================
// 12. ADMIN GOVERNANCE, 5 DASHBOARDS & PUBLISHING
// ==========================================================
async function loadAdminUsers(filter = 'pending') {
    const tbody = document.getElementById('admin-users-tbody');
    const alertBox = document.getElementById('admin-pending-alert');
    const countBadge = document.getElementById('admin-pending-count');

    try {
        const endpoint = filter === 'all' ? '/api/admin/users' : `/api/admin/users?status=${filter}`;
        const res = await apiRequest(endpoint);
        if (res.ok) {
            const data = await res.json();
            const users = data.users || [];

            const pendingCount = users.filter(u => u.status === 'pending').length;
            if (countBadge) countBadge.innerText = pendingCount;
            if (alertBox) alertBox.style.display = pendingCount > 0 ? 'flex' : 'none';

            if (users.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center">No user accounts found.</td></tr>';
                return;
            }

            tbody.innerHTML = users.map(u => {
                const userRole = u.user_role || u.role || 'trainee';
                // Build expanded detail info
                let detailHtml = '';
                if (userRole === 'trainee' && u.trainee_qualifications) {
                    const quals = Array.isArray(u.trainee_qualifications) ? u.trainee_qualifications : [];
                    if (quals.length > 0) {
                        detailHtml += `<div style="margin-top:4px; font-size:0.76rem; color:var(--hud-cyan);"><i class="fa-solid fa-graduation-cap"></i> ${quals.map(q => q.degree || q).join(', ')}</div>`;
                    }
                    const skills = Array.isArray(u.skills) ? u.skills : [];
                    if (skills.length > 0) {
                        detailHtml += `<div style="font-size:0.76rem; color:rgba(255,255,255,0.6);"><i class="fa-solid fa-star"></i> ${skills.map(s => s.name || s).slice(0, 3).join(', ')}</div>`;
                    }
                } else if (userRole === 'trainer' && u.trainer_bio) {
                    detailHtml += `<div style="margin-top:4px; font-size:0.76rem; color:rgba(255,255,255,0.6);">${u.trainer_bio.substring(0, 80)}${u.trainer_bio.length > 80 ? '...' : ''}</div>`;
                    const expertiseTags = Array.isArray(u.expertise_tags) ? u.expertise_tags : [];
                    if (expertiseTags.length > 0) {
                        detailHtml += `<div style="font-size:0.76rem; color:var(--hud-purple);"><i class="fa-solid fa-tags"></i> ${expertiseTags.slice(0,3).join(', ')}</div>`;
                    }
                }

                return `
                    <tr>
                        <td>
                            <div style="display:flex; align-items:center; gap:8px;">
                                <div style="width:32px; height:32px; border-radius:50%; background:linear-gradient(135deg, var(--hud-purple), var(--hud-cyan)); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.85rem; color:#fff; flex-shrink:0;">
                                    ${(u.username || u.email).charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <strong>${u.username}</strong><br>
                                    <span style="font-size:0.75rem; color:rgba(255,255,255,0.5);">${u.email}</span>
                                    ${u.age ? `<span style="font-size:0.75rem; color:var(--hud-cyan);"> · Age ${u.age} (${u.gender || 'N/A'})</span>` : ''}
                                    ${detailHtml}
                                </div>
                            </div>
                        </td>
                        <td><span class="badge role-${userRole}">${userRole.toUpperCase()}</span></td>
                        <td>
                            <strong>${u.institution || u.department || 'General'}</strong><br>
                            <span style="font-size:0.75rem; color:rgba(255,255,255,0.6);">${u.profession || u.designation || 'Member'}</span>
                        </td>
                        <td>
                            <span class="badge ${u.status === 'active' ? 'badge-success' : u.status === 'suspended' ? 'badge-danger' : 'badge-gold'}">
                                ${(u.status || 'pending').toUpperCase()}
                            </span>
                        </td>
                        <td>${new Date(u.created_at).toLocaleDateString()}</td>
                        <td>
                            <div style="display:flex; gap:6px; flex-wrap:wrap;">
                                <button class="btn-outline-sm" style="padding:4px 8px; font-size:0.75rem;" onclick='openUserDetailModal(${JSON.stringify(u).replace(/'/g, "&apos;")})'>
                                    <i class="fa-solid fa-eye"></i> Details
                                </button>
                                ${u.status === 'pending' ? `
                                    <button class="btn-success" style="padding:4px 10px; font-size:0.75rem; font-weight:700;" onclick="approveUser('${u.id}')">
                                        <i class="fa-solid fa-check"></i> Approve
                                    </button>
                                    <button class="btn-outline-sm text-danger" style="padding:4px 8px; font-size:0.75rem;" onclick="rejectUser('${u.id}')">
                                        <i class="fa-solid fa-xmark"></i> Reject
                                    </button>
                                ` : `
                                    <button class="btn-outline-sm" style="padding:4px 8px; font-size:0.75rem;" onclick="promptChangeRole('${u.id}', '${userRole}')">Role</button>
                                    <button class="btn-outline-sm text-danger" style="padding:4px 8px; font-size:0.75rem;" onclick="suspendUser('${u.id}', '${u.status}')">${u.status === 'suspended' ? 'Reinstate' : 'Suspend'}</button>
                                `}
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Error loading user records.</td></tr>';
    }
}

function filterAdminUsers(status, btnEl) {
    document.querySelectorAll('.user-filter-pills .filter-pill').forEach(p => p.classList.remove('active'));
    btnEl.classList.add('active');
    loadAdminUsers(status);
}

async function approveUser(userId) {
    try {
        const res = await apiRequest(`/api/admin/users/${userId}/approve`, { method: 'POST' });
        if (res.ok) {
            alert('User approved! Account is now active.');
            closeModal('modal-user-detail');
            loadAdminUsers('pending');
            loadHomeStats();
        }
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function rejectUser(userId) {
    if (confirm('Are you sure you want to reject this registration?')) {
        try {
            const res = await apiRequest(`/api/admin/users/${userId}/reject`, { method: 'POST' });
            if (res.ok) {
                alert('User registration rejected.');
                closeModal('modal-user-detail');
                loadAdminUsers('pending');
                loadHomeStats();
            }
        } catch (err) {
            alert('Error: ' + err.message);
        }
    }
}

async function suspendUser(userId, currentStatus) {
    const newStatus = currentStatus === 'suspended' ? 'active' : 'suspended';
    const actionName = newStatus === 'active' ? 'reinstate' : 'suspend';
    if (confirm(`Are you sure you want to ${actionName} this user account?`)) {
        try {
            const res = await apiRequest(`/api/admin/users/${userId}/status`, {
                method: 'POST',
                body: { status: newStatus }
            });
            if (res.ok) {
                alert(`User account has been ${newStatus === 'active' ? 'reinstated to active' : 'suspended'}!`);
                closeModal('modal-user-detail');
                loadAdminUsers('all');
            }
        } catch (err) {
            alert('Error updating status: ' + err.message);
        }
    }
}

async function promptChangeRole(userId, current) {
    const newRole = prompt(`Enter new role for user (trainee, trainer, admin):`, current);
    if (newRole && ['trainee', 'trainer', 'admin'].includes(newRole.toLowerCase())) {
        try {
            const res = await apiRequest(`/api/admin/users/${userId}/role`, {
                method: 'POST',
                body: { role: newRole.toLowerCase() }
            });
            if (res.ok) {
                alert(`Role updated to ${newRole}!`);
                closeModal('modal-user-detail');
                loadAdminUsers('all');
            }
        } catch (err) {
            alert('Error updating role: ' + err.message);
        }
    }
}

function openUserDetailModal(u) {
    const modal = document.getElementById('modal-user-detail');
    const titleEl = document.getElementById('modal-user-detail-title');
    const bodyEl = document.getElementById('modal-user-detail-body');
    const footerEl = document.getElementById('modal-user-detail-footer');

    const userRole = u.user_role || u.role || 'trainee';
    titleEl.innerHTML = `<i class="fa-solid fa-id-card"></i> ${u.username} — ${userRole.toUpperCase()} Details`;

    // Format Qualifications
    let qualsHtml = '<em>None listed</em>';
    const quals = Array.isArray(u.trainee_qualifications) ? u.trainee_qualifications : [];
    if (quals.length > 0) {
        qualsHtml = quals.map(q => `<div>• <strong>${q.degree || q}</strong> (${q.institution || 'N/A'} - ${q.year || ''})</div>`).join('');
    }

    // Format Skills
    let skillsHtml = '<em>None listed</em>';
    const skills = Array.isArray(u.skills) ? u.skills : [];
    if (skills.length > 0) {
        skillsHtml = skills.map(s => `<span class="badge badge-cyan" style="margin-right:4px;">${s.name || s} (${s.level || 'Intermediate'})</span>`).join('');
    }

    // Format Experience
    let expHtml = '<em>None listed</em>';
    const exps = Array.isArray(u.work_experience) ? u.work_experience : [];
    if (exps.length > 0) {
        expHtml = exps.map(e => `<div>• <strong>${e.role || ''}</strong> @ ${e.company || ''} (${e.duration || ''})</div>`).join('');
    }

    // Format Trainer tags
    let tagsHtml = '<em>None listed</em>';
    const tags = Array.isArray(u.expertise_tags) ? u.expertise_tags : [];
    if (tags.length > 0) {
        tagsHtml = tags.map(t => `<span class="badge badge-purple" style="margin-right:4px;">${t}</span>`).join('');
    }

    bodyEl.innerHTML = `
        <div style="display:grid; grid-template-columns: 120px 1fr; gap: 1.5rem; margin-bottom: 1.5rem; align-items: center;">
            <div style="width: 100px; height: 100px; border-radius: 50%; background: linear-gradient(135deg, var(--hud-purple), var(--hud-cyan)); display:flex; align-items:center; justify-content:center; font-size:2.5rem; font-weight:700; color:#fff;">
                ${(u.username || u.email).charAt(0).toUpperCase()}
            </div>
            <div>
                <div style="display:flex; gap:8px; align-items:center; margin-bottom:4px;">
                    <h2 style="margin:0; font-size:1.4rem; color:#fff;">${u.username}</h2>
                    <span class="badge role-${userRole}">${userRole.toUpperCase()}</span>
                    <span class="badge ${u.status === 'active' ? 'badge-success' : u.status === 'suspended' ? 'badge-danger' : 'badge-gold'}">${(u.status || 'pending').toUpperCase()}</span>
                </div>
                <div style="color:var(--hud-cyan); font-size:0.95rem; margin-bottom:4px;"><i class="fa-solid fa-envelope"></i> ${u.email}</div>
                <div style="font-size:0.85rem; color:rgba(255,255,255,0.7);">${u.institution || 'General'} · ${u.profession || 'Member'}</div>
            </div>
        </div>

        <div class="glass-panel" style="padding: 1.2rem; margin-bottom: 1rem;">
            <h4 style="color:#fff; margin-bottom:0.8rem;"><i class="fa-solid fa-circle-info"></i> Personal & Organizational Demographics</h4>
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; font-size: 0.88rem;">
                <div><span style="color:rgba(255,255,255,0.5);">Age:</span> <strong>${u.age || 'Not specified'}</strong></div>
                <div><span style="color:rgba(255,255,255,0.5);">Gender:</span> <strong>${u.gender ? u.gender.toUpperCase() : 'Not specified'}</strong></div>
                <div><span style="color:rgba(255,255,255,0.5);">Institution:</span> <strong>${u.institution || 'General'}</strong></div>
                <div><span style="color:rgba(255,255,255,0.5);">Department:</span> <strong>${u.department || 'General'}</strong></div>
                <div><span style="color:rgba(255,255,255,0.5);">Profession/Role:</span> <strong>${u.profession || u.designation || 'Member'}</strong></div>
                <div><span style="color:rgba(255,255,255,0.5);">Phone:</span> <strong>${u.phone || 'N/A'}</strong></div>
                <div><span style="color:rgba(255,255,255,0.5);">Registered On:</span> <strong>${new Date(u.created_at).toLocaleString()}</strong></div>
            </div>
        </div>

        ${userRole === 'trainee' ? `
            <div class="glass-panel" style="padding: 1.2rem; margin-bottom: 1rem;">
                <h4 style="color:var(--hud-cyan); margin-bottom:0.8rem;"><i class="fa-solid fa-graduation-cap"></i> Trainee Qualifications & Competencies</h4>
                <div style="font-size:0.85rem; line-height:1.6; display:flex; flex-direction:column; gap:8px;">
                    <div><strong>Academic Qualifications:</strong> ${qualsHtml}</div>
                    <div><strong>Verified Technical Skills:</strong> ${skillsHtml}</div>
                    <div><strong>Prior Work Experience:</strong> ${expHtml}</div>
                </div>
            </div>

            <!-- Course Enrollments & Progress -->
            <div class="glass-panel" style="padding: 1.2rem; margin-bottom: 1rem;">
                <h4 style="color:#7cf29a; margin-bottom:0.8rem;"><i class="fa-solid fa-book-open"></i> Enrolled Courses & Completion Progress</h4>
                ${(u.enrolled_courses_details && u.enrolled_courses_details.length > 0) ? `
                    <div style="display:flex; flex-direction:column; gap:8px;">
                        ${u.enrolled_courses_details.map(c => `
                            <div style="background:rgba(255,255,255,0.04); padding:8px 12px; border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
                                <div>
                                    <strong>${c.title}</strong> <span style="font-size:0.75rem; color:rgba(255,255,255,0.5);">(${c.subject})</span>
                                </div>
                                <div style="text-align:right;">
                                    <span class="badge ${c.progress_pct === 100 ? 'badge-success' : 'badge-cyan'}">${c.progress_pct}%</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : '<div style="font-size:0.85rem; color:rgba(255,255,255,0.6);">No course enrollments on record.</div>'}
            </div>

            <!-- Test Submissions & Marks -->
            <div class="glass-panel" style="padding: 1.2rem; margin-bottom: 1rem;">
                <h4 style="color:#ffd166; margin-bottom:0.8rem;"><i class="fa-solid fa-square-poll-vertical"></i> Assessment Test Scores & Marks</h4>
                ${(u.test_submissions_details && u.test_submissions_details.length > 0) ? `
                    <div style="display:flex; flex-direction:column; gap:8px;">
                        ${u.test_submissions_details.map(s => `
                            <div style="background:rgba(255,255,255,0.04); padding:8px 12px; border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
                                <div>
                                    <strong>${s.test_title}</strong> <span style="font-size:0.75rem; color:rgba(255,255,255,0.5);">(${s.subject})</span>
                                    <br><span style="font-size:0.72rem; color:rgba(255,255,255,0.4);">${new Date(s.submitted_at).toLocaleString()}</span>
                                </div>
                                <div style="text-align:right;">
                                    <span style="font-size:1.1rem; font-weight:700; color:${s.score_percentage >= 60 ? '#7cf29a' : '#ff758f'};">${s.score_percentage}%</span>
                                    <br><span class="badge ${s.is_passed ? 'badge-success' : 'badge-danger'}" style="font-size:0.68rem;">${s.is_passed ? 'PASSED' : 'FAILED'}</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : '<div style="font-size:0.85rem; color:rgba(255,255,255,0.6);">No assessment attempts submitted yet.</div>'}
            </div>
        ` : ''}

        ${userRole === 'trainer' ? `
            <div class="glass-panel" style="padding: 1.2rem; margin-bottom: 1rem;">
                <h4 style="color:var(--hud-purple); margin-bottom:0.8rem;"><i class="fa-solid fa-chalkboard-user"></i> Trainer Profile & Expertise</h4>
                <div style="font-size:0.85rem; line-height:1.6; display:flex; flex-direction:column; gap:8px;">
                    <div><strong>Teaching Domains:</strong> ${tagsHtml}</div>
                    <div><strong>Years of Experience:</strong> <strong>${u.experience_years || 5} Years</strong></div>
                    <div><strong>Authored Modules:</strong> <strong>${u.trainer_courses_count || 0} Courses</strong></div>
                    <div><strong>Biography:</strong> <p style="margin:4px 0 0; color:rgba(255,255,255,0.8);">${u.trainer_bio || 'Dedicated educator & domain specialist.'}</p></div>
                </div>
            </div>
        ` : ''}
    `;

    footerEl.innerHTML = `
        <button type="button" class="btn-outline-sm" onclick="closeModal('modal-user-detail')">Close</button>
        ${u.status === 'pending' ? `
            <button type="button" class="btn-success" onclick="approveUser('${u.id}')"><i class="fa-solid fa-check"></i> Approve Registration</button>
            <button type="button" class="btn-outline-sm text-danger" onclick="rejectUser('${u.id}')"><i class="fa-solid fa-xmark"></i> Reject</button>
        ` : `
            <button type="button" class="btn-outline-sm" onclick="promptChangeRole('${u.id}', '${userRole}')"><i class="fa-solid fa-users-gear"></i> Change Role</button>
            <button type="button" class="btn-outline-sm text-danger" onclick="suspendUser('${u.id}', '${u.status}')">${u.status === 'suspended' ? 'Reinstate' : 'Suspend'}</button>
        `}
    `;

    modal.style.display = 'flex';
}


// 5 Admin Dashboards
async function switchAdminDashboard(dashboardKey, btnEl) {
    if (btnEl) {
        document.querySelectorAll('#admin-dashboard-tabs .filter-pill').forEach(p => p.classList.remove('active'));
        btnEl.classList.add('active');
    }

    const display = document.getElementById('admin-dashboard-display');
    display.innerHTML = '<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i> Generating executive analytics...</div>';

    try {
        const res = await apiRequest(`/api/admin/dashboards/${dashboardKey}`);
        if (res.ok) {
            const data = await res.json();
            renderDashboardView(dashboardKey, data);
        }
    } catch (e) {
        display.innerHTML = '<div class="empty-state">Unable to load dashboard data.</div>';
    }
}

function renderDashboardView(key, data) {
    const display = document.getElementById('admin-dashboard-display');
    let title = '';
    let summaryHtml = '';

    if (key === 'courses') {
        title = 'Course Portfolio & Subject Popularity Analytics';
        const sum = data.summary || {};
        summaryHtml = `
            <div class="dashboard-stats-grid">
                <div class="glass-card stat-metric-card"><div class="stat-chip-num" style="color:var(--hud-cyan);">${sum.total || 0}</div><div class="stat-chip-lbl">Total Courses</div></div>
                <div class="glass-card stat-metric-card"><div class="stat-chip-num" style="color:#7cf29a;">${sum.published || 0}</div><div class="stat-chip-lbl">Published</div></div>
                <div class="glass-card stat-metric-card"><div class="stat-chip-num" style="color:#ffd166;">${sum.draft || 0}</div><div class="stat-chip-lbl">Draft / Review</div></div>
            </div>
        `;
    } else if (key === 'enrollments') {
        title = 'Enrollments & Department Participation Analytics';
        const sum = data.summary || {};
        summaryHtml = `
            <div class="dashboard-stats-grid">
                <div class="glass-card stat-metric-card"><div class="stat-chip-num" style="color:var(--hud-cyan);">${sum.total || 0}</div><div class="stat-chip-lbl">Total Enrollments</div></div>
                <div class="glass-card stat-metric-card"><div class="stat-chip-num" style="color:#7cf29a;">${sum.completed || 0}</div><div class="stat-chip-lbl">Completions</div></div>
                <div class="glass-card stat-metric-card"><div class="stat-chip-num" style="color:#ffd166;">${sum.in_progress || 0}</div><div class="stat-chip-lbl">In Progress</div></div>
            </div>
        `;
    } else if (key === 'certifications') {
        title = 'Credentialing & Certification Issuance Analytics';
        const sum = data.summary || {};
        summaryHtml = `
            <div class="dashboard-stats-grid">
                <div class="glass-card stat-metric-card"><div class="stat-chip-num" style="color:#7cf29a;">${sum.total_issued || 0}</div><div class="stat-chip-lbl">Total Certificates Issued</div></div>
                <div class="glass-card stat-metric-card"><div class="stat-chip-num" style="color:var(--hud-purple);">${(data.by_course || []).length}</div><div class="stat-chip-lbl">Certified Courses</div></div>
            </div>
        `;
    } else if (key === 'assessments') {
        title = 'Assessment Performance & Score Distribution';
        const sum = data.summary || {};
        summaryHtml = `
            <div class="dashboard-stats-grid">
                <div class="glass-card stat-metric-card"><div class="stat-chip-num" style="color:var(--hud-cyan);">${sum.total_attempts || 0}</div><div class="stat-chip-lbl">Total Attempts</div></div>
                <div class="glass-card stat-metric-card"><div class="stat-chip-num" style="color:#7cf29a;">${sum.average_score || 0}%</div><div class="stat-chip-lbl">Average Score</div></div>
                <div class="glass-card stat-metric-card"><div class="stat-chip-num" style="color:#ffd166;">${sum.pass_rate || 0}%</div><div class="stat-chip-lbl">Pass Rate</div></div>
            </div>
        `;
    } else if (key === 'participation') {
        title = 'Active Trainee Engagement & Department Heatmap';
        const sum = data.summary || {};
        summaryHtml = `
            <div class="dashboard-stats-grid">
                <div class="glass-card stat-metric-card"><div class="stat-chip-num" style="color:var(--hud-cyan);">${sum.total_active || 0}</div><div class="stat-chip-lbl">Active Users</div></div>
                <div class="glass-card stat-metric-card"><div class="stat-chip-num" style="color:var(--hud-purple);">${sum.active_trainees || 0}</div><div class="stat-chip-lbl">Active Trainees</div></div>
                <div class="glass-card stat-metric-card"><div class="stat-chip-num" style="color:#7cf29a;">${sum.active_trainers || 0}</div><div class="stat-chip-lbl">Active Trainers</div></div>
                <div class="glass-card stat-metric-card"><div class="stat-chip-num" style="color:#ffd166;">${sum.pending_approvals || 0}</div><div class="stat-chip-lbl">Pending Approvals</div></div>
            </div>
        `;
    }

    display.innerHTML = `
        <div class="glass-panel" style="padding:1.8rem; border-radius:20px;">
            <div class="section-header-flex">
                <h3 style="color:#fff;"><i class="fa-solid fa-chart-line" style="color:var(--hud-cyan);"></i> ${title}</h3>
            </div>
            ${summaryHtml}
            <div style="margin-top:2rem; height:320px; position:relative;">
                <canvas id="dashboard-canvas"></canvas>
            </div>
        </div>
    `;

    // Render interactive chart with Chart.js
    renderChartJS(key, data);
}

function renderChartJS(key, data) {
    const canvas = document.getElementById('dashboard-canvas');
    if (!canvas) return;

    if (activeDashboardChart) {
        activeDashboardChart.destroy();
    }

    let labels = [];
    let values = [];
    let label = '';
    let chartType = 'bar';

    if (key === 'courses' && data.courses) {
        labels = data.courses.map(c => c.title.substring(0, 20) + (c.title.length > 20 ? '...' : ''));
        values = data.courses.map(c => parseInt(c.enrollments_count || 0));
        label = 'Enrollments per Course';
    } else if (key === 'enrollments' && data.departments) {
        labels = data.departments.map(d => d.department || 'General');
        values = data.departments.map(d => parseInt(d.count || 0));
        label = 'Enrollments by Department';
    } else if (key === 'certifications' && data.by_course) {
        labels = data.by_course.map(c => c.course_title.substring(0, 20));
        values = data.by_course.map(c => parseInt(c.certs_issued || 0));
        label = 'Certificates Issued';
    } else if (key === 'assessments' && data.by_subject) {
        labels = data.by_subject.map(s => s.subject);
        values = data.by_subject.map(s => parseFloat(s.avg_score || 0));
        label = 'Avg Assessment Score (%)';
    } else if (key === 'participation' && data.summary) {
        labels = ['Active Trainees', 'Active Trainers', 'Pending Approvals'];
        values = [data.summary.active_trainees || 0, data.summary.active_trainers || 0, data.summary.pending_approvals || 0];
        label = 'Users Count';
        chartType = 'doughnut';
    }

    activeDashboardChart = new Chart(canvas, {
        type: chartType,
        data: {
            labels: labels,
            datasets: [{
                label: label,
                data: values,
                backgroundColor: chartType === 'doughnut'
                    ? ['rgba(0, 242, 255, 0.6)', 'rgba(157, 0, 255, 0.6)', 'rgba(255, 209, 102, 0.6)']
                    : 'rgba(0, 242, 255, 0.4)',
                borderColor: chartType === 'doughnut'
                    ? ['#00f2ff', '#9d00ff', '#ffd166']
                    : '#00f2ff',
                borderWidth: 2,
                borderRadius: chartType === 'bar' ? 8 : 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#fff' }, display: chartType === 'doughnut' }
            },
            scales: chartType === 'doughnut' ? {} : {
                x: { ticks: { color: 'rgba(255,255,255,0.7)' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { ticks: { color: 'rgba(255,255,255,0.7)' }, grid: { color: 'rgba(255,255,255,0.05)' } }
            }
        }
    });
}

// Admin Publisher
async function loadAdminPosts() {
    const list = document.getElementById('admin-posts-list');
    if (!list) return;
    list.innerHTML = '<div style="text-align:center; color:rgba(255,255,255,0.4); padding:1rem;"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>';

    try {
        const res = await apiRequest('/api/homepage/feed');
        if (res.ok) {
            const data = await res.json();
            const posts = data.posts || [];
            if (posts.length === 0) {
                list.innerHTML = `
                    <div style="text-align:center; padding:2.5rem 1rem;">
                        <i class="fa-solid fa-bullhorn" style="font-size:2.5rem; color:rgba(255,255,255,0.12); display:block; margin-bottom:12px;"></i>
                        <div style="color:rgba(255,255,255,0.4);">No announcements posted yet.</div>
                        <div style="color:rgba(255,255,255,0.25); font-size:0.8rem; margin-top:4px;">Click &ldquo;Post New Announcement&rdquo; to publish your first one.</div>
                    </div>`;
                return;
            }

            list.innerHTML = posts.map(p => {
                const isHigh = p.priority === 'high';
                const audience = p.target_role ? `<span style="font-size:0.72rem; padding:2px 8px; border-radius:20px; background:rgba(0,242,255,0.12); color:#00f2ff;">${p.target_role} only</span>` : '<span style="font-size:0.72rem; color:rgba(255,255,255,0.4);">everyone</span>';
                const expiresNote = p.expires_at ? `<span style="color:#ffd166; font-size:0.72rem;"><i class="fa-solid fa-clock" style="margin-right:3px;"></i>Expires ${new Date(p.expires_at).toLocaleDateString()}</span>` : '';
                return `
                <div class="glass-card" style="padding:1.2rem 1.4rem; margin-bottom:1rem; ${isHigh ? 'border-left:3px solid #ff5252;' : 'border-left:3px solid rgba(255,255,255,0.1);'}">
                    <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px;">
                        <div style="flex:1; min-width:0;">
                            <div style="display:flex; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
                                ${isHigh ? '<span style="font-size:0.72rem; padding:2px 8px; border-radius:20px; background:rgba(255,82,82,0.15); color:#ff5252;">📌 HIGH PRIORITY</span>' : ''}
                                <span style="font-size:0.72rem; color:rgba(255,255,255,0.45);">${new Date(p.created_at).toLocaleString('en-IN', {day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</span>
                                ${audience}
                                ${expiresNote}
                            </div>
                            <div style="font-weight:700; color:#fff; font-size:1rem; margin-bottom:6px;">${p.title}</div>
                            <div style="font-size:0.85rem; color:rgba(255,255,255,0.7); line-height:1.6; white-space:pre-wrap;">${p.content}</div>
                        </div>
                        <button onclick="deleteAnnouncement('${p.id}')"
                            style="flex-shrink:0; background:rgba(255,82,82,0.12); border:1px solid rgba(255,82,82,0.3); color:#ff7070; padding:6px 12px; border-radius:8px; cursor:pointer; font-size:0.78rem; white-space:nowrap; transition:all 0.2s;"
                            onmouseover="this.style.background='rgba(255,82,82,0.25)'"
                            onmouseout="this.style.background='rgba(255,82,82,0.12)'">
                            <i class="fa-solid fa-trash"></i> Delete
                        </button>
                    </div>
                </div>`;
            }).join('');
        }
    } catch (e) {
        list.innerHTML = '<div class="empty-state">Unable to load announcements.</div>';
    }
}

async function deleteAnnouncement(postId) {
    if (!confirm('Delete this announcement? It will immediately disappear from all users\' feeds.')) return;
    try {
        const res = await apiRequest(`/api/admin/homepage/posts/${postId}`, { method: 'DELETE' });
        if (res.ok) {
            loadAdminPosts();
            loadHomeFeed();
        } else {
            const d = await res.json();
            alert('Error: ' + (d.error || 'Failed to delete'));
        }
    } catch (err) {
        alert('Network error: ' + err.message);
    }
}

function openCreatePostModal() {
    document.getElementById('modal-create-post').style.display = 'flex';
    // Reset form
    document.getElementById('post-title').value = '';
    document.getElementById('post-content').value = '';
    document.getElementById('post-priority').value = 'normal';
    const targetEl = document.getElementById('post-target-role');
    if (targetEl) targetEl.value = '';
    const expiresEl = document.getElementById('post-expires-at');
    if (expiresEl) expiresEl.value = '';
    const statusEl = document.getElementById('announcement-post-status');
    if (statusEl) statusEl.style.display = 'none';
    const btn = document.getElementById('btn-publish-announcement');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Post Announcement'; }
}

async function handleCreatePostSubmit(e) {
    e.preventDefault();
    const title = document.getElementById('post-title').value.trim();
    const content = document.getElementById('post-content').value.trim();
    const priority = document.getElementById('post-priority').value;
    const targetRoleEl = document.getElementById('post-target-role');
    const expiresEl = document.getElementById('post-expires-at');
    const statusEl = document.getElementById('announcement-post-status');
    const btn = document.getElementById('btn-publish-announcement');

    const target_role = targetRoleEl ? (targetRoleEl.value || null) : null;
    const expires_at = expiresEl && expiresEl.value ? new Date(expiresEl.value).toISOString() : null;

    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Posting...'; }

    const showStatus = (msg, ok) => {
        if (!statusEl) return;
        statusEl.style.display = 'block';
        statusEl.style.background = ok ? 'rgba(124,242,154,0.12)' : 'rgba(255,82,82,0.12)';
        statusEl.style.border = ok ? '1px solid rgba(124,242,154,0.3)' : '1px solid rgba(255,82,82,0.3)';
        statusEl.style.color = ok ? '#7cf29a' : '#ff7070';
        statusEl.innerHTML = ok ? `<i class="fa-solid fa-circle-check"></i> ${msg}` : `<i class="fa-solid fa-circle-exclamation"></i> ${msg}`;
    };

    try {
        const res = await apiRequest('/api/admin/homepage/publish', {
            method: 'POST',
            body: { title, type: 'announcement', priority, content, target_role, expires_at }
        });
        const data = await res.json();
        if (res.ok) {
            showStatus('Announcement posted successfully! All users will see it now.', true);
            loadAdminPosts();
            loadHomeFeed();
            setTimeout(() => closeModal('modal-create-post'), 1800);
        } else {
            showStatus(data.error || 'Failed to post announcement', false);
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Post Announcement'; }
        }
    } catch (err) {
        showStatus('Network error: ' + err.message, false);
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Post Announcement'; }
    }
}

// Competency Mapping
async function loadCompetencyMatrix() {
    const container = document.getElementById('competency-matrix-container');
    if (!container) return;

    try {
        const res = await apiRequest('/api/competency-map');
        if (res.ok) {
            const data = await res.json();
            const matrix = data.matrix || [];

            if (matrix.length === 0) {
                container.innerHTML = '<div class="empty-state">No competency data available.</div>';
                return;
            }

            container.innerHTML = `
                <div class="table-responsive">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Subject Taxonomy</th>
                                <th>Domain Category</th>
                                <th>Qualified Domain Trainers</th>
                                <th>Available Trainers</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${matrix.map(m => {
                                const subjectName = m.subject ? m.subject.name : (m.subject_name || 'Subject');
                                const categoryName = m.subject ? m.subject.category : (m.category || 'Technical');
                                const trainers = m.trainers || [];
                                const count = m.qualified_trainers_count !== undefined ? m.qualified_trainers_count : trainers.length;
                                return `
                                    <tr>
                                        <td><strong style="color:#fff; font-size:0.95rem;">${subjectName}</strong></td>
                                        <td><span class="badge badge-purple">${categoryName}</span></td>
                                        <td>
                                            ${trainers.length > 0 ? `
                                                <div style="display:flex; flex-direction:column; gap:6px;">
                                                    ${trainers.map(t => `
                                                        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                                                            <span style="font-size:0.85rem; color:#fff;">• <strong>${t.name}</strong> (${t.experience_years || 5}y exp · ${t.department || categoryName})</span>
                                                            ${t.status === 'pending' ? '<span class="badge badge-gold" style="font-size:0.68rem; padding:1px 6px;">Pending Approval</span>' : ''}
                                                        </div>
                                                    `).join('')}
                                                </div>
                                            ` : '<span style="color:rgba(255,255,255,0.4); font-style:italic;">No assigned trainer</span>'}
                                        </td>
                                        <td><strong style="color:var(--hud-cyan, #00f2ff); font-size:0.95rem;">${count}</strong> Trainer${count !== 1 ? 's' : ''}</td>
                                        <td>
                                            <span class="badge ${count > 0 ? 'badge-success' : 'badge-gold'}">
                                                ${count > 0 ? '<i class="fa-solid fa-circle-check"></i> Active Coverage' : '<i class="fa-solid fa-triangle-exclamation"></i> Coverage Needed'}
                                            </span>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }
    } catch (e) {
        container.innerHTML = '<div class="empty-state">Unable to compute competency matrix.</div>';
    }
}

// Generic Modal Closer
function closeModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.style.display = 'none';
}
