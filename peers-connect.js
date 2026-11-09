/**
 * EduPeers - Peers Connect Client Logic
 * Fully functional real-time academic networking, messaging, and resource vault
 */

document.addEventListener('DOMContentLoaded', () => {
    // 1. User Session & Authentication Setup
    let storedUser = {};
    try {
        storedUser = JSON.parse(localStorage.getItem('edupeers_user') || '{}');
    } catch (e) {}

    const currentUser = localStorage.getItem('edupeers_username') || storedUser.username || '';
    if (!currentUser) {
        window.location.href = 'login.html';
        return;
    }

    const currentRole = localStorage.getItem('edupeers_role') || storedUser.role || 'trainee';
    const currentId = localStorage.getItem('edupeers_id') || storedUser.id || '';
    const currentEmail = localStorage.getItem('edupeers_email') || storedUser.email || '';
    const currentInstitution = localStorage.getItem('edupeers_institution') || storedUser.department || 'General';
    const currentProfession = localStorage.getItem('edupeers_profession') || storedUser.designation || '';
    const currentAvatar = localStorage.getItem('edupeers_photo') || storedUser.photo_url || storedUser.avatar || '';
    const authToken = localStorage.getItem('edupeers_token') || localStorage.getItem('edupeers_auth_token') || localStorage.getItem('auth_token') || '';

    // Update Header Profile Info
    const topName = document.getElementById('topbar-user-name');
    const topAvatar = document.getElementById('topbar-avatar');
    if (topName) topName.innerText = currentUser;
    if (topAvatar) {
        if (currentAvatar && currentAvatar.length > 10) {
            topAvatar.innerHTML = `<img src="${currentAvatar}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
        } else {
            topAvatar.innerText = currentUser.charAt(0).toUpperCase() || 'U';
        }
    }

    // Authenticated API Fetch Helper
    async function apiFetch(endpoint, options = {}) {
        options.headers = options.headers || {};
        if (authToken) {
            options.headers['Authorization'] = `Bearer ${authToken}`;
        }
        options.credentials = 'include';

        if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(options.body);
        }

        const res = await fetch(endpoint, options);
        if (res.status === 401 || res.status === 403) {
            const data = await res.clone().json().catch(() => ({}));
            if (data.error && data.error.includes('expired')) {
                showAppToast('Session expired. Please log in again.');
                setTimeout(() => { window.location.href = 'login.html'; }, 1500);
            }
        }
        return res;
    }

    // DOM Elements
    function requireElement(id, ElementType) {
        const element = document.getElementById(id);
        if (!(element instanceof ElementType)) {
            throw new Error(`Peers Connect: Missing required element "${id}".`);
        }
        return element;
    }

    const peerDirectory = new Map();
    const peerListContainer = requireElement('peer-list-container', HTMLDivElement);
    const onlineCountDisplay = requireElement('stats-online-count', HTMLElement);
    const tabButtons = Array.from(document.querySelectorAll('button.tab-btn'));
    const reqCountBadge = requireElement('req-count', HTMLElement);
    const searchInput = requireElement('peer-search', HTMLInputElement);
    const peerSectionTitle = requireElement('peer-section-title', HTMLElement);
    const peerSectionCopy = requireElement('peer-section-copy', HTMLElement);

    let activeTab = 'discover';
    let onlinePeers = [];
    let ws = null;
    let currentChatRecipient = null; // Username
    let currentChatRecipientId = null; // UUID
    let pendingRequests = new Set();
    let recipientAvatarData = '?';

    const chatOverlay = requireElement('chat-overlay', HTMLDivElement);
    const chatHeaderName = requireElement('chat-with-name', HTMLElement);
    const chatHeaderMeta = requireElement('chat-with-meta', HTMLElement);
    const chatHeaderAvatar = requireElement('chat-with-avatar', HTMLDivElement);
    const chatMessagesContainer = requireElement('chat-messages', HTMLDivElement);
    const chatInput = requireElement('chat-msg-input', HTMLInputElement);
    const chatSendBtn = requireElement('chat-send-btn', HTMLButtonElement);
    const closeChatBtn = requireElement('close-chat', HTMLButtonElement);

    function getPeerKey(value) {
        return String(value || '').trim().toLowerCase();
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function normalizePeer(peer = {}) {
        return {
            id: peer.id || '',
            connectionStatus: peer.connectionStatus || 'none',
            username: String(peer.username || peer.from || '').trim(),
            avatar: peer.avatar || '',
            role: peer.role === 'trainer' ? 'trainer' : (peer.role === 'admin' ? 'admin' : 'trainee'),
            institution: String(peer.institution || '').trim(),
            profession: String(peer.profession || '').trim(),
            status: peer.status || 'offline'
        };
    }

    function rememberPeer(peer) {
        const normalized = normalizePeer(peer);
        if (!normalized.username) return normalized;

        const key = getPeerKey(normalized.username);
        const existing = peerDirectory.get(key) || {};
        const merged = Object.assign({}, existing, normalized);
        peerDirectory.set(key, merged);
        return merged;
    }

    function rememberAndDedupePeers(peers = []) {
        const uniquePeers = new Map();
        peers.forEach((peer) => {
            const normalized = rememberPeer(peer);
            if (!normalized.username) return;
            uniquePeers.set(getPeerKey(normalized.username), normalized);
        });
        return Array.from(uniquePeers.values());
    }

    function formatRole(role) {
        if (role === 'trainer') return 'Trainer';
        if (role === 'admin') return 'Admin';
        return 'Trainee';
    }

    function getSearchTerm() {
        return searchInput instanceof HTMLInputElement ? searchInput.value.trim().toLowerCase() : '';
    }

    function setRequestsBadge(count) {
        if (!reqCountBadge) return;
        if (count > 0) {
            reqCountBadge.innerText = String(count);
            reqCountBadge.style.display = 'inline-flex';
        } else {
            reqCountBadge.innerText = '0';
            reqCountBadge.style.display = 'none';
        }
    }

    function matchesSearch(peer) {
        const query = getSearchTerm();
        if (!query) return true;

        return [
            peer.username,
            peer.institution,
            peer.profession,
            formatRole(peer.role)
        ].some((value) => String(value || '').toLowerCase().includes(query));
    }

    function setSectionIntro(title, copy) {
        if (peerSectionTitle) peerSectionTitle.innerText = title;
        if (peerSectionCopy) peerSectionCopy.innerText = copy;
    }

    function renderListState(iconClass, message, isLoading = false) {
        peerListContainer.innerHTML = `
            <div class="${isLoading ? 'connect-loading-state' : 'connect-empty-state'}">
                <i class="${escapeHtml(iconClass)}${isLoading ? ' fa-spin' : ''}"></i>
                <span>${escapeHtml(message)}</span>
            </div>
        `;
    }

    function buildPeerSummary(peer) {
        const normalized = normalizePeer(peer);
        const parts = [formatRole(normalized.role)];

        if (normalized.profession) {
            parts.push(normalized.profession);
        }
        if (normalized.institution) {
            parts.push(normalized.institution);
        }
        return parts.join(' • ');
    }

    function setAvatarContent(element, avatar, fallbackText) {
        if (!element) return;
        const safeFallback = fallbackText || '?';
        element.innerHTML = '';

        if (avatar && avatar.length > 10) {
            element.innerHTML = `<img src="${avatar}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
            return;
        }
        element.innerText = avatar && avatar.length < 5 ? avatar : safeFallback;
    }

    function createPeerCard(peer, options = {}) {
        const normalized = rememberPeer(peer);
        const card = document.createElement('div');
        card.className = 'peer-item';
        card.innerHTML = `
            <span class="peer-status ${normalized.status === 'online' ? 'status-online' : 'status-away'}"></span>
            <div class="peer-avatar"></div>
            <div class="peer-item-content">
                <div class="peer-item-name-row">
                    <div class="peer-item-name">${escapeHtml(normalized.username)}</div>
                    <span class="peer-role-pill">${escapeHtml(formatRole(normalized.role))}</span>
                </div>
                <div class="peer-item-summary">${escapeHtml(buildPeerSummary(normalized))}</div>
                ${options.secondaryLine ? `<div class="peer-item-note">${escapeHtml(options.secondaryLine)}</div>` : ''}
            </div>
            <div class="peer-item-actions"></div>
        `;

        setAvatarContent(
            card.querySelector('.peer-avatar'),
            normalized.avatar,
            normalized.username ? normalized.username.charAt(0).toUpperCase() : '?'
        );

        const actionsContainer = card.querySelector('.peer-item-actions');
        const actions = options.actions || [];

        actions.forEach((act) => {
            const btn = document.createElement('button');
            btn.className = 'connect-action-btn';
            if (act.style) btn.setAttribute('style', act.style);
            if (act.disabled) btn.disabled = true;
            btn.innerHTML = act.html || '';
            if (act.onClick && !act.disabled) {
                btn.addEventListener('click', () => act.onClick(normalized));
            }
            actionsContainer.appendChild(btn);
        });

        return card;
    }

    // 2. WebSocket Real-Time Nexus
    function initWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        try {
            ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                console.log('✅ Connected to EduPeers Presence Nexus');
                ws.send(JSON.stringify({
                    type: 'identify',
                    userId: currentId,
                    email: currentEmail,
                    username: currentUser,
                    avatar: currentAvatar,
                    role: currentRole,
                    institution: currentInstitution,
                    profession: currentProfession
                }));
            };

            ws.onmessage = (event) => {
                let data;
                try { data = JSON.parse(event.data); } catch (e) { return; }

                if (data.type === 'ping') return;

                if (data.type === 'presence_update') {
                    onlinePeers = rememberAndDedupePeers(data.peers || []);
                    render();
                } else if (data.type === 'new_resource') {
                    if (activeTab === 'resources') {
                        renderResources();
                    }
                    showAppToast(`New Resource shared by ${data.resource.author}!`);
                } else if (data.type === 'resource_deleted') {
                    if (activeTab === 'resources') {
                        renderResources();
                    }
                } else if (data.type === 'direct_message') {
                    if (currentChatRecipientId === data.fromId || getPeerKey(currentChatRecipient) === getPeerKey(data.from)) {
                        appendMessage(data.from, data.text, 'received', data.avatar, data.timestamp || new Date().toISOString());
                    } else {
                        showAppToast(`New message from ${data.from}`);
                    }
                } else if (data.type === 'request_received') {
                    showAppToast(`${data.from} sent you a connection request.`);
                    refreshRequestsBadge();
                    if (activeTab === 'requests') {
                        renderRequests();
                    } else if (activeTab === 'discover') {
                        renderDiscover();
                    }
                } else if (data.type === 'request_accepted') {
                    showAppToast(`${data.by} accepted your connection request!`);
                    pendingRequests.delete(getPeerKey(data.by));
                    refreshRequestsBadge();
                    render();
                } else if (data.type === 'request_rejected') {
                    showAppToast(`${data.by} declined your connection request.`);
                    pendingRequests.delete(getPeerKey(data.by));
                    refreshRequestsBadge();
                    if (activeTab === 'discover') {
                        renderDiscover();
                    }
                } else if (data.type === 'connection_removed') {
                    showAppToast(`${data.by} removed you from their network.`);
                    render();
                } else if (data.type === 'chat_error') {
                    showAppToast(data.message || 'Unable to send message.');
                }
            };

            ws.onclose = () => {
                console.log('WebSocket disconnected. Reconnecting in 4s...');
                setTimeout(initWebSocket, 4000);
            };

            ws.onerror = (err) => {
                console.warn('WebSocket error:', err);
            };
        } catch (e) {
            console.error('WebSocket Init Error:', e);
        }
    }

    // 3. Tab Routing & Render Engine
    async function render() {
        if (activeTab === 'discover') {
            await renderDiscover();
        } else if (activeTab === 'network') {
            await renderNetwork();
        } else if (activeTab === 'requests') {
            await renderRequests();
        } else if (activeTab === 'resources') {
            await renderResources();
        }
        updateStats();
    }

    // ── Discover Tab ─────────────────────────────────────
    async function renderDiscover() {
        setSectionIntro('Discover peers', 'Browse and connect with trainees and trainers active across EduPeers.');
        renderListState('fa-solid fa-spinner', 'Refreshing live peers...', true);

        try {
            const res = await apiFetch(`/api/peers/online?current=${encodeURIComponent(currentUser)}`);
            const data = await res.json();
            onlinePeers = rememberAndDedupePeers(data.peers || []);

            peerListContainer.innerHTML = '';
            const others = onlinePeers
                .filter((peer) => getPeerKey(peer.username) !== getPeerKey(currentUser))
                .filter(matchesSearch)
                .sort((left, right) => {
                    const leftOnline = left.status === 'online' ? 1 : 0;
                    const rightOnline = right.status === 'online' ? 1 : 0;
                    if (leftOnline !== rightOnline) {
                        return rightOnline - leftOnline;
                    }
                    return left.username.localeCompare(right.username);
                });

            if (others.length === 0) {
                renderListState(
                    'fa-solid fa-satellite-dish',
                    getSearchTerm() ? 'No peers match your search query.' : 'No other registered peers are available right now.'
                );
                updateStats();
                return;
            }

            const pendingIncoming = others.filter(p => p.connectionStatus === 'incoming_pending');
            const restOfPeers = others.filter(p => p.connectionStatus !== 'incoming_pending');

            const renderPeerWithActions = (peer) => {
                const isOutgoingPending = peer.connectionStatus === 'outgoing_pending' || pendingRequests.has(getPeerKey(peer.username));
                const isIncomingPending = peer.connectionStatus === 'incoming_pending';
                const isAccepted = peer.connectionStatus === 'accepted';

                const options = {
                    secondaryLine: peer.status === 'online' ? '🟢 Online now' : '⚪ Offline',
                    actions: []
                };

                if (isAccepted) {
                    options.actions.push({
                        html: '<i class="fa-solid fa-message"></i> Message',
                        style: 'background:rgba(0, 242, 255, 0.2); color:#00f2ff; border:1px solid rgba(0,242,255,0.4);',
                        onClick: () => openChat(peer.username)
                    });
                    options.secondaryLine = peer.status === 'online' ? '🟢 Connected & Online' : 'Connected peer';
                } else if (isIncomingPending) {
                    options.actions.push({
                        html: '<i class="fa-solid fa-check"></i> Accept',
                        style: 'background:rgba(0, 255, 136, 0.2); color:#00ff88; border:1px solid rgba(0,255,136,0.4);',
                        onClick: () => acceptRequest(peer.username)
                    });
                    options.actions.push({
                        html: '<i class="fa-solid fa-xmark"></i> Decline',
                        style: 'background:rgba(255, 70, 70, 0.2); color:#ff6b6b; border:1px solid rgba(255,70,70,0.4);',
                        onClick: () => rejectRequest(peer.username)
                    });
                    options.secondaryLine = 'Sent you a connection request';
                } else if (isOutgoingPending) {
                    options.actions.push({
                        html: '<i class="fa-solid fa-clock"></i> Pending',
                        style: 'background:rgba(255,255,255,0.1); color:rgba(255,255,255,0.6);',
                        disabled: true
                    });
                    options.secondaryLine = 'Connection request pending approval';
                } else {
                    options.actions.push({
                        html: '<i class="fa-solid fa-user-plus"></i> Connect',
                        onClick: () => sendConnectRequest(peer.username)
                    });
                }
                return createPeerCard(peer, options);
            };

            if (pendingIncoming.length > 0) {
                const head = document.createElement('div');
                head.className = 'category-label';
                head.innerHTML = '<i class="fa-solid fa-bell"></i> Incoming Requests';
                peerListContainer.appendChild(head);
                pendingIncoming.forEach(p => peerListContainer.appendChild(renderPeerWithActions(p)));
            }

            if (restOfPeers.length > 0) {
                const head = document.createElement('div');
                head.className = 'category-label';
                head.innerHTML = '<i class="fa-solid fa-globe"></i> Global Directory';
                peerListContainer.appendChild(head);
                restOfPeers.forEach(p => peerListContainer.appendChild(renderPeerWithActions(p)));
            }

            updateStats();
        } catch (error) {
            console.error(error);
            renderListState('fa-solid fa-triangle-exclamation', 'Unable to load the peer directory.');
            updateStats();
        }
    }

    // ── My Network Tab ───────────────────────────────────
    async function renderNetwork() {
        setSectionIntro('My network', 'Manage peers and colleagues you are connected with.');
        renderListState('fa-solid fa-spinner', 'Loading your network...', true);

        try {
            const res = await apiFetch(`/api/peers/my-network/${encodeURIComponent(currentUser)}`);
            const data = await res.json();
            const network = (data.network || [])
                .map(rememberPeer)
                .filter(matchesSearch)
                .sort((left, right) => {
                    const leftOnline = left.status === 'online' ? 1 : 0;
                    const rightOnline = right.status === 'online' ? 1 : 0;
                    if (leftOnline !== rightOnline) {
                        return rightOnline - leftOnline;
                    }
                    return left.username.localeCompare(right.username);
                });

            peerListContainer.innerHTML = '';
            if (network.length === 0) {
                renderListState(
                    'fa-solid fa-user-group',
                    getSearchTerm() ? 'No connected peers match your search.' : 'You have not connected with any peers yet. Explore Discover to connect!'
                );
                return;
            }

            network.forEach((peer) => {
                peerListContainer.appendChild(createPeerCard(peer, {
                    actions: [
                        {
                            html: '<i class="fa-solid fa-message"></i> Message',
                            style: 'background: rgba(0, 242, 255, 0.2); color: #00f2ff; border: 1px solid rgba(0,242,255,0.4);',
                            onClick: () => openChat(peer.username)
                        },
                        {
                            html: '<i class="fa-solid fa-user-minus"></i> Remove',
                            style: 'background: rgba(255, 70, 70, 0.16); color: #ff8b8b; border: 1px solid rgba(255,70,70,0.3);',
                            onClick: () => disconnectPeer(peer.username)
                        }
                    ],
                    secondaryLine: peer.status === 'online' ? '🟢 Online now' : '⚪ Offline'
                }));
            });
        } catch (error) {
            console.error(error);
            renderListState('fa-solid fa-triangle-exclamation', 'Unable to load your network.');
        }
    }

    // ── Requests Tab ─────────────────────────────────────
    async function renderRequests() {
        setSectionIntro('Connection requests', 'Review incoming peer requests and grow your collaborative network.');
        renderListState('fa-solid fa-spinner', 'Loading requests...', true);

        try {
            const res = await apiFetch(`/api/peers/requests/${encodeURIComponent(currentUser)}`);
            const data = await res.json();
            const requests = (data.requests || []).map((request) => rememberPeer({
                username: request.from,
                avatar: request.avatar,
                role: request.role,
                institution: request.institution,
                profession: request.profession,
                status: request.status
            })).filter(matchesSearch);

            peerListContainer.innerHTML = '';
            if (requests.length === 0) {
                renderListState(
                    'fa-solid fa-inbox',
                    getSearchTerm() ? 'No requests match your search.' : 'No pending connection requests.'
                );
                setRequestsBadge(0);
                return;
            }

            setRequestsBadge(requests.length);

            requests.forEach((requestPeer) => {
                const options = {
                    secondaryLine: 'Wants to connect with you',
                    actions: [
                        {
                            html: '<i class="fa-solid fa-check"></i> Accept',
                            style: 'background: rgba(0, 255, 136, 0.2); color: #00ff88; border: 1px solid rgba(0,255,136,0.4);',
                            onClick: () => acceptRequest(requestPeer.username)
                        },
                        {
                            html: '<i class="fa-solid fa-xmark"></i> Decline',
                            style: 'background: rgba(255, 70, 70, 0.2); color: #ff6b6b; border: 1px solid rgba(255,70,70,0.4);',
                            onClick: () => rejectRequest(requestPeer.username)
                        }
                    ]
                };
                peerListContainer.appendChild(createPeerCard(requestPeer, options));
            });
        } catch (error) {
            console.error(error);
            renderListState('fa-solid fa-triangle-exclamation', 'Unable to load requests.');
        }
    }

    // ── Resources Vault Tab ──────────────────────────────
    async function renderResources() {
        setSectionIntro('Study Resource Vault', 'Browse and share learning materials and documents with the entire EduPeers network.');
        peerListContainer.innerHTML = `
            <div class="glass-panel" style="padding: 1.5rem; background: rgba(255,255,255,0.04); border-radius:18px; margin-bottom: 2rem;">
                <div style="font-weight: 700; margin-bottom: 1rem; color: var(--hud-cyan); font-size:1.05rem;">
                    <i class="fa-solid fa-cloud-arrow-up"></i> Share a New Resource
                </div>
                <input type="text" id="res-title" class="auth-input" placeholder="Resource title (e.g. System Design Notes / VLSI Slides)" style="background: rgba(0,0,0,0.3); margin-bottom: 0.75rem;">
                <textarea id="res-content" class="auth-input" placeholder="Briefly describe what this resource covers..." style="background: rgba(0,0,0,0.3); height: 80px; margin-bottom: 0.75rem; resize:vertical;"></textarea>
                
                <div style="margin-bottom: 1.25rem;">
                    <label for="res-file" style="display: block; font-size: 0.8rem; color: rgba(255,255,255,0.6); margin-bottom: 0.5rem; font-weight:600;">
                        <i class="fa-solid fa-paperclip"></i> ATTACH DOCUMENT (PDF, PPT, DOC, TXT, ETC — MAX 10MB)
                    </label>
                    <input type="file" id="res-file" class="auth-input" style="background: rgba(255, 255, 255, 0.05); cursor: pointer; padding: 0.6rem; font-size: 0.85rem;">
                </div>

                <button class="btn-primary" id="btn-share-res" style="width: 100%; justify-content: center; padding:0.8rem; font-size:0.95rem;">
                    <i class="fa-solid fa-share-nodes"></i> Publish to Network Vault
                </button>
            </div>
            <div id="resources-feed" style="display: flex; flex-direction: column; gap: 1.5rem;">
                <div style="text-align: center; color: rgba(255,255,255,0.4); padding: 2rem;">
                    <i class="fa-solid fa-spinner fa-spin"></i> Loading vault resources...
                </div>
            </div>
        `;

        const shareBtn = document.getElementById('btn-share-res');
        if (shareBtn) shareBtn.onclick = shareResource;

        try {
            const res = await apiFetch('/api/peer-resources');
            const data = await res.json();
            const feed = document.getElementById('resources-feed');
            if (!feed) return;

            if (!data.resources || data.resources.length === 0) {
                feed.innerHTML = `
                    <div style="text-align: center; color: rgba(255,255,255,0.4); padding: 4rem 2rem;">
                        <i class="fa-solid fa-box-open" style="font-size: 3rem; margin-bottom: 1rem; color:rgba(255,255,255,0.2);"></i>
                        <div style="font-size:1.1rem; font-weight:600; color:rgba(255,255,255,0.7);">The vault is empty</div>
                        <div style="font-size:0.85rem; margin-top:4px;">Be the first to share notes or guides with the community!</div>
                    </div>`;
                return;
            }

            feed.innerHTML = '';
            data.resources.forEach((item) => {
                const div = document.createElement('div');
                div.className = 'resource-card';
                const authorName = String(item.author || 'Unknown');
                const hasFile = item.file_data && item.file_name;
                const isOwner = (item.authorId && currentId && item.authorId === currentId)
                    || getPeerKey(authorName) === getPeerKey(currentUser)
                    || currentRole === 'admin';

                const fileTypeIcon = item.file_type?.includes('pdf') ? 'fa-file-pdf' :
                                   item.file_type?.includes('presentation') ? 'fa-file-powerpoint' :
                                   item.file_type?.includes('word') ? 'fa-file-word' : 'fa-file-lines';

                const fileLabel = hasFile
                    ? `<div style="font-size: 0.82rem; color: rgba(0,242,255,0.85); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 60%;">
                        <i class="fa-solid fa-paperclip"></i> ${escapeHtml(item.file_name)}
                       </div>`
                    : '<div style="font-size: 0.8rem; color: rgba(255,255,255,0.4);">Shared resource</div>';

                const actionsHtml = `
                    <div style="display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; justify-content: flex-end;">
                        ${hasFile ? `
                            <a href="${item.file_data}" download="${item.file_name}" class="connect-action-btn" style="text-decoration: none; background: rgba(0, 132, 255, 0.2); color: #40a9ff; font-size: 0.82rem; border: 1px solid rgba(0, 132, 255, 0.3);">
                                <i class="fa-solid fa-download"></i> Download
                            </a>
                        ` : ''}
                        ${isOwner ? `
                            <button type="button" class="connect-action-btn btn-delete-resource" data-resource-id="${escapeHtml(item.id)}" style="background: rgba(255, 70, 70, 0.16); color: #ff8b8b; font-size: 0.82rem; border: 1px solid rgba(255, 70, 70, 0.28);">
                                <i class="fa-solid fa-trash"></i> Delete
                            </button>
                        ` : ''}
                    </div>
                `;

                div.innerHTML = `
                    <div style="display: flex; align-items: center; width: 100%; margin-bottom: 1rem;">
                        <div class="peer-avatar" style="width: 38px; height: 38px; font-size: 0.95rem; margin-right: 0.85rem; background: rgba(255,255,255,0.1); color: #fff; border: 1px solid rgba(255,255,255,0.15);">
                            ${escapeHtml(authorName.charAt(0).toUpperCase() || '?')}
                        </div>
                        <div>
                            <div style="font-size: 0.98rem; font-weight: 600; color: white;">${escapeHtml(authorName)}</div>
                            <div style="font-size: 0.75rem; color: rgba(255,255,255,0.45);">${new Date(item.date).toLocaleDateString()} at ${new Date(item.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                        </div>
                    </div>
                    <div style="font-size: 1.15rem; font-weight: 700; color: #fff; margin-bottom: 0.6rem; display: flex; align-items: center; gap: 8px;">
                        ${escapeHtml(item.title)}
                        ${hasFile ? `<i class="fa-solid ${fileTypeIcon}" style="font-size: 0.9rem; color: var(--hud-cyan);"></i>` : ''}
                    </div>
                    <div style="font-size: 0.92rem; color: rgba(255,255,255,0.75); line-height: 1.6; margin-bottom: 1.25rem;">${escapeHtml(item.content)}</div>
                    
                    <div style="border-top: 1px solid rgba(255,255,255,0.06); padding-top: 1rem; display: flex; align-items: center; justify-content: space-between;">
                        ${fileLabel}
                        ${actionsHtml}
                    </div>
                `;

                const deleteBtn = div.querySelector('.btn-delete-resource');
                if (deleteBtn) {
                    deleteBtn.addEventListener('click', () => deleteResource(item.id));
                }

                feed.appendChild(div);
            });
        } catch (error) {
            console.error('Render Resources Error:', error);
        }
    }

    function updateStats() {
        const count = onlinePeers.filter((peer) => getPeerKey(peer.username) !== getPeerKey(currentUser) && peer.status === 'online').length;
        onlineCountDisplay.innerText = count < 10 ? `0${count}` : String(count);
    }

    async function refreshRequestsBadge() {
        try {
            const res = await apiFetch(`/api/peers/requests/${encodeURIComponent(currentUser)}`);
            const data = await res.json();
            setRequestsBadge((data.requests || []).length);
        } catch (error) {
            console.error('Request Badge Error:', error);
        }
    }

    // 4. Peer Connection Mutation Actions
    async function sendConnectRequest(target) {
        try {
            const res = await apiFetch('/api/peers/request', {
                method: 'POST',
                body: { from: currentUser, to: target }
            });
            const data = await res.json();

            if (!res.ok) {
                showAppToast(data.error || 'Could not send request.');
                return;
            }

            if (data.status === 'accepted') {
                pendingRequests.delete(getPeerKey(target));
            } else if (data.status === 'pending' || data.status === 'outgoing_pending') {
                pendingRequests.add(getPeerKey(target));
            }

            refreshRequestsBadge();
            renderDiscover();
            showAppToast(data.message || 'Request sent!');
        } catch (error) {
            console.error(error);
            showAppToast('Failed to connect.');
        }
    }

    async function acceptRequest(from) {
        try {
            const res = await apiFetch('/api/peers/accept', {
                method: 'POST',
                body: { from, to: currentUser }
            });
            const data = await res.json();

            if (!res.ok) {
                showAppToast(data.error || 'Could not accept request.');
                return;
            }

            showAppToast(data.message || 'Connected!');
            refreshRequestsBadge();
            render();
        } catch (error) {
            console.error(error);
            showAppToast('Failed to accept request.');
        }
    }

    async function rejectRequest(from) {
        try {
            const res = await apiFetch('/api/peers/reject', {
                method: 'POST',
                body: { from, to: currentUser }
            });
            const data = await res.json();

            if (!res.ok) {
                showAppToast(data.error || 'Could not decline request.');
                return;
            }

            showAppToast(data.message || 'Request declined');
            refreshRequestsBadge();
            render();
        } catch (error) {
            console.error(error);
        }
    }

    async function disconnectPeer(target) {
        const confirmed = window.confirm(`Remove ${target} from your network?`);
        if (!confirmed) return;

        try {
            const res = await apiFetch('/api/peers/disconnect', {
                method: 'POST',
                body: { from: currentUser, to: target }
            });
            const data = await res.json();
            if (!res.ok) {
                showAppToast(data.error || 'Could not remove peer.');
                return;
            }

            showAppToast(data.message || 'Peer removed.');
            render();
        } catch (error) {
            console.error('Disconnect Error:', error);
            showAppToast('Failed to remove peer.');
        }
    }

    // 5. Study Resource Vault Sharing & Deletion
    async function shareResource() {
        const titleInput = requireElement('res-title', HTMLInputElement);
        const contentInput = requireElement('res-content', HTMLTextAreaElement);
        const fileInput = requireElement('res-file', HTMLInputElement);

        const title = titleInput.value.trim();
        const content = contentInput.value.trim();
        const file = fileInput.files?.[0];

        if (!title || !content) {
            showAppToast('Please fill in both title and description.');
            return;
        }

        const shareBtn = document.getElementById('btn-share-res');
        if (shareBtn) shareBtn.disabled = true;

        try {
            let filePayload = null;
            if (file) {
                if (file.size > 10 * 1024 * 1024) {
                    showAppToast('File exceeds 10MB size limit.');
                    if (shareBtn) shareBtn.disabled = false;
                    return;
                }

                filePayload = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve({
                        name: file.name,
                        type: file.type,
                        data: reader.result
                    });
                    reader.readAsDataURL(file);
                });
            }

            const res = await apiFetch('/api/peer-resources/share', {
                method: 'POST',
                body: { title, content, file: filePayload }
            });

            if (res.ok) {
                titleInput.value = '';
                contentInput.value = '';
                fileInput.value = '';
                await renderResources();
                showAppToast('Resource published globally to the Vault!');
            } else {
                const err = await res.json();
                showAppToast(err.error || 'Failed to share resource.');
            }
        } catch (error) {
            console.error(error);
            showAppToast('Network error while sharing resource.');
        } finally {
            if (shareBtn) shareBtn.disabled = false;
        }
    }

    async function deleteResource(resourceId) {
        const confirmed = window.confirm('Delete this resource from the vault?');
        if (!confirmed) return;

        try {
            const res = await apiFetch(`/api/peer-resources/${encodeURIComponent(resourceId)}`, {
                method: 'DELETE'
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                showAppToast(data.error || 'Failed to delete resource.');
                return;
            }

            await renderResources();
            showAppToast(data.message || 'Resource deleted.');
        } catch (error) {
            console.error(error);
            showAppToast('Network error while deleting resource.');
        }
    }

    // 6. Direct Peer Chat System
    async function openChat(recipient) {
        const peer = rememberPeer(
            peerDirectory.get(getPeerKey(recipient)) ||
            onlinePeers.find((entry) => getPeerKey(entry.username) === getPeerKey(recipient)) ||
            { username: recipient }
        );

        currentChatRecipient = peer.username;
        currentChatRecipientId = peer.id;

        recipientAvatarData = peer.avatar || recipient.charAt(0).toUpperCase();
        chatHeaderName.innerText = peer.username;
        if (chatHeaderMeta) {
            chatHeaderMeta.innerText = buildPeerSummary(peer) || formatRole(peer.role);
        }
        setAvatarContent(chatHeaderAvatar, recipientAvatarData, peer.username.charAt(0).toUpperCase());

        chatMessagesContainer.innerHTML = '<div style="text-align:center; opacity:0.5; font-size:0.85rem; padding:2rem;"><i class="fa-solid fa-spinner fa-spin"></i> Loading chat history...</div>';
        chatOverlay.style.display = 'flex';
        setTimeout(() => chatOverlay.classList.add('active'), 10);

        try {
            const res = await apiFetch(`/api/chat/history/${encodeURIComponent(currentUser)}/${encodeURIComponent(recipient)}`);
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.error || 'Unable to load chat history.');
            }
            const data = await res.json();
            chatMessagesContainer.innerHTML = '';

            if (!data.history || data.history.length === 0) {
                chatMessagesContainer.innerHTML = '<div style="text-align:center; opacity:0.35; font-size:0.85rem; margin-top:2rem;"><i class="fa-solid fa-comments" style="font-size:2rem; display:block; margin-bottom:8px;"></i>Start a secure academic conversation!</div>';
            } else {
                data.history.forEach((message) => {
                    const type = message.sender === currentUser ? 'sent' : 'received';
                    const avatar = message.sender === currentUser ? currentAvatar : recipientAvatarData;
                    appendMessage(message.sender, message.text, type, avatar, message.created_at || new Date().toISOString());
                });
            }
        } catch (error) {
            console.error('Chat History Error:', error);
            showAppToast(error.message || 'Unable to load chat history.');
        }
    }

    function appendMessage(sender, text, type, avatarData, timestampStr) {
        const timestamp = timestampStr ? new Date(timestampStr) : new Date();
        const timeDisplay = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dateDisplay = timestamp.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

        const wrapper = document.createElement('div');
        wrapper.className = `chat-msg-wrapper ${type}`;

        const avatar = document.createElement('div');
        avatar.className = 'peer-avatar';
        avatar.style.width = '32px';
        avatar.style.height = '32px';
        avatar.style.fontSize = '0.75rem';
        avatar.style.margin = '0';
        avatar.style.flexShrink = '0';

        setAvatarContent(avatar, avatarData, sender.charAt(0).toUpperCase());

        const msgContainer = document.createElement('div');
        msgContainer.style.display = 'flex';
        msgContainer.style.flexDirection = 'column';
        msgContainer.style.maxWidth = '75%';

        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-msg ${type}`;
        msgDiv.innerText = text;
        msgDiv.style.marginBottom = '2px';

        const timeDiv = document.createElement('div');
        timeDiv.style.fontSize = '0.65rem';
        timeDiv.style.color = type === 'sent' ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.5)';
        timeDiv.style.textAlign = type === 'sent' ? 'right' : 'left';
        timeDiv.innerText = `${dateDisplay} • ${timeDisplay}`;
        timeDiv.style.padding = '0 4px';

        msgContainer.appendChild(msgDiv);
        msgContainer.appendChild(timeDiv);

        wrapper.appendChild(avatar);
        wrapper.appendChild(msgContainer);

        chatMessagesContainer.appendChild(wrapper);
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    }

    const sendTextMessage = () => {
        const text = chatInput.value.trim();
        if (!text || (!currentChatRecipientId && !currentChatRecipient) || !ws || ws.readyState !== WebSocket.OPEN) return;

        ws.send(JSON.stringify({
            type: 'chat_message',
            toId: currentChatRecipientId,
            to: currentChatRecipient,
            text,
            avatar: currentAvatar,
            timestamp: new Date().toISOString()
        }));

        appendMessage(currentUser, text, 'sent', currentAvatar, new Date().toISOString());
        chatInput.value = '';
        chatInput.focus();
    };

    chatSendBtn.addEventListener('click', sendTextMessage);
    chatInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') sendTextMessage();
    });

    closeChatBtn.addEventListener('click', () => {
        chatOverlay.classList.remove('active');
        chatOverlay.style.display = 'none';
        currentChatRecipient = null;
        render();
    });

    function showAppToast(message) {
        let container = document.getElementById('connect-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'connect-toast-container';
            container.style.cssText = 'position:fixed; top:24px; right:24px; z-index:99999; display:flex; flex-direction:column; gap:10px; pointer-events:none;';
            document.body.appendChild(container);
        }
        const toast = document.createElement('div');
        toast.style.cssText = 'background:rgba(10,14,24,0.95); backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px); color:#fff; border:1px solid rgba(0,242,255,0.4); padding:12px 20px; border-radius:14px; font-size:0.9rem; font-weight:500; box-shadow:0 10px 35px rgba(0,0,0,0.6); display:flex; align-items:center; gap:12px; pointer-events:auto; max-width:340px; transition:all 0.35s ease;';
        toast.innerHTML = `<i class="fa-solid fa-bell" style="color:#00f2ff; font-size:1.1rem;"></i> <span style="line-height:1.4;">${escapeHtml(message)}</span>`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(40px)';
            setTimeout(() => toast.remove(), 350);
        }, 4000);
    }

    // Expose global actions for inline handlers
    window['sendConnectRequest'] = sendConnectRequest;
    window['shareResource'] = shareResource;
    window['acceptRequest'] = acceptRequest;
    window['rejectRequest'] = rejectRequest;
    window['openChat'] = openChat;

    // Tab switching
    tabButtons.forEach((button) => {
        button.addEventListener('click', () => {
            tabButtons.forEach((tab) => tab.classList.remove('active'));
            button.classList.add('active');
            activeTab = button.dataset.tab || 'discover';
            render();
        });
    });

    // Search filter
    if (searchInput instanceof HTMLInputElement) {
        searchInput.addEventListener('input', () => {
            if (activeTab !== 'resources') {
                render();
            }
        });
    }

    // Initialize
    initWebSocket();
    refreshRequestsBadge();
    setTimeout(render, 300);
});
