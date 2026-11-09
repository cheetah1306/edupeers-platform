/**
 * EduGroups - Client Logic
 */

document.addEventListener('DOMContentLoaded', () => {
    const currentUser = localStorage.getItem('edupeers_username');
    if (!currentUser) {
        window.location.href = 'login.html';
        return;
    }

    const currentId = localStorage.getItem('edupeers_id') || '';
    const currentEmail = localStorage.getItem('edupeers_email') || '';
    const currentRole = localStorage.getItem('edupeers_role') || 'trainee';
    const currentInstitution = localStorage.getItem('edupeers_institution') || '';
    const currentProfession = localStorage.getItem('edupeers_profession') || '';
    const authTokenStorageKey = 'edupeers_auth_token';
    const currentAvatar = localStorage.getItem('edupeers_photo') || currentUser.charAt(0).toUpperCase();

    // Nav elements
    const navAvatar = document.getElementById('navAvatar');
    if(navAvatar) navAvatar.innerText = currentAvatar;
    
    const topbarUserName = document.getElementById('topbar-user-name');
    if(topbarUserName) topbarUserName.innerText = currentUser;
    
    // Globals
    let ws = null;
    let myGroups = [];
    let myNetwork = [];
    let activeGroupId = null;
    let currentGroupName = '';
    let currentGroupObj = null; // Track the current group object for is_active checks
    let onlinePeersMap = new Map();
    let currentChatMembers = []; // Track current chat members for add-member filtering

    const globalOnlineCountBtn = document.getElementById('globalOnlineCount');

    // UI Elements
    const myGroupsList = document.getElementById('myGroupsList');
    const groupsDirectoryList = document.getElementById('groupsDirectoryList');
    const createGroupBtn = document.getElementById('createGroupBtn');
    
    // Modals
    const createGroupModal = document.getElementById('createGroupModal');
    const peerSelectList = document.getElementById('peerSelectList');
    const confirmCreateGroupBtn = document.getElementById('confirmCreateGroupBtn');
    const cancelGroupBtn = document.getElementById('cancelGroupBtn');
    const groupNameInput = document.getElementById('groupNameInput');
    const groupTopicInput = document.getElementById('groupTopicInput');

    const addMembersModal = document.getElementById('addMembersModal');
    const addPeerSelectList = document.getElementById('addPeerSelectList');
    const confirmAddBtn = document.getElementById('confirmAddBtn');
    const cancelAddBtn = document.getElementById('cancelAddBtn');

    // Chat
    const chatOverlay = document.getElementById('chat-overlay');
    const chatTitle = document.getElementById('chat-title');
    const chatSubtitle = document.getElementById('chat-subtitle');
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('sendBtn');
    const chatCloseBtn = document.getElementById('chat-close-btn');
    const attachFileBtn = document.getElementById('attachFileBtn');
    const openAddMembersBtn = document.getElementById('openAddMembersBtn');
    const groupTypingIndicator = document.getElementById('groupTypingIndicator');
    const chatFooterContainer = document.getElementById('chat-footer-container');

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function showAppToast(message) {
        if (window['showToast']) window['showToast'](message);
        else alert(message);
    }

    function getAuthHeaders() {
        const token = localStorage.getItem(authTokenStorageKey);
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    }

    // Show a system message in the chat area (e.g. "User left the group")
    function appendSystemMessage(text) {
        const div = document.createElement('div');
        div.className = 'chat-system-message';
        div.innerHTML = `<span>${escapeHtml(text)}</span>`;
        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function initWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(`${protocol}//${window.location.host}`);

        ws.onopen = () => {
            console.log('Connected to WS for EduGroups');
            ws.send(JSON.stringify({
                type: 'identify', userId: currentId, email: currentEmail, username: currentUser, avatar: currentAvatar
            }));
        };

        ws.onmessage = (e) => {
            const data = JSON.parse(e.data);
            if (data.type === 'ping') return;
            
            if (data.type === 'presence_update') {
                const count = Math.max(0, (data.peers || []).filter(p => p.status === 'online').length - 1);
                if(globalOnlineCountBtn) globalOnlineCountBtn.innerText = count < 10 ? `0${count}` : count;
                (data.peers || []).forEach(p => onlinePeersMap.set(p.username, p));
                updateMemberStatuses();
                if (!activeGroupId) renderLiveNetwork();
            }
            if (data.type === 'group_message' && data.groupId === activeGroupId) {
                if (data.message.sender_name !== currentUser) {
                    appendChatMessage(data.message.sender_name, data.message.text, false, 'now');
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                }
                // Send read receipt if active window
                ws.send(JSON.stringify({ type: 'group_read', groupId: activeGroupId, messageIds:[data.message.id] }));
            } else if (data.type === 'group_message' && data.message.sender_name !== currentUser) {
                showAppToast(`New message in group`);
                loadGroups();
            }

            // Handle member_left event
            if (data.type === 'member_left') {
                // Show toast notification
                showAppToast(`👋 ${data.username} left the group`);
                
                // If we're in the chat of that group, show system message and update count
                if (data.groupId === activeGroupId) {
                    appendSystemMessage(`${data.username} left the group`);
                    // Update the member count in chat header
                    if (data.activeMemberCount !== undefined) {
                        chatSubtitle.innerText = `${data.activeMemberCount} Members`;
                    }
                    // Update currentChatMembers
                    currentChatMembers = currentChatMembers.filter(m => {
                        if (m.username === data.username) {
                            m.is_active = false;
                            return true; // keep but mark inactive
                        }
                        return true;
                    });
                }
                // Reload groups list to reflect changes
                loadGroups();
            }

            // Handle member_added event (someone else was added to a group you're in)
            if (data.type === 'member_added') {
                showAppToast(`✅ ${data.username} was added to the group by ${data.addedBy}`);
                if (data.groupId === activeGroupId) {
                    appendSystemMessage(`${data.username} was added by ${data.addedBy}`);
                    // Reload the chat to update member count
                    if (currentGroupObj) {
                        fetchAndUpdateMemberCount(activeGroupId);
                    }
                }
                loadGroups();
            }

            if (data.type === 'group_invite') {
                const groupName = (data.group && data.group.name) ? data.group.name : 'a new group';
                const addedBy = data.addedBy ? ` by ${data.addedBy}` : '';
                showAppToast(`🎉 You were added to EduGroup: "${groupName}"${addedBy}!`);
                console.log('[EduGroups] Received group_invite:', data);
                loadGroups();
            }
            if (data.type === 'group_typing' && data.groupId === activeGroupId) {
                if(data.isTyping) {
                    groupTypingIndicator.innerText = `${data.username} is typing...`;
                    setTimeout(() => groupTypingIndicator.innerText='', 3000);
                } else {
                    groupTypingIndicator.innerText = '';
                }
            }
        };

        ws.onclose = () => setTimeout(initWebSocket, 5000);
    }

    // Helper to fetch and update member count in chat header
    async function fetchAndUpdateMemberCount(groupId) {
        try {
            const res = await fetch(`/api/edugroups/${groupId}/members`, { headers: getAuthHeaders() });
            const data = await res.json();
            const activeCount = data.activeCount || (data.members || []).filter(m => m.is_active !== false).length;
            chatSubtitle.innerText = `${activeCount} Members`;
            currentChatMembers = data.members || [];
        } catch(e) {}
    }

    async function fetchNetwork() {
        try {
            const res = await fetch(`/api/peers/my-network/${encodeURIComponent(currentUser)}`);
            const data = await res.json();
            myNetwork = data.network || [];
        } catch(e) {}
    }

    async function loadGroups() {
        myGroupsList.innerHTML = `<div class="connect-loading-state"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading...</div>`;
        try {
            const res = await fetch('/api/edugroups', { headers: getAuthHeaders() });
            const data = await res.json();
            myGroups = data.groups || [];
            
            myGroupsList.innerHTML = '';
            if (myGroups.length === 0) {
                myGroupsList.innerHTML = `<div class="connect-empty-state"><i class="fa-solid fa-layer-group"></i><br>No groups yet.</div>`;
                return;
            }

            myGroups.forEach(g => {
                const card = document.createElement('div');
                card.className = 'peer-item';
                card.innerHTML = `
                    <div class="peer-avatar" style="background:var(--hud-cyan); color:black;">${g.name.charAt(0).toUpperCase()}</div>
                    <div class="peer-item-content">
                        <div class="peer-item-name">${escapeHtml(g.name)} ${g.is_active === false ? '<span style="font-size:0.7rem; color:var(--hud-red);">(Left)</span>' : ''}</div>
                        <div class="peer-item-summary">${escapeHtml(g.topic || 'General')}</div>
                    </div>
                `;
                card.style.cursor = 'pointer';
                card.onclick = () => openGroupInfo(g);
                myGroupsList.appendChild(card);
            });
        } catch (e) {
            myGroupsList.innerHTML = `<div class="connect-empty-state">Error loading groups</div>`;
        }
    }

    function updateMemberStatuses() {
        // Find member status bubbles in directory layout and update if match onlinePeersMap
        document.querySelectorAll('.member-status-node').forEach(node => {
            const username = node.getAttribute('data-username');
            if(onlinePeersMap.has(username) && onlinePeersMap.get(username).status === 'online') {
                node.className = 'peer-status status-online member-status-node';
            } else {
                node.className = 'peer-status status-away member-status-node';
            }
        });
    }

    function renderLiveNetwork() {
        if (activeGroupId) return; // Only show live network if no group is actively selected
        
        const peers = Array.from(onlinePeersMap.values()).filter(p => p.username !== currentUser && p.status === 'online');
        
        if (peers.length === 0) {
            groupsDirectoryList.innerHTML = `<div class="connect-empty-state" style="margin:auto;"><i class="fa-solid fa-users-slash"></i><br>No other peers online right now.<br><span style="font-size:0.8rem;opacity:0.6;">Select a group from the sidebar to collaborate.</span></div>`;
            return;
        }

        const peersHtml = peers.map(p => `
            <div class="peer-item" style="padding:1rem; position:relative; grid-template-columns: auto minmax(0, 1fr);">
                <span class="live-dot" style="position:absolute; top:12px; right:12px; margin:0;"></span>
                <div class="peer-avatar" style="border-radius:12px;">${p.avatar || p.username.charAt(0).toUpperCase()}</div>
                <div class="peer-item-content">
                    <div class="peer-item-name">${escapeHtml(p.username)}</div>
                    <div class="peer-item-summary" style="color:var(--hud-cyan);">${escapeHtml(p.role || 'Trainee')}</div>
                </div>
            </div>
        `).join('');

        groupsDirectoryList.innerHTML = `
            <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.08); border-radius:18px; padding:2rem; width:100%; min-height:100%;">
                <div style="margin-bottom: 2rem; display:flex; justify-content:space-between; align-items:flex-end;">
                    <div>
                        <h2 style="color:white; font-size:1.6rem; margin-bottom:0.4rem;"><i class="fa-solid fa-earth-americas" style="color:var(--hud-cyan); margin-right:8px;"></i> Live Network</h2>
                        <p style="color:var(--text-muted); font-size:0.9rem;">Peers currently online. Select a group from the left to collaborate.</p>
                    </div>
                </div>
                <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap:1.2rem;">
                    ${peersHtml}
                </div>
            </div>
        `;
        groupsDirectoryList.style.alignItems = 'stretch';
        groupsDirectoryList.style.justifyContent = 'flex-start';
        groupsDirectoryList.style.textAlign = 'left';
    }

    async function openGroupInfo(group) {
        groupsDirectoryList.innerHTML = `<div class="connect-loading-state"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading context...</div>`;
        activeGroupId = group.id;
        currentGroupName = group.name;
        currentGroupObj = group;

        try {
            const res = await fetch(`/api/edugroups/${group.id}/members`, { headers: getAuthHeaders() });
            const data = await res.json();
            const members = data.members || [];
            const activeCount = data.activeCount || members.filter(m => m.is_active !== false).length;
            currentChatMembers = members;

            let membersHtml = members.filter(m => m.is_active !== false).map(m => {
                const isOnline = m.status === 'online';
                return `
                <div class="peer-item" style="padding:0.75rem;">
                    <span class="peer-status ${isOnline ? 'status-online' : 'status-away'} member-status-node" data-username="${escapeHtml(m.username)}"></span>
                    <div class="peer-avatar" style="width:35px;height:35px;font-size:0.8rem;">${m.avatar}</div>
                    <div class="peer-item-content">
                        <div class="peer-item-name" style="font-size:0.9rem;">${escapeHtml(m.username)}</div>
                        <div class="peer-item-summary" style="font-size:0.75rem;">${escapeHtml(m.user_role)}</div>
                    </div>
                </div>
                `;
            }).join('');

            // Show left members separately if any
            const leftMembers = members.filter(m => m.is_active === false);
            let leftMembersHtml = '';
            if (leftMembers.length > 0) {
                leftMembersHtml = `
                    <h4 style="color:rgba(255,255,255,0.4); font-size:0.85rem; margin-top:1.5rem; margin-bottom:0.5rem;">Left Members</h4>
                    <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap:10px;">
                        ${leftMembers.map(m => `
                            <div class="peer-item" style="padding:0.75rem; opacity:0.4;">
                                <span class="peer-status status-away member-status-node" data-username="${escapeHtml(m.username)}"></span>
                                <div class="peer-avatar" style="width:35px;height:35px;font-size:0.8rem; filter:grayscale(1);">${m.avatar}</div>
                                <div class="peer-item-content">
                                    <div class="peer-item-name" style="font-size:0.9rem;">${escapeHtml(m.username)} <span style="font-size:0.7rem; color:var(--hud-red);">(Left)</span></div>
                                    <div class="peer-item-summary" style="font-size:0.75rem;">${escapeHtml(m.user_role)}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `;
            }

            groupsDirectoryList.innerHTML = `
                <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); border-radius:15px; padding:2rem; width:100%;">
                    <h2 style="margin-bottom:0.5rem; color:white; font-size:1.8rem;">${escapeHtml(group.name)} <span style="font-size:0.9rem; padding:0.2rem 0.5rem; background:rgba(255,255,255,0.1); border-radius:10px; vertical-align:middle;">${activeCount} Members</span></h2>
                    <p style="color:var(--text-muted); margin-bottom:1.5rem;">Topic: ${escapeHtml(group.topic || 'General Collaborative Study')}</p>
                    
                    <div style="display:flex; gap:10px; margin-bottom:2rem; flex-wrap:wrap;">
                        <button class="connect-action-btn" id="openChatBtn"><i class="fa-solid fa-comments"></i> Enter Chat Area</button>
                        ${group.is_active !== false ? `<button class="connect-action-btn" id="leaveGroupBtn" style="background:transparent; border-color:#f39c12; color:#f39c12;"><i class="fa-solid fa-arrow-right-from-bracket"></i> Leave Group</button>` : ''}
                        ${group.is_active === false ? `<button class="connect-action-btn" id="delGroupBtn" style="background:transparent; border-color:var(--hud-red); color:var(--hud-red);"><i class="fa-solid fa-trash"></i> Delete Group</button>` : ''}
                    </div>

                    <h3 style="color:white; font-size:1.1rem; margin-bottom:1rem; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:0.5rem;">Active Members</h3>
                    <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap:10px;">
                        ${membersHtml}
                    </div>
                    ${leftMembersHtml}
                </div>
            `;

            document.getElementById('openChatBtn').onclick = () => openChatView(group, members);
            
            const leaveBtn = document.getElementById('leaveGroupBtn');
            if (leaveBtn) {
                leaveBtn.onclick = async () => {
                    if(!confirm('Are you sure you want to leave this group? You will no longer receive live chat.')) return;
                    try {
                        const res = await fetch(`/api/edugroups/${group.id}/leave`, { method: 'POST', headers: getAuthHeaders() });
                        if(res.ok) {
                            showAppToast('You left the group');
                            groupsDirectoryList.innerHTML = `<p style="color:rgba(255,255,255,0.5);">Select a group to expand its details or create a new one to get started.</p>`;
                            loadGroups();
                        } else alert('Failed to leave group.');
                    } catch(e) {
                        alert('Network error leaving group.');
                    }
                };
            }
            
            const delBtn = document.getElementById('delGroupBtn');
            if (delBtn) {
                delBtn.onclick = async () => {
                    if(!confirm('Are you sure you want to delete this group from your list?')) return;
                    try {
                        const res = await fetch(`/api/edugroups/${group.id}`, { method: 'DELETE', headers: getAuthHeaders() });
                        if(res.ok) {
                            showAppToast('Group removed from your active list');
                            groupsDirectoryList.innerHTML = `<p style="color:rgba(255,255,255,0.5);">Select a group to expand its details or create a new one to get started.</p>`;
                            loadGroups();
                        } else alert('Failed to delete group.');
                    } catch(e) {
                        alert('Network error deleting group.');
                    }
                };
            }

        } catch(e) {
            groupsDirectoryList.innerHTML = `<div class="connect-empty-state">Error loading group info</div>`;
        }
    }

    async function openChatView(group, members) {
        const activeMembers = members.filter(m => m.is_active !== false);
        const activeCount = activeMembers.length;
        
        chatTitle.innerText = group.name;
        chatSubtitle.innerText = `${activeCount} Members`;
        chatOverlay.style.display = 'flex';
        chatMessages.innerHTML = `<div class="connect-loading-state" style="color:white;">Loading messages...</div>`;

        const userHasLeft = group.is_active === false;

        // If user left: completely hide the chat footer (text input area)
        if (userHasLeft) {
            chatFooterContainer.style.display = 'none';
            openAddMembersBtn.style.display = 'none';
        } else {
            chatFooterContainer.style.display = '';
            chatInput.disabled = false;
            sendBtn.disabled = false;
            chatInput.placeholder = "Type your message...";
            openAddMembersBtn.style.display = 'inline-flex';
        }

        // Inject Delete Button into Chat Header right away ONLY if user left
        const addMembersBtn = document.getElementById('openAddMembersBtn');
        const headerRight = addMembersBtn.parentElement;
        
        let existingDelete = document.getElementById('chatDeleteGroupBtn');
        if (existingDelete) existingDelete.remove();

        if (userHasLeft) {
            const delBtnHeader = document.createElement('button');
            delBtnHeader.className = 'connect-action-btn';
            delBtnHeader.id = 'chatDeleteGroupBtn';
            delBtnHeader.style.background = 'transparent';
            delBtnHeader.style.borderColor = 'var(--hud-red)';
            delBtnHeader.style.color = 'var(--hud-red)';
            delBtnHeader.style.marginLeft = '10px';
            delBtnHeader.innerHTML = '<i class="fa-solid fa-trash"></i> Delete';
            
            delBtnHeader.onclick = async () => {
                if(!confirm('Are you sure you want to delete this group from your list?')) return;
                try {
                    const res = await fetch(`/api/edugroups/${group.id}`, { method: 'DELETE', headers: getAuthHeaders() });
                    if(res.ok) {
                        showAppToast('Group removed from your list');
                        document.getElementById('chat-overlay').style.display = 'none';
                        groupsDirectoryList.innerHTML = `<p style="color:rgba(255,255,255,0.5);">Select a group to expand its details or create a new one to get started.</p>`;
                        loadGroups();
                    } else {
                        alert('Failed to delete group.');
                    }
                } catch(e) {
                    alert('Network error deleting group.');
                }
            };
            headerRight.appendChild(delBtnHeader);
        }

        try {
            const res = await fetch(`/api/edugroups/${group.id}/messages`, { headers: getAuthHeaders() });
            const data = await res.json();
            const msgs = data.messages || [];

            chatMessages.innerHTML = '';

            // If user has left, show a banner at top of chat
            if (userHasLeft) {
                const banner = document.createElement('div');
                banner.className = 'chat-left-banner';
                banner.innerHTML = `<i class="fa-solid fa-circle-info"></i> You have left this group. You can no longer send messages.`;
                chatMessages.appendChild(banner);
            }

            msgs.forEach(m => {
                const isSent = m.sender_name === currentUser;
                const time = new Date(m.recorded_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                appendChatMessage(m.sender_name, m.content, isSent, time);
            });
            chatMessages.scrollTop = chatMessages.scrollHeight;

            // Mark as read
            const unread = msgs.filter(m => !m.read_by.includes(currentId)).map(m=>m.id);
            if(unread.length > 0 && ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'group_read', groupId: activeGroupId, messageIds: unread }));
            }
        } catch(e) {
            chatMessages.innerHTML = `<div class="connect-empty-state">Failed to load chat history.</div>`;
        }
    }

    // Creating Groups
    createGroupBtn.onclick = async () => {
        await fetchNetwork();
        peerSelectList.innerHTML = myNetwork.length === 0 
            ? `<p style="color:var(--text-muted); font-size:0.9rem;">You have no connected peers yet. <a href="peers-connect.html" style="color:var(--hud-cyan);">Connect with peers first.</a></p>`
            : myNetwork.map(p => `
                <label class="peer-select-item">
                    <input type="checkbox" value="${p.id}" class="group-peer-checkbox">
                    ${escapeHtml(p.username)} 
                </label>
            `).join('');
        createGroupModal.style.display = 'flex';
    };

    cancelGroupBtn.onclick = () => { createGroupModal.style.display = 'none'; };

    confirmCreateGroupBtn.onclick = async () => {
        const name = groupNameInput.value.trim();
        const topic = groupTopicInput.value.trim();
        const selectedIds = Array.from(document.querySelectorAll('.group-peer-checkbox:checked')).map(el => el.value);

        if(!name) return showAppToast("Group name is required");

        confirmCreateGroupBtn.disabled = true;
        try {
            const res = await fetch('/api/edugroups/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({ name, topic, memberIds: selectedIds })
            });
            const textResponse = await res.text();
            if(res.ok) {
                showAppToast("Group created!");
                createGroupModal.style.display = 'none';
                groupNameInput.value = ''; groupTopicInput.value = '';
                loadGroups();
            } else {
                alert("Failed to create group: " + textResponse);
            }
        } catch(e) { alert("Network Error: " + e.message); }
        confirmCreateGroupBtn.disabled = false;
    };

    // Chat Mechanics
    chatCloseBtn.onclick = () => { 
        chatOverlay.style.display = 'none'; 
        activeGroupId = null; 
        currentGroupObj = null;
        // Restore footer visibility for next chat open
        chatFooterContainer.style.display = '';
        renderLiveNetwork();
    };

    function appendChatMessage(sender, text, isSent, time) {
        const div = document.createElement('div');
        div.className = `chat-msg-wrapper ${isSent ? 'sent' : 'received'}`;
        div.innerHTML = `
            ${(!isSent) ? `<div class="peer-avatar" style="width:30px;height:30px;font-size:0.7rem;flex-shrink:0;">${sender.charAt(0).toUpperCase()}</div>` : ''}
            <div>
                ${!isSent ? `<span class="msg-sender-name">${escapeHtml(sender)}</span>` : ''}
                <div class="chat-msg ${isSent ? 'sent' : 'received'}">${escapeHtml(text)}</div>
                <div style="font-size:0.65rem; color:rgba(255,255,255,0.4); text-align:${isSent?'right':'left'}; margin-top:2px;">${time}</div>
            </div>
        `;
        chatMessages.appendChild(div);
    }

    sendBtn.onclick = () => sendMsg();
    chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMsg(); });
    
    let typingTimeout;
    chatInput.addEventListener('input', () => {
        if(ws && ws.readyState === WebSocket.OPEN && activeGroupId) {
            ws.send(JSON.stringify({ type: 'group_typing', groupId: activeGroupId, isTyping: true }));
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => ws.send(JSON.stringify({ type: 'group_typing', groupId: activeGroupId, isTyping: false })), 2000);
        }
    });

    function sendMsg() {
        const val = chatInput.value.trim();
        if(!val || !activeGroupId || !ws) return;
        
        ws.send(JSON.stringify({
            type: 'group_message',
            groupId: activeGroupId,
            text: val
        }));

        // Optimistically render
        appendChatMessage(currentUser, val, true, 'Just now');
        chatInput.value = '';
        chatMessages.scrollTop = chatMessages.scrollHeight;
        ws.send(JSON.stringify({ type: 'group_typing', groupId: activeGroupId, isTyping: false }));
    }

    openAddMembersBtn.onclick = async () => {
        await fetchNetwork();
        
        // Get current active member usernames to filter them out from the add list
        const activeMemberIds = new Set(
            currentChatMembers.filter(m => m.is_active !== false).map(m => m.id)
        );
        
        // Show only peers who are NOT already active members
        const peersToShow = myNetwork.filter(p => !activeMemberIds.has(p.id));
        
        if (peersToShow.length === 0) {
            addPeerSelectList.innerHTML = `<p style="color:var(--text-muted); font-size:0.9rem;">All your connected peers are already in this group.</p>`;
        } else {
            addPeerSelectList.innerHTML = peersToShow.map(p => {
                // Check if this person was a member who left (can be re-added)
                const leftMember = currentChatMembers.find(m => m.id === p.id && m.is_active === false);
                const label = leftMember ? `${escapeHtml(p.username)} <span style="color:var(--hud-red); font-size:0.75rem;">(Left - can be re-added)</span>` : escapeHtml(p.username);
                return `
                    <label class="peer-select-item">
                        <input type="checkbox" value="${p.id}" class="add-peer-checkbox">
                        ${label}
                    </label>
                `;
            }).join('');
        }
        addMembersModal.style.display = 'flex';
    };

    cancelAddBtn.onclick = () => addMembersModal.style.display = 'none';

    confirmAddBtn.onclick = async () => {
        const selectedIds = Array.from(document.querySelectorAll('.add-peer-checkbox:checked')).map(el => el.value);
        if(selectedIds.length === 0) return showAppToast("Select members to add");

        confirmAddBtn.disabled = true;
        try {
            const res = await fetch(`/api/edugroups/${activeGroupId}/add`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({ memberIds: selectedIds })
            });
            if(res.ok) {
                showAppToast("Members added!");
                addMembersModal.style.display = 'none';
                // Refresh member count in chat
                await fetchAndUpdateMemberCount(activeGroupId);
                openGroupInfo({id: activeGroupId, name: currentGroupName, is_active: currentGroupObj ? currentGroupObj.is_active : true, is_creator: currentGroupObj ? currentGroupObj.is_creator : false, topic: currentGroupObj ? currentGroupObj.topic : ''}); 
            } else alert("Failed to add members");
        } catch(e) { alert("Network Error"); }
        confirmAddBtn.disabled = false;
    };

    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.clear();
            document.cookie = 'auth_token=; Max-Age=0; path=/;';
            window.location.href = 'login.html';
        });
    }

    // Init
    initWebSocket();
    loadGroups();
    fetchNetwork();
});
