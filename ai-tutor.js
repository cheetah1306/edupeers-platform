/**
 * EduPeers AI Academic Tutor - Client Controller
 * Cloud-Synced, Powered by Google Gemini 3.6 Flash & Markdown/MathJax
 */

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Authentication State
    const currentToken = localStorage.getItem('edupeers_token');
    const storedUser = localStorage.getItem('edupeers_user');

    if (!currentToken || !storedUser) {
        window.location.href = 'login.html';
        return;
    }

    let currentUser = {};
    try {
        currentUser = JSON.parse(storedUser);
    } catch (e) {
        window.location.href = 'login.html';
        return;
    }

    // Populate Topbar User Info
    const topAvatar = document.getElementById('topbar-avatar');
    const topName = document.getElementById('topbar-user-name');
    const username = currentUser.username || currentUser.email.split('@')[0];
    const initial = username.charAt(0).toUpperCase();

    if (topAvatar) topAvatar.textContent = initial;
    if (topName) topName.textContent = username;

    // 2. DOM References
    const chatInput = document.getElementById('chat-input-text');
    const chatSendBtn = document.getElementById('chat-send-btn');
    const chatBox = document.getElementById('chat-box');
    const conversationsList = document.getElementById('conversations-list');
    const btnNewChat = document.getElementById('new-chat-btn');
    const btnClearAll = document.getElementById('btn-clear-all');
    const micBtn = document.getElementById('chat-mic-btn');
    const voicePill = document.getElementById('voice-indicator-pill');

    let currentSessionId = localStorage.getItem('edupeers_ai_current_session') || null;
    let isGenerating = false;

    // Helper: Authenticated API Fetch
    const apiFetch = async (path, options = {}) => {
        options.headers = options.headers || {};
        options.headers['Content-Type'] = 'application/json';
        options.headers['Authorization'] = `Bearer ${currentToken}`;

        try {
            const res = await fetch(path, options);
            if (res.status === 401 || res.status === 403) {
                console.warn('Session expired or unauthorized');
                return null;
            }
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                console.error('API Error:', errData);
                return errData;
            }
            return await res.json();
        } catch (e) {
            console.error('Network Error:', e);
            return null;
        }
    };

    // 3. Markdown & MathJax Formatter
    const formatAiContent = (rawText) => {
        if (!rawText) return '';
        try {
            if (window.marked) {
                marked.setOptions({
                    breaks: true,
                    gfm: true
                });
                return marked.parse(rawText);
            }
        } catch (e) {
            console.warn('Markdown parsing error:', e);
        }
        return rawText.replace(/\n/g, '<br>');
    };

    const triggerMathJax = (targetElement) => {
        if (window.MathJax && window.MathJax.typesetPromise) {
            window.MathJax.typesetPromise([targetElement]).catch(e => console.warn('MathJax error:', e));
        }
    };

    // 4. Render Conversation Sidebar
    const renderSessionsList = async () => {
        if (!conversationsList) return;
        const sessions = await apiFetch('/api/ai/sessions');

        conversationsList.innerHTML = '';
        if (!sessions || !Array.isArray(sessions) || sessions.length === 0) {
            conversationsList.innerHTML = `
                <div style="padding: 1.2rem 0.8rem; text-align: center; color: rgba(255,255,255,0.35); font-size: 0.8rem;">
                    <i class="fa-regular fa-comments" style="font-size: 1.5rem; margin-bottom: 0.5rem; display: block; opacity: 0.5;"></i>
                    No previous chats.<br>Start a new conversation!
                </div>
            `;
            return;
        }

        sessions.forEach(session => {
            const item = document.createElement('div');
            item.className = `sidebar-item ${session.id === currentSessionId ? 'active' : ''}`;
            item.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 0.65rem 0.8rem; margin-bottom: 0.35rem; border-radius: 10px; cursor: pointer; transition: background 0.2s; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05);';
            if (session.id === currentSessionId) {
                item.style.background = 'rgba(0, 242, 255, 0.12)';
                item.style.borderColor = 'rgba(0, 242, 255, 0.3)';
            }

            item.innerHTML = `
                <div style="display: flex; align-items: center; gap: 0.6rem; overflow: hidden; flex: 1;">
                    <i class="fa-regular fa-message" style="color: var(--hud-cyan, #00f2ff); font-size: 0.85rem; flex-shrink: 0;"></i>
                    <span style="font-size: 0.82rem; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500;">
                        ${session.title || 'Conversation'}
                    </span>
                </div>
                <button class="btn-delete-session" title="Delete conversation" style="background: transparent; border: none; color: rgba(255,255,255,0.3); font-size: 0.75rem; cursor: pointer; padding: 4px 6px; border-radius: 6px; transition: color 0.2s, background 0.2s; flex-shrink: 0;">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            `;

            item.addEventListener('mouseenter', () => {
                if (session.id !== currentSessionId) item.style.background = 'rgba(255,255,255,0.08)';
            });
            item.addEventListener('mouseleave', () => {
                if (session.id !== currentSessionId) item.style.background = 'rgba(255,255,255,0.03)';
            });

            item.addEventListener('click', (e) => {
                if (!e.target.closest('.btn-delete-session')) {
                    selectSession(session.id);
                }
            });

            const delBtn = item.querySelector('.btn-delete-session');
            if (delBtn) {
                delBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    deleteSession(session.id);
                });
            }

            conversationsList.appendChild(item);
        });
    };

    // 5. Select, Start, and Delete Sessions
    const selectSession = (id) => {
        currentSessionId = id;
        localStorage.setItem('edupeers_ai_current_session', id);
        renderSessionsList();
        loadActiveSession();
    };

    const startNewChat = async (e) => {
        if (e) e.preventDefault();
        const res = await apiFetch('/api/ai/sessions', {
            method: 'POST',
            body: JSON.stringify({ title: 'New Conversation' })
        });

        if (res && res.id) {
            selectSession(res.id);
            if (chatInput) chatInput.focus();
        } else {
            console.error('Could not create new session:', res);
        }
    };

    const deleteSession = async (id) => {
        if (!confirm('Permanently delete this conversation?')) return;
        const res = await apiFetch(`/api/ai/sessions/${id}`, { method: 'DELETE' });
        if (res) {
            if (currentSessionId === id) {
                currentSessionId = null;
                localStorage.removeItem('edupeers_ai_current_session');
            }
            renderSessionsList();
            loadActiveSession();
        }
    };

    // 6. Load Active Session Messages
    const loadActiveSession = async () => {
        if (!chatBox) return;
        chatBox.innerHTML = '';

        if (!currentSessionId) {
            renderWelcomePlaceholder();
            return;
        }

        const data = await apiFetch(`/api/ai/sessions/${currentSessionId}`);
        if (!data || !Array.isArray(data.messages) || data.messages.length === 0) {
            renderWelcomePlaceholder();
            return;
        }

        data.messages.forEach(msg => {
            appendMessageBubble(msg.content, msg.role === 'ai' ? 'ai' : 'user', msg.id, false);
        });

        chatBox.scrollTop = chatBox.scrollHeight;
    };

    // 7. Welcome State with Interactive Prompt Chips
    const renderWelcomePlaceholder = () => {
        if (!chatBox) return;
        chatBox.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100%; text-align: center; padding: 2rem 1rem; color: rgba(255,255,255,0.8);">
                <div style="width: 70px; height: 70px; border-radius: 20px; background: linear-gradient(135deg, rgba(0,242,255,0.2), rgba(157,78,221,0.25)); display: flex; align-items: center; justify-content: center; font-size: 2rem; color: var(--hud-cyan, #00f2ff); margin-bottom: 1.2rem; border: 1px solid rgba(0,242,255,0.35); box-shadow: 0 10px 30px rgba(0,242,255,0.2);">
                    <i class="fa-solid fa-robot"></i>
                </div>
                <h3 style="font-size: 1.4rem; font-weight: 700; margin-bottom: 0.4rem; color: #fff;">Welcome to EduPeers AI Academic Tutor</h3>
                <p style="font-size: 0.9rem; color: rgba(255,255,255,0.6); max-width: 520px; line-height: 1.5; margin-bottom: 1.8rem;">
                    Powered by Google Gemini 3.6 Flash. Ask any technical question, request code walkthroughs, debug algorithms, or explore deep concept explanations.
                </p>

                <div style="width: 100%; max-width: 580px;">
                    <div style="font-size: 0.78rem; text-transform: uppercase; letter-spacing: 1px; color: var(--hud-cyan, #00f2ff); font-weight: 700; margin-bottom: 0.8rem;">
                        💡 Quick Starter Topics
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 0.75rem; text-align: left;">
                        <button class="prompt-chip" data-prompt="Explain Async/Await and Event Loop in JavaScript with code examples." style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 0.8rem 1rem; color: #fff; font-size: 0.85rem; cursor: pointer; transition: all 0.25s; display: flex; align-items: center; gap: 0.6rem;">
                            <span style="color: var(--hud-cyan, #00f2ff); font-size: 1rem;">⚡</span>
                            <span>Explain Async/Await & Event Loop in JS</span>
                        </button>
                        <button class="prompt-chip" data-prompt="What are the best practices for SQL indexing, query optimization, and execution plans?" style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 0.8rem 1rem; color: #fff; font-size: 0.85rem; cursor: pointer; transition: all 0.25s; display: flex; align-items: center; gap: 0.6rem;">
                            <span style="color: var(--hud-purple, #c77dff); font-size: 1rem;">🗄️</span>
                            <span>SQL Indexing & Query Optimization</span>
                        </button>
                        <button class="prompt-chip" data-prompt="How do Microservices architectures handle inter-service communication and eventual consistency?" style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 0.8rem 1rem; color: #fff; font-size: 0.85rem; cursor: pointer; transition: all 0.25s; display: flex; align-items: center; gap: 0.6rem;">
                            <span style="color: #7cf29a; font-size: 1rem;">🏗️</span>
                            <span>Microservices & Eventual Consistency</span>
                        </button>
                        <button class="prompt-chip" data-prompt="Explain Big-O Notation with time and space complexity comparisons of common sorting algorithms." style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 0.8rem 1rem; color: #fff; font-size: 0.85rem; cursor: pointer; transition: all 0.25s; display: flex; align-items: center; gap: 0.6rem;">
                            <span style="color: var(--hud-gold, #ffd166); font-size: 1rem;">📐</span>
                            <span>Big-O Notation & Algorithm Complexities</span>
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Wire prompt chips
        chatBox.querySelectorAll('.prompt-chip').forEach(chip => {
            chip.addEventListener('mouseenter', () => {
                chip.style.background = 'rgba(0, 242, 255, 0.1)';
                chip.style.borderColor = 'rgba(0, 242, 255, 0.4)';
                chip.style.transform = 'translateY(-2px)';
            });
            chip.addEventListener('mouseleave', () => {
                chip.style.background = 'rgba(255,255,255,0.04)';
                chip.style.borderColor = 'rgba(255,255,255,0.1)';
                chip.style.transform = 'none';
            });
            chip.addEventListener('click', () => {
                const prompt = chip.dataset.prompt;
                if (chatInput) {
                    chatInput.value = prompt;
                    handleSendMessage();
                }
            });
        });
    };

    // 8. Message Bubble Construction
    const appendMessageBubble = (content, sender, msgId, animate = false) => {
        const bubble = document.createElement('div');
        bubble.className = `msg ${sender}`;
        bubble.dataset.msgId = msgId || '';
        bubble.style.cssText = `
            display: flex;
            gap: 1rem;
            margin-bottom: 1.4rem;
            max-width: 90%;
            ${sender === 'user' ? 'margin-left: auto; flex-direction: row-reverse;' : 'margin-right: auto;'}
            animation: fadeInMsg 0.3s ease-out;
        `;

        const avatar = document.createElement('div');
        avatar.style.cssText = `
            width: 38px;
            height: 38px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.95rem;
            font-weight: 700;
            flex-shrink: 0;
            ${sender === 'user' 
                ? 'background: linear-gradient(135deg, #00c6ff, #0072ff); color: #fff; box-shadow: 0 4px 15px rgba(0,114,255,0.3);' 
                : 'background: linear-gradient(135deg, rgba(0,242,255,0.2), rgba(157,78,221,0.3)); border: 1px solid rgba(0,242,255,0.4); color: var(--hud-cyan, #00f2ff); box-shadow: 0 4px 15px rgba(0,242,255,0.2);'}
        `;
        avatar.innerHTML = sender === 'user' ? initial : '<i class="fa-solid fa-robot"></i>';

        const contentBox = document.createElement('div');
        contentBox.className = 'msg-content-wrapper';
        contentBox.style.cssText = `
            padding: 1.1rem 1.4rem;
            border-radius: ${sender === 'user' ? '18px 4px 18px 18px' : '4px 18px 18px 18px'};
            font-size: 0.94rem;
            line-height: 1.65;
            color: #fff;
            position: relative;
            box-shadow: 0 10px 25px rgba(0,0,0,0.3);
            ${sender === 'user'
                ? 'background: linear-gradient(135deg, rgba(0, 114, 255, 0.4), rgba(0, 198, 255, 0.25)); border: 1px solid rgba(0, 198, 255, 0.35);'
                : 'background: rgba(13, 19, 33, 0.85); border: 1px solid rgba(255,255,255,0.1); border-top: 1px solid rgba(0,242,255,0.3); backdrop-filter: blur(12px);'}
        `;

        const headerLabel = sender === 'user' ? 'You' : 'Expert AI Tutor';
        const formattedHTML = sender === 'ai' ? formatAiContent(content) : `<p style="margin:0;">${content.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>`;

        contentBox.innerHTML = `
            <div style="font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 0.45rem; color: ${sender === 'user' ? 'rgba(255,255,255,0.85)' : 'var(--hud-cyan, #00f2ff)'}; display: flex; justify-content: space-between; align-items: center;">
                <span>${headerLabel}</span>
                <span style="font-size: 0.65rem; color: rgba(255,255,255,0.35); font-weight: 400;">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div class="msg-text-body" style="word-break: break-word;">
                ${formattedHTML}
            </div>
        `;

        // Add copy buttons to code blocks
        if (sender === 'ai') {
            contentBox.querySelectorAll('pre').forEach(pre => {
                pre.style.position = 'relative';
                pre.style.padding = '1rem';
                pre.style.borderRadius = '12px';
                pre.style.background = 'rgba(0,0,0,0.5)';
                pre.style.border = '1px solid rgba(255,255,255,0.1)';
                pre.style.overflowX = 'auto';

                const copyBtn = document.createElement('button');
                copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy';
                copyBtn.style.cssText = 'position: absolute; top: 8px; right: 8px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15); color: #fff; font-size: 0.7rem; padding: 4px 8px; border-radius: 6px; cursor: pointer; transition: 0.2s;';
                copyBtn.addEventListener('click', () => {
                    const code = pre.querySelector('code')?.innerText || pre.innerText;
                    navigator.clipboard.writeText(code).then(() => {
                        copyBtn.innerHTML = '<i class="fa-solid fa-check" style="color:#7cf29a;"></i> Copied!';
                        setTimeout(() => copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy', 2000);
                    });
                });
                pre.appendChild(copyBtn);
            });
        }

        bubble.appendChild(avatar);
        bubble.appendChild(contentBox);
        chatBox.appendChild(bubble);

        triggerMathJax(contentBox);
        chatBox.scrollTop = chatBox.scrollHeight;
        return bubble;
    };

    // 9. Send Chat Message
    const handleSendMessage = async () => {
        if (!chatInput) return;
        const text = chatInput.value.trim();
        if (!text || isGenerating) return;

        // Clear any welcome placeholder
        const placeholder = chatBox.querySelector('h3');
        if (placeholder) chatBox.innerHTML = '';

        // Auto-create session if needed
        if (!currentSessionId) {
            const newSess = await apiFetch('/api/ai/sessions', {
                method: 'POST',
                body: JSON.stringify({ title: text.substring(0, 35) })
            });
            if (newSess && newSess.id) {
                currentSessionId = newSess.id;
                localStorage.setItem('edupeers_ai_current_session', currentSessionId);
                renderSessionsList();
            }
        }

        // Add user bubble
        appendMessageBubble(text, 'user', null, true);
        chatInput.value = '';
        isGenerating = true;

        // Typing Indicator Bubble
        const typingBubble = document.createElement('div');
        typingBubble.id = 'ai-typing-indicator';
        typingBubble.style.cssText = 'display: flex; gap: 1rem; margin-bottom: 1.4rem; max-width: 90%; animation: fadeInMsg 0.3s ease-out;';
        typingBubble.innerHTML = `
            <div style="width: 38px; height: 38px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 0.95rem; background: linear-gradient(135deg, rgba(0,242,255,0.2), rgba(157,78,221,0.3)); border: 1px solid rgba(0,242,255,0.4); color: var(--hud-cyan, #00f2ff); box-shadow: 0 4px 15px rgba(0,242,255,0.2); flex-shrink: 0;">
                <i class="fa-solid fa-robot"></i>
            </div>
            <div style="padding: 1rem 1.4rem; border-radius: 4px 18px 18px 18px; font-size: 0.94rem; color: rgba(255,255,255,0.7); background: rgba(13, 19, 33, 0.85); border: 1px solid rgba(255,255,255,0.1); border-top: 1px solid rgba(0,242,255,0.3); display: flex; align-items: center; gap: 0.6rem;">
                <i class="fa-solid fa-spinner fa-spin" style="color: var(--hud-cyan, #00f2ff);"></i>
                <span>AI Tutor is formulating your response...</span>
            </div>
        `;
        chatBox.appendChild(typingBubble);
        chatBox.scrollTop = chatBox.scrollHeight;

        try {
            const data = await apiFetch('/api/ai/tutor', {
                method: 'POST',
                body: JSON.stringify({
                    message: text,
                    sessionId: currentSessionId
                })
            });

            typingBubble.remove();
            isGenerating = false;

            if (data && data.reply) {
                appendMessageBubble(data.reply, 'ai', data.aiMessageId, true);
                if (data.sessionId && data.sessionId !== currentSessionId) {
                    currentSessionId = data.sessionId;
                    localStorage.setItem('edupeers_ai_current_session', currentSessionId);
                }
                renderSessionsList();
            } else {
                appendMessageBubble(data?.error || 'AI Tutor service is temporarily unavailable. Please try again.', 'ai', null, true);
            }
        } catch (err) {
            typingBubble.remove();
            isGenerating = false;
            console.error('Error in AI message send:', err);
            appendMessageBubble('Unable to connect to AI Tutor. Please check your internet connection.', 'ai', null, true);
        }
    };

    // 10. Event Listeners
    if (chatSendBtn) {
        chatSendBtn.addEventListener('click', (e) => {
            e.preventDefault();
            handleSendMessage();
        });
    }

    if (chatInput) {
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
            }
        });
    }

    if (btnNewChat) {
        btnNewChat.addEventListener('click', startNewChat);
    }

    if (btnClearAll) {
        btnClearAll.addEventListener('click', async () => {
            if (confirm('Permanently clear all conversation history?')) {
                await apiFetch('/api/ai/sessions', { method: 'DELETE' });
                currentSessionId = null;
                localStorage.removeItem('edupeers_ai_current_session');
                renderSessionsList();
                loadActiveSession();
            }
        });
    }

    // 11. Initial Load
    await renderSessionsList();
    await loadActiveSession();
});
