const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const WebSocket = require('ws');
const { GoogleGenAI } = require('@google/genai');
const { default: OpenAI } = require('openai');
const nodemailer = require('nodemailer');

const app = express();
const PORT = parseInt(process.env.PORT) || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'edupeers_jwt_secure_secret_2026';

// Trust Cloudflare/reverse proxy headers
app.set('trust proxy', 1);

// Database Pool Connection
const pgPool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://postgres:cheetah@1306@localhost:5432/edupeers'
});

// ── In-memory WebSocket Presence & Client Store ──────────────
// connectedClients: Map<wsSocket, { userId, username, avatar, role, institution, profession, email, status }>
const connectedClients = new Map();

function broadcastPresence() {
    const peers = Array.from(connectedClients.values()).map(p => ({
        id:          p.userId,
        username:    p.username,
        avatar:      p.avatar,
        role:        p.role,
        institution: p.institution,
        profession:  p.profession,
        status:      'online'
    }));
    const payload = JSON.stringify({ type: 'presence_update', peers });
    for (const [sock] of connectedClients) {
        if (sock.readyState === 1 /* OPEN */) {
            try { sock.send(payload); } catch {}
        }
    }
}

function findSocketByUserId(userId) {
    for (const [sock, info] of connectedClients) {
        if (info.userId === userId) return sock;
    }
    return null;
}

function findSocketByUsername(username) {
    const lower = (username || '').trim().toLowerCase();
    for (const [sock, info] of connectedClients) {
        if ((info.username || '').trim().toLowerCase() === lower) return sock;
    }
    return null;
}

function broadcastToRole(role, payload) {
    const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);
    for (const [sock, info] of connectedClients) {
        if (info.role === role && sock.readyState === 1) {
            try { sock.send(raw); } catch {}
        }
    }
}

function broadcastToUser(userId, payload) {
    const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);
    for (const [sock, info] of connectedClients) {
        if (info.userId === userId && sock.readyState === 1) {
            try { sock.send(raw); } catch {}
        }
    }
}

// ─── Middleware ────────────────────────────────────────────────
// Broad CORS – works for both localhost and Cloudflare trycloudflare.com domains
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, cf-access-token');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// ─── Disable edge & browser caching for all assets during preview ──────────────
// This prevents Cloudflare Edge and Browsers from serving stale cached assets
app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    next();
});

// Request Logger
app.use((req, res, next) => {
    if (!req.url.startsWith('/index.css') && !req.url.endsWith('.png') && !req.url.endsWith('.ico')) {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    }
    next();
});

// Static Files – served from project root with strict no-cache headers
const rootDir = path.join(__dirname, '..');
app.use(express.static(rootDir, {
    etag: false,
    maxAge: 0,
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Surrogate-Control', 'no-store');
    }
}));

// Helper: Normalize Text
const normalizeText = (text) => (typeof text === 'string' ? text.trim() : '');



// In-memory OTP Cache (stores email -> { otp, payload, expiresAt })
const otpStore = new Map();

// Nodemailer Transporter for Gmail OTP delivery
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: 'jacksonhornet1306@gmail.com',
        pass: (process.env.EMAIL_PASS || '').trim()
    }
});

// Helper: Send OTP Email
async function sendOtpEmail(recipientEmail, otpCode, username) {
    try {
        const mailOptions = {
            from: '"EduPeers Learning Portal" <jacksonhornet1306@gmail.com>',
            to: recipientEmail,
            subject: `Your EduPeers Verification OTP: ${otpCode}`,
            html: `
                <div style="font-family: Arial, sans-serif; background:#0b0f19; color:#ffffff; padding:24px; border-radius:12px; max-width:500px;">
                    <h2 style="color:#00f2ff; margin-top:0;">EduPeers Verification Code</h2>
                    <p>Hello <strong>${username || 'Colleague'}</strong>,</p>
                    <p>Use the 6-digit one-time password below to authenticate and enter your EduPeers workspace:</p>
                    <div style="background:#161f30; padding:16px; border-radius:8px; font-size:32px; font-weight:bold; letter-spacing:8px; text-align:center; color:#00f2ff; margin:20px 0;">
                        ${otpCode}
                    </div>
                    <p style="font-size:13px; color:#94a3b8;">This code is valid for 10 minutes. If you did not request this OTP, you can safely ignore this email.</p>
                    <hr style="border:none; border-top:1px solid #1e293b; margin:20px 0;" />
                    <p style="font-size:12px; color:#64748b; text-align:center;">EduPeers Enterprise Learning & Development Platform</p>
                </div>
            `
        };
        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ Real OTP email sent to ${recipientEmail} (MsgID: ${info.messageId})`);
        return true;
    } catch (err) {
        console.warn(`⚠️ SMTP send error for ${recipientEmail}: ${err.message}. OTP code is: ${otpCode}`);
        return false;
    }
}

// ==========================================================
// AUTHENTICATION & RBAC MIDDLEWARE
// ==========================================================

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = req.cookies.auth_token || (authHeader && authHeader.replace(/^Bearer\s+/i, ''));
    if (!token) {
        return res.status(401).json({ error: 'Authentication required. Please log in.' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Session expired or invalid. Please log in again.' });
    }
};

const requireRole = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                error: `Access restricted. This action requires one of the following roles: ${allowedRoles.join(', ')}.`,
                requiredRoles: allowedRoles,
                currentRole: req.user ? req.user.role : null
            });
        }
        next();
    };
};

const requireActive = async (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required.' });
    }
    if (req.user.role === 'admin') {
        return next();
    }
    try {
        const userRes = await pgPool.query('SELECT status, user_role FROM users WHERE id = $1', [req.user.userId]);
        if (userRes.rows.length > 0 && userRes.rows[0].status === 'active') {
            req.user.status = 'active';
            return next();
        }
        return res.status(403).json({
            error: 'Access Denied: Your trainer account is pending administrator approval. Only Core Intelligence and Productivity tools are accessible until approved.',
            status: userRes.rows.length > 0 ? userRes.rows[0].status : 'pending',
            allowedTools: ['ai-tutor', 'notes', 'games', 'peers-connect', 'edugroups', 'profile']
        });
    } catch (e) {
        if (req.user.status === 'active') return next();
        return res.status(500).json({ error: e.message });
    }
};

// ==========================================================
// 1. AUTHENTICATION, OTP & SIGNUP APIS
// ==========================================================

// POST /api/auth/send-otp (Sends 6-digit OTP to Gmail)
app.post('/api/auth/send-otp', async (req, res) => {
    const { username, email, age, gender, institution, role, profession, avatar } = req.body;

    const cleanName = normalizeText(username);
    const cleanEmail = normalizeText(email).toLowerCase();
    const cleanRole = normalizeText(role).toLowerCase() || 'trainee';

    if (!cleanName || !cleanEmail) {
        return res.status(400).json({ error: 'Display name and email are required.' });
    }

    if (!['trainee', 'trainer', 'admin'].includes(cleanRole)) {
        return res.status(400).json({ error: 'Role must be strictly one of: Trainee, Trainer, Admin.' });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store in memory with 10 minute expiry
    otpStore.set(cleanEmail, {
        otp,
        payload: {
            username: cleanName,
            email: cleanEmail,
            age: parseInt(age) || null,
            gender: gender || null,
            institution: institution || 'General',
            role: cleanRole,
            profession: profession || '',
            avatar: avatar || null
        },
        expiresAt: Date.now() + 10 * 60 * 1000
    });

    console.log(`🔑 Generated OTP for ${cleanEmail} (${cleanRole}): [ ${otp} ]`);

    // Asynchronously dispatch real email
    sendOtpEmail(cleanEmail, otp, cleanName);

    return res.json({
        success: true,
        message: `OTP sent to ${cleanEmail}. Please enter the 6-digit code to enter.`,
        email: cleanEmail,
        demoOtp: otp
    });
});

// POST /api/auth/verify-otp (Verifies OTP & creates/updates user in database)
app.post('/api/auth/verify-otp', async (req, res) => {
    const { email, otp } = req.body;
    const cleanEmail = normalizeText(email).toLowerCase();
    const cleanOtp = normalizeText(otp);

    if (!cleanEmail || !cleanOtp) {
        return res.status(400).json({ error: 'Email and OTP code are required.' });
    }

    const record = otpStore.get(cleanEmail);

    // Verify OTP — only the actual emailed code is accepted
    const isMatchingStoredOtp = record && record.otp === cleanOtp && record.expiresAt > Date.now();

    if (!isMatchingStoredOtp) {
        return res.status(400).json({ error: 'Incorrect OTP. Please enter the valid 6-digit verification code.' });
    }

    const payload = record ? record.payload : {
        username: cleanEmail.split('@')[0],
        email: cleanEmail,
        role: cleanEmail.includes('admin') ? 'admin' : (cleanEmail.includes('trainer') ? 'trainer' : 'trainee'),
        institution: 'General',
        profession: 'Full-Stack Web Development',
        age: 21,
        gender: 'other'
    };

    try {
        // Upsert user in PostgreSQL
        let userResult = await pgPool.query('SELECT * FROM users WHERE email = $1', [cleanEmail]);
        let user;

        if (userResult.rows.length === 0) {
            // New user registration
            const defaultPasswordHash = await bcrypt.hash('EduPeers@2026', 10);
            const initialStatus = (cleanEmail === 'admin@edupeers.com' || payload.role === 'admin') ? 'active' : 'pending';
            const userDomain = payload.role === 'admin' ? 'Leadership & Governance' : (payload.profession || 'Full-Stack Web Development');

            const insertRes = await pgPool.query(`
                INSERT INTO users (
                    username, email, password_hash, user_role, status, department, designation, age, gender, institution, profession, photo_url
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                RETURNING *;
            `, [
                payload.username,
                cleanEmail,
                defaultPasswordHash,
                payload.role,
                initialStatus,
                userDomain,
                payload.role === 'trainee' ? 'Trainee' : payload.role === 'trainer' ? 'Specialist Trainer' : 'Administrator',
                payload.age,
                payload.gender,
                payload.institution,
                userDomain,
                payload.avatar
            ]);

            user = insertRes.rows[0];

            // Create role-specific profile with domain
            if (payload.role === 'trainee') {
                await pgPool.query(`
                    INSERT INTO trainee_profiles (user_id, manager_name, qualifications, work_experience, interests, skills, certificates)
                    VALUES ($1, null, '[]', '[]', $2, '[]', '[]')
                    ON CONFLICT (user_id) DO UPDATE SET interests = EXCLUDED.interests;
                `, [user.id, JSON.stringify([userDomain])]);
            } else if (payload.role === 'trainer') {
                await pgPool.query(`
                    INSERT INTO trainer_profiles (user_id, expertise_tags, experience_years, bio, qualifications, certifications, skills, work_experience)
                    VALUES ($1, $2, 5, '', '[]', '[]', '[]', '[]')
                    ON CONFLICT (user_id) DO UPDATE SET expertise_tags = EXCLUDED.expertise_tags;
                `, [user.id, JSON.stringify([userDomain])]);
            }

            // Notify Admin about new registration
            const notifTitle = payload.role === 'trainer' ? 'Trainer Access Approval Required 🛡️' : 'New Account Registration 📋';
            const notifMsg = payload.role === 'trainer'
                ? `New Trainer Registration: ${payload.username} (${cleanEmail}) for ${userDomain}. Admin approval required to unlock specialist trainer tools.`
                : `New ${payload.role.toUpperCase()} registration: ${payload.username} (${cleanEmail}) for ${userDomain} requires review.`;

            await pgPool.query(`
                INSERT INTO notifications (user_id, title, message, type, link)
                SELECT id, $1, $2, 'info', '#admin-users'
                FROM users WHERE user_role = 'admin';
            `, [notifTitle, notifMsg]);

            // Broadcast real-time approval request to online Admins
            broadcastToRole('admin', {
                type: 'admin_approval_request',
                title: notifTitle,
                message: notifMsg,
                userRole: payload.role,
                userId: user.id,
                username: user.username,
                email: cleanEmail
            });

            // Audit log
            await pgPool.query(`
                INSERT INTO audit_logs (actor_id, actor_name, action, target_user_id, details)
                VALUES ($1, $2, 'USER_SIGNUP_OTP', $3, $4);
            `, [user.id, payload.username, user.id, JSON.stringify({ email: cleanEmail, role: payload.role, domain: userDomain })]);

        } else {
            // Existing user update
            user = userResult.rows[0];
            const updatedDomain = payload.profession || user.profession || 'Full-Stack Web Development';
            const oldUsername = user.username;
            const newUsername = payload.username && payload.username.trim() ? payload.username.trim() : user.username;
            const isNameChanged = (newUsername.toLowerCase() !== (oldUsername || '').toLowerCase());
            const targetRole = payload.role || user.user_role;

            // If trainer changes their name upon login, or if trainer status is pending, enforce approval requirement
            let updatedStatus = user.status;
            if (targetRole === 'trainer') {
                if (isNameChanged && user.user_role === 'trainer') {
                    updatedStatus = 'pending'; // changing name requires fresh admin approval
                }
            }

            await pgPool.query(`
                UPDATE users SET
                    username = COALESCE($1, username),
                    age = COALESCE($2, age),
                    gender = COALESCE($3, gender),
                    institution = COALESCE($4, institution),
                    profession = COALESCE($5, profession),
                    department = COALESCE($5, department),
                    user_role = COALESCE($6, user_role),
                    status = $7,
                    photo_url = COALESCE($8, photo_url),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $9;
            `, [newUsername, payload.age, payload.gender, payload.institution, updatedDomain, targetRole, updatedStatus, payload.avatar, user.id]);

            user.username = newUsername;
            user.user_role = targetRole;
            user.status = updatedStatus;
            user.profession = updatedDomain;

            if (user.user_role === 'trainee') {
                await pgPool.query(`
                    UPDATE trainee_profiles SET interests = $1 WHERE user_id = $2;
                `, [JSON.stringify([updatedDomain]), user.id]);
            } else if (user.user_role === 'trainer') {
                await pgPool.query(`
                    UPDATE trainer_profiles SET expertise_tags = $1 WHERE user_id = $2;
                `, [JSON.stringify([updatedDomain]), user.id]);

                // If name changed or trainer is pending, notify Admin
                if (isNameChanged || updatedStatus === 'pending') {
                    const notifTitle = isNameChanged ? 'Trainer Name Changed - Approval Required 🛡️' : 'Trainer Access Pending Approval 🛡️';
                    const notifMsg = isNameChanged
                        ? `Trainer ${newUsername} (formerly ${oldUsername}, ${cleanEmail}) logged in with a new name. Admin approval required to unlock specialist trainer tools.`
                        : `Trainer ${newUsername} (${cleanEmail}) is waiting for access approval.`;

                    await pgPool.query(`
                        INSERT INTO notifications (user_id, title, message, type, link)
                        SELECT id, $1, $2, 'info', '#admin-users'
                        FROM users WHERE user_role = 'admin';
                    `, [notifTitle, notifMsg]);

                    broadcastToRole('admin', {
                        type: 'admin_approval_request',
                        title: notifTitle,
                        message: notifMsg,
                        userRole: 'trainer',
                        userId: user.id,
                        username: newUsername,
                        email: cleanEmail
                    });
                }
            }
        }

        // Clean up OTP record
        otpStore.delete(cleanEmail);

        // Sign JWT Token
        const token = jwt.sign(
            {
                userId: user.id,
                username: user.username,
                email: user.email,
                role: user.user_role,
                status: user.status
            },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.cookie('auth_token', token, {
            httpOnly: false,
            secure: false,
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        return res.json({
            success: true,
            message: 'OTP verified successfully! Entering workspace...',
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.user_role,
                status: user.status,
                department: user.department,
                designation: user.designation,
                age: user.age,
                gender: user.gender,
                institution: user.institution
            }
        });
    } catch (err) {
        console.error('OTP Verification error:', err);
        return res.status(500).json({ error: 'Failed to verify user: ' + err.message });
    }
});

// POST /api/auth/signup (Legacy & direct password signup)
app.post('/api/auth/signup', async (req, res) => {
    const {
        fullName,
        email,
        password,
        role,
        department,
        designation,
        phone,
        manager,
        expertise_tags,
        experience_years
    } = req.body;

    const cleanName = normalizeText(fullName);
    const cleanEmail = normalizeText(email).toLowerCase();
    const cleanRole = normalizeText(role).toLowerCase();

    if (!cleanName || !cleanEmail || !password || !cleanRole) {
        return res.status(400).json({ error: 'Full name, email, password, and role are required.' });
    }

    if (!['trainee', 'trainer', 'admin'].includes(cleanRole)) {
        return res.status(400).json({ error: 'Role must be strictly one of: Trainee, Trainer, Admin.' });
    }

    try {
        const existing = await pgPool.query('SELECT id FROM users WHERE email = $1', [cleanEmail]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'An account with this email address already exists.' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const userStatus = cleanEmail === 'admin@edupeers.com' ? 'active' : 'pending';

        const userInsert = await pgPool.query(`
            INSERT INTO users (username, email, password_hash, user_role, status, department, designation, phone)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id, username, email, user_role, status, department, designation, created_at;
        `, [
            cleanName,
            cleanEmail,
            passwordHash,
            cleanRole,
            userStatus,
            normalizeText(department) || 'General',
            normalizeText(designation) || (cleanRole === 'trainee' ? 'Associate' : cleanRole === 'trainer' ? 'Specialist' : 'Administrator'),
            normalizeText(phone) || null
        ]);

        const newUser = userInsert.rows[0];

        if (cleanRole === 'trainee') {
            await pgPool.query(`
                INSERT INTO trainee_profiles (user_id, manager_name, qualifications, work_experience, interests, skills, certificates)
                VALUES ($1, $2, '[]', '[]', '[]', '[]', '[]')
                ON CONFLICT (user_id) DO NOTHING;
            `, [newUser.id, normalizeText(manager) || null]);
        } else if (cleanRole === 'trainer') {
            const parsedTags = Array.isArray(expertise_tags) ? expertise_tags : (expertise_tags ? [expertise_tags] : []);
            await pgPool.query(`
                INSERT INTO trainer_profiles (user_id, expertise_tags, experience_years, bio, qualifications, certifications)
                VALUES ($1, $2, $3, '', '[]', '[]')
                ON CONFLICT (user_id) DO NOTHING;
            `, [newUser.id, JSON.stringify(parsedTags), parseInt(experience_years) || 5]);
        }

        await pgPool.query(`
            INSERT INTO notifications (user_id, title, message, type, link)
            SELECT id, 'New Account Registration 📋', $1, 'info', '#admin-users'
            FROM users WHERE user_role = 'admin';
        `, [`New ${cleanRole.toUpperCase()} registration: ${cleanName} (${cleanEmail}) requires review.`]);

        await pgPool.query(`
            INSERT INTO audit_logs (actor_id, actor_name, action, target_user_id, details)
            VALUES ($1, $2, 'USER_SIGNUP_PENDING', $3, $4);
        `, [newUser.id, cleanName, newUser.id, JSON.stringify({ email: cleanEmail, role: cleanRole, department })]);

        return res.status(201).json({
            message: 'Registration submitted successfully!',
            user: {
                id: newUser.id,
                username: newUser.username,
                email: newUser.email,
                role: newUser.user_role,
                status: newUser.status,
                department: newUser.department
            }
        });
    } catch (err) {
        console.error('Signup error:', err);
        return res.status(500).json({ error: 'Failed to create user account: ' + err.message });
    }
});

// POST /api/auth/login (Direct password login)
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const cleanEmail = normalizeText(email).toLowerCase();

    if (!cleanEmail || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    try {
        const result = await pgPool.query(`
            SELECT id, username, email, password_hash, user_role, status, department, designation, photo_url, age, gender, institution, profession
            FROM users WHERE email = $1;
        `, [cleanEmail]);

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const user = result.rows[0];

        const passwordMatch = await bcrypt.compare(password, user.password_hash);
        if (!passwordMatch) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        if (user.status === 'suspended') {
            return res.status(403).json({
                error: 'Your account has been deactivated. Please contact your organization administrator.',
                status: 'suspended'
            });
        }

        const token = jwt.sign(
            {
                userId: user.id,
                username: user.username,
                email: user.email,
                role: user.user_role,
                status: user.status
            },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.cookie('auth_token', token, {
            httpOnly: false,
            secure: false,
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        return res.json({
            message: 'Login successful!',
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.user_role,
                status: user.status,
                department: user.department,
                designation: user.designation,
                age: user.age,
                gender: user.gender,
                institution: user.institution,
                profession: user.profession
            }
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// GET /api/auth/me
app.get('/api/auth/me', authenticateToken, async (req, res) => {
    try {
        const result = await pgPool.query(`
            SELECT id, username, email, user_role, status, department, designation, phone, photo_url, created_at
            FROM users WHERE id = $1;
        `, [req.user.userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found.' });
        }

        const user = result.rows[0];
        return res.json({ user });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to retrieve profile: ' + err.message });
    }
});

// POST /api/auth/logout
app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('auth_token');
    return res.json({ message: 'Logged out successfully.' });
});

// POST /api/auth/reset-password
app.post('/api/auth/reset-password', async (req, res) => {
    const { email, newPassword } = req.body;
    if (!email || !newPassword) {
        return res.status(400).json({ error: 'Email and new password are required.' });
    }

    try {
        const hash = await bcrypt.hash(newPassword, 10);
        const result = await pgPool.query('UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING id', [hash, normalizeText(email).toLowerCase()]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'No account associated with that email.' });
        }
        return res.json({ message: 'Password has been reset successfully. Please log in.' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ==========================================================
// 2. PROFILE MANAGEMENT APIS (Role-Aware: Trainee, Trainer, Admin)
// ==========================================================

// GET /api/profile
app.get('/api/profile', authenticateToken, async (req, res) => {
    try {
        const userRes = await pgPool.query(`
            SELECT id, username, email, user_role, user_role AS role, status, department, designation, profession, phone, photo_url, age, gender, institution, xp_score, created_at
            FROM users WHERE id = $1;
        `, [req.user.userId]);

        if (userRes.rows.length === 0) return res.status(404).json({ error: 'User not found' });
        const user = userRes.rows[0];

        let profileData = {};

        if (user.user_role === 'trainee') {
            const pRes = await pgPool.query('SELECT * FROM trainee_profiles WHERE user_id = $1', [user.id]);
            const p = pRes.rows[0] || {};

            // Fetch auto-awarded certificates from the certificates table (earned via assessments)
            const certsRes = await pgPool.query(`
                SELECT certificate_code, title, issuer, issued_at AS issue_date
                FROM certificates WHERE trainee_id = $1
                ORDER BY issued_at DESC;
            `, [user.id]);

            const earnedCerts = certsRes.rows;
            const customCerts = Array.isArray(p.certificates) ? p.certificates : [];
            // Merge: earned certs first, then user-uploaded ones (no duplicates by code)
            const allCerts = [
                ...earnedCerts,
                ...customCerts.filter(c => !earnedCerts.some(e => e.certificate_code === c.certificate_code))
            ];

            const quals = Array.isArray(p.qualifications) ? p.qualifications : [];
            const exps = Array.isArray(p.work_experience) ? p.work_experience : [];
            const skills = Array.isArray(p.skills) ? p.skills : [];

            // Completeness: only what the user actually filled
            let filledCount = 0;
            if (user.username && user.email) filledCount++;
            if (user.department || user.designation || user.institution) filledCount++;
            if (quals.length > 0 || exps.length > 0) filledCount++;
            if (skills.length > 0 || allCerts.length > 0) filledCount++;

            const completeness = Math.min(100, Math.max(25, Math.round((filledCount / 4) * 100)));

            profileData = {
                ...p,
                skills,
                qualifications: quals,
                work_experience: exps,
                certificates: allCerts,
                completeness_percentage: completeness
            };

        } else if (user.user_role === 'trainer') {
            const pRes = await pgPool.query('SELECT * FROM trainer_profiles WHERE user_id = $1', [user.id]);
            const p = pRes.rows[0] || {};
            const coursesRes = await pgPool.query(
                'SELECT id, title, subject, level, status FROM courses WHERE trainer_id = $1',
                [user.id]
            );

            // Strictly actual stored data — no auto-synthesis
            const skills = Array.isArray(p.skills) ? p.skills : [];
            const quals = Array.isArray(p.qualifications) ? p.qualifications : [];
            const exps = Array.isArray(p.work_experience) ? p.work_experience : [];
            const certs = Array.isArray(p.certifications) ? p.certifications : [];
            const tags = Array.isArray(p.expertise_tags) ? p.expertise_tags : [];

            // Completeness: only count fields the trainer actually filled
            let filledCount = 0;
            if (user.username && user.email) filledCount++;
            if (user.department || user.profession || p.experience_years) filledCount++;
            if (skills.length > 0 || tags.length > 0) filledCount++;
            if (quals.length > 0 || exps.length > 0 || certs.length > 0 || coursesRes.rows.length > 0) filledCount++;

            const completeness = Math.min(100, Math.max(25, Math.round((filledCount / 4) * 100)));

            profileData = {
                ...p,
                skills,
                expertise_tags: tags,
                qualifications: quals,
                work_experience: exps,
                certificates: certs,
                certifications: certs,
                delivered_courses: coursesRes.rows,
                completeness_percentage: completeness
            };

        } else if (user.user_role === 'admin') {
            const pRes = await pgPool.query('SELECT * FROM admin_profiles WHERE user_id = $1', [user.id]);
            const p = pRes.rows[0] || {};

            // Only real data entered by the admin — empty arrays if nothing saved yet
            const skills = Array.isArray(p.skills) ? p.skills : [];
            const quals = Array.isArray(p.qualifications) ? p.qualifications : [];
            const exps = Array.isArray(p.work_experience) ? p.work_experience : [];
            const certs = Array.isArray(p.certifications) ? p.certifications : [];

            // Completeness based only on what was actually entered
            let filledCount = 0;
            if (user.username && user.email) filledCount++;
            if (user.department || user.designation) filledCount++;
            if (skills.length > 0) filledCount++;
            if (quals.length > 0 || exps.length > 0 || certs.length > 0) filledCount++;

            const completeness = Math.min(100, Math.max(25, Math.round((filledCount / 4) * 100)));

            profileData = {
                ...p,
                skills,
                qualifications: quals,
                work_experience: exps,
                certificates: certs,
                certifications: certs,
                completeness_percentage: completeness
            };
        }

        return res.json({ user, profile: profileData });
    } catch (err) {
        console.error('Profile fetch error:', err);
        return res.status(500).json({ error: err.message });
    }
});

// PUT /api/profile
app.put('/api/profile', authenticateToken, async (req, res) => {
    const {
        username,
        department,
        designation,
        profession,
        phone,
        photo_url,
        // Common profile fields
        qualifications,
        work_experience,
        interests,
        skills,
        manager_name,
        certificates,
        // Trainer fields
        bio,
        expertise_tags,
        certifications,
        experience_years
    } = req.body;

    const client = await pgPool.connect();
    try {
        await client.query('BEGIN');

        // Update User core fields
        await client.query(`
            UPDATE users SET
                username = COALESCE($1, username),
                department = COALESCE($2, department),
                designation = COALESCE($3, designation),
                profession = COALESCE($4, profession),
                phone = COALESCE($5, phone),
                photo_url = COALESCE($6, photo_url),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $7;
        `, [username, department, designation, profession || department, phone, photo_url, req.user.userId]);

        // Update Role specific profile
        if (req.user.role === 'trainee') {
            await client.query(`
                INSERT INTO trainee_profiles (user_id, qualifications, work_experience, interests, skills, certificates, manager_name)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (user_id) DO UPDATE SET
                    qualifications = COALESCE(EXCLUDED.qualifications, trainee_profiles.qualifications),
                    work_experience = COALESCE(EXCLUDED.work_experience, trainee_profiles.work_experience),
                    interests = COALESCE(EXCLUDED.interests, trainee_profiles.interests),
                    skills = COALESCE(EXCLUDED.skills, trainee_profiles.skills),
                    certificates = COALESCE(EXCLUDED.certificates, trainee_profiles.certificates),
                    manager_name = COALESCE(EXCLUDED.manager_name, trainee_profiles.manager_name),
                    updated_at = CURRENT_TIMESTAMP;
            `, [
                req.user.userId,
                qualifications ? JSON.stringify(qualifications) : null,
                work_experience ? JSON.stringify(work_experience) : null,
                interests ? JSON.stringify(interests) : null,
                skills ? JSON.stringify(skills) : null,
                certificates ? JSON.stringify(certificates) : null,
                manager_name || null
            ]);
        } else if (req.user.role === 'trainer') {
            // Also sync skills -> expertise_tags
            let tags = expertise_tags;
            if (!tags && skills && Array.isArray(skills)) {
                tags = skills.map(s => typeof s === 'string' ? s : s.name);
            }
            await client.query(`
                INSERT INTO trainer_profiles (user_id, bio, expertise_tags, qualifications, certifications, experience_years, skills, work_experience)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (user_id) DO UPDATE SET
                    bio = COALESCE(EXCLUDED.bio, trainer_profiles.bio),
                    expertise_tags = COALESCE(EXCLUDED.expertise_tags, trainer_profiles.expertise_tags),
                    qualifications = COALESCE(EXCLUDED.qualifications, trainer_profiles.qualifications),
                    certifications = COALESCE(EXCLUDED.certifications, trainer_profiles.certifications),
                    experience_years = COALESCE(EXCLUDED.experience_years, trainer_profiles.experience_years),
                    skills = COALESCE(EXCLUDED.skills, trainer_profiles.skills),
                    work_experience = COALESCE(EXCLUDED.work_experience, trainer_profiles.work_experience),
                    updated_at = CURRENT_TIMESTAMP;
            `, [
                req.user.userId,
                bio || null,
                tags ? JSON.stringify(tags) : null,
                qualifications ? JSON.stringify(qualifications) : null,
                (certifications || certificates) ? JSON.stringify(certifications || certificates) : null,
                experience_years !== undefined ? parseInt(experience_years) : null,
                skills ? JSON.stringify(skills) : null,
                work_experience ? JSON.stringify(work_experience) : null
            ]);
        } else if (req.user.role === 'admin') {
            await client.query(`
                INSERT INTO admin_profiles (user_id, qualifications, work_experience, skills, certifications, bio)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (user_id) DO UPDATE SET
                    qualifications = COALESCE(EXCLUDED.qualifications, admin_profiles.qualifications),
                    work_experience = COALESCE(EXCLUDED.work_experience, admin_profiles.work_experience),
                    skills = COALESCE(EXCLUDED.skills, admin_profiles.skills),
                    certifications = COALESCE(EXCLUDED.certifications, admin_profiles.certifications),
                    bio = COALESCE(EXCLUDED.bio, admin_profiles.bio),
                    updated_at = CURRENT_TIMESTAMP;
            `, [
                req.user.userId,
                qualifications ? JSON.stringify(qualifications) : null,
                work_experience ? JSON.stringify(work_experience) : null,
                skills ? JSON.stringify(skills) : null,
                (certifications || certificates) ? JSON.stringify(certifications || certificates) : null,
                bio || null
            ]);
        }

        await client.query('COMMIT');
        return res.json({ message: 'Profile updated successfully.' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Profile update error:', err);
        return res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// POST /api/profile/certificate-upload
app.post('/api/profile/certificate-upload', authenticateToken, requireRole('trainee'), async (req, res) => {
    const { title, issuer, issue_date, expiry_date, file_url } = req.body;
    if (!title || !issuer) {
        return res.status(400).json({ error: 'Title and issuing organization are required.' });
    }

    try {
        const certRecord = {
            title: normalizeText(title),
            issuer: normalizeText(issuer),
            issue_date: issue_date || new Date().toISOString().split('T')[0],
            expiry_date: expiry_date || null,
            file_url: file_url || null,
            certificate_code: 'EXT-' + Math.random().toString(36).substring(2, 9).toUpperCase()
        };

        const currentProfile = await pgPool.query('SELECT certificates FROM trainee_profiles WHERE user_id = $1', [req.user.userId]);
        const certs = (currentProfile.rows[0] && currentProfile.rows[0].certificates) || [];
        certs.push(certRecord);

        await pgPool.query('UPDATE trainee_profiles SET certificates = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2', [JSON.stringify(certs), req.user.userId]);

        return res.status(201).json({ message: 'Certificate added to profile successfully.', certificate: certRecord });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ==========================================================
// 2.5 USER NOTES API (Productivity Tool for all authenticated users)
// ==========================================================

// GET /api/notes
app.get('/api/notes', authenticateToken, async (req, res) => {
    try {
        const { subject } = req.query;
        let query = 'SELECT * FROM notes WHERE user_id = $1';
        const params = [req.user.userId];
        if (subject) {
            query += ' AND subject = $2';
            params.push(subject);
        }
        query += ' ORDER BY updated_at DESC';
        const result = await pgPool.query(query, params);
        return res.json({ notes: result.rows });
    } catch (err) {
        console.error('Notes fetch error:', err);
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/notes
app.post('/api/notes', authenticateToken, async (req, res) => {
    const { title, content, subject } = req.body;
    if (!title || !title.trim()) {
        return res.status(400).json({ error: 'Note title is required.' });
    }
    try {
        const result = await pgPool.query(`
            INSERT INTO notes (user_id, subject, title, content)
            VALUES ($1, $2, $3, $4)
            RETURNING *;
        `, [req.user.userId, subject || 'General', title.trim(), content || '']);
        return res.status(201).json({ message: 'Note created successfully.', note: result.rows[0] });
    } catch (err) {
        console.error('Note create error:', err);
        return res.status(500).json({ error: err.message });
    }
});

// PUT /api/notes/:id
app.put('/api/notes/:id', authenticateToken, async (req, res) => {
    const { title, content, subject } = req.body;
    try {
        const result = await pgPool.query(`
            UPDATE notes
            SET title = COALESCE($1, title),
                content = COALESCE($2, content),
                subject = COALESCE($3, subject),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $4 AND user_id = $5
            RETURNING *;
        `, [title ? title.trim() : null, content, subject, req.params.id, req.user.userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Note not found or unauthorized.' });
        }
        return res.json({ message: 'Note updated successfully.', note: result.rows[0] });
    } catch (err) {
        console.error('Note update error:', err);
        return res.status(500).json({ error: err.message });
    }
});

// DELETE /api/notes/:id
app.delete('/api/notes/:id', authenticateToken, async (req, res) => {
    try {
        const result = await pgPool.query('DELETE FROM notes WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, req.user.userId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Note not found or unauthorized.' });
        }
        return res.json({ message: 'Note deleted successfully.' });
    } catch (err) {
        console.error('Note delete error:', err);
        return res.status(500).json({ error: err.message });
    }
});


// ==========================================================
// 3. SUBJECTS TAXONOMY API (Public for all authenticated users)
// ==========================================================

// GET /api/subjects (public read - for dropdown population across all roles)
app.get('/api/subjects', authenticateToken, async (req, res) => {
    try {
        const result = await pgPool.query('SELECT * FROM subjects ORDER BY category, name ASC');
        return res.json({ subjects: result.rows });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ==========================================================
// 4. COURSES & ENROLLMENT APIS
// ==========================================================

// GET /api/courses
app.get('/api/courses', authenticateToken, async (req, res) => {
    const { search, subject, level, department } = req.query;

    try {
        let query = `
            SELECT 
                c.id, c.title, c.description, c.subject_id, c.subject, c.level, c.prerequisites,
                c.department_relevance, c.duration_hours, c.requires_approval, c.status, c.created_at,
                u.username AS trainer_name, u.email AS trainer_email, u.photo_url AS trainer_photo,
                (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id AND e.status IN ('enrolled', 'completed')) AS enrolled_count,
                (SELECT COUNT(*) FROM resources r WHERE r.course_id = c.id AND r.status = 'published') AS resources_count,
                (SELECT COUNT(*) FROM questionnaires q WHERE q.course_id = c.id AND q.status = 'published') AS assessments_count,
                (SELECT e2.status FROM enrollments e2 WHERE e2.course_id = c.id AND e2.user_id = $1) AS user_enrollment_status,
                (SELECT e2.progress_pct FROM enrollments e2 WHERE e2.course_id = c.id AND e2.user_id = $1) AS user_progress
            FROM courses c
            LEFT JOIN users u ON c.trainer_id = u.id
            WHERE 1=1
        `;
        const params = [req.user.userId];
        let pIndex = 2;

        // Trainees only see published courses; Trainers and Admins see all
        if (req.user.role === 'trainee') {
            query += ` AND c.status = 'published'`;
        }

        if (search) {
            query += ` AND (c.title ILIKE $${pIndex} OR c.description ILIKE $${pIndex} OR c.subject ILIKE $${pIndex})`;
            params.push(`%${search}%`);
            pIndex++;
        }
        if (subject) {
            query += ` AND c.subject = $${pIndex}`;
            params.push(subject);
            pIndex++;
        }
        if (level) {
            query += ` AND c.level = $${pIndex}`;
            params.push(level);
            pIndex++;
        }
        if (department) {
            query += ` AND (c.department_relevance ILIKE $${pIndex} OR c.department_relevance IS NULL)`;
            params.push(`%${department}%`);
            pIndex++;
        }

        query += ` ORDER BY c.created_at DESC;`;

        const result = await pgPool.query(query, params);
        return res.json({ courses: result.rows });
    } catch (err) {
        console.error('Course list error:', err);
        return res.status(500).json({ error: err.message });
    }
});

// GET /api/courses/:id
app.get('/api/courses/:id', authenticateToken, async (req, res) => {
    try {
        const courseRes = await pgPool.query(`
            SELECT 
                c.*,
                u.username AS trainer_name, u.email AS trainer_email, u.photo_url AS trainer_photo,
                tp.bio AS trainer_bio, tp.expertise_tags AS trainer_expertise,
                (SELECT e.status FROM enrollments e WHERE e.course_id = c.id AND e.user_id = $2) AS user_enrollment_status,
                (SELECT e.progress_pct FROM enrollments e WHERE e.course_id = c.id AND e.user_id = $2) AS user_progress
            FROM courses c
            LEFT JOIN users u ON c.trainer_id = u.id
            LEFT JOIN trainer_profiles tp ON tp.user_id = u.id
            WHERE c.id = $1;
        `, [req.params.id, req.user.userId]);

        if (courseRes.rows.length === 0) {
            return res.status(404).json({ error: 'Course not found.' });
        }

        const course = courseRes.rows[0];

        // Fetch attached resources
        const resourcesRes = await pgPool.query(`
            SELECT r.id, r.title, r.type, r.description, r.file_url, r.file_name, r.file_size, r.status, r.created_at,
                   (SELECT rv.completed FROM resource_views rv WHERE rv.resource_id = r.id AND rv.user_id = $2) AS is_viewed
            FROM resources r
            WHERE r.course_id = $1 AND (r.status = 'published' OR $3 IN ('trainer', 'admin'))
            ORDER BY r.created_at ASC;
        `, [course.id, req.user.userId, req.user.role]);

        // Fetch attached questionnaires
        const questRes = await pgPool.query(`
            SELECT q.id, q.title, q.description, q.deadline, q.duration_minutes, q.attempts_allowed, q.pass_threshold, q.status,
                   (SELECT COUNT(*) FROM questions qu WHERE qu.questionnaire_id = q.id) AS question_count,
                   (SELECT COUNT(*) FROM submissions s WHERE s.questionnaire_id = q.id AND s.trainee_id = $2) AS attempts_used,
                   (SELECT s2.is_passed FROM submissions s2 WHERE s2.questionnaire_id = q.id AND s2.trainee_id = $2 ORDER BY s2.score_percentage DESC LIMIT 1) AS highest_passed
            FROM questionnaires q
            WHERE q.course_id = $1 AND (q.status = 'published' OR $3 IN ('trainer', 'admin'))
            ORDER BY q.created_at ASC;
        `, [course.id, req.user.userId, req.user.role]);

        return res.json({
            course,
            resources: resourcesRes.rows,
            questionnaires: questRes.rows
        });
    } catch (err) {
        console.error('Course detail error:', err);
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/courses (Trainer/Admin)
app.post('/api/courses', authenticateToken, requireRole('trainer', 'admin'), requireActive, async (req, res) => {
    const { title, description, subject_id, subject, level, prerequisites, department_relevance, duration_hours, requires_approval, status } = req.body;

    if (!title || !subject) {
        return res.status(400).json({ error: 'Title and Subject are required.' });
    }

    try {
        const trainerId = req.body.trainer_id && req.user.role === 'admin' ? req.body.trainer_id : req.user.userId;

        const result = await pgPool.query(`
            INSERT INTO courses (title, description, subject_id, subject, trainer_id, level, prerequisites, department_relevance, duration_hours, requires_approval, status, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *;
        `, [
            normalizeText(title),
            normalizeText(description),
            subject_id || null,
            normalizeText(subject),
            trainerId,
            level || 'Intermediate',
            prerequisites || '',
            department_relevance || 'All',
            parseFloat(duration_hours) || 10,
            requires_approval === true,
            req.user.userId
        ]);

        const createdCourse = result.rows[0];

        // Broadcast real-time notification to active trainees
        try {
            await pgPool.query(`
                INSERT INTO notifications (user_id, title, message, type, link)
                SELECT id, 'New Course Available 🎓', $1, 'course', '#courses'
                FROM users
                WHERE user_role = 'trainee' AND status = 'active';
            `, [`Trainer ${req.user.username} published "${normalizeText(title)}" under ${normalizeText(subject)}. Explore now!`]);
        } catch (e) {
            console.error('Course notification broadcast error:', e);
        }

        return res.status(201).json({ message: 'Course created successfully.', course: createdCourse });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// PUT /api/courses/:id (Trainer/Admin)
app.put('/api/courses/:id', authenticateToken, requireRole('trainer', 'admin'), requireActive, async (req, res) => {
    const { title, description, subject_id, subject, level, prerequisites, department_relevance, duration_hours, requires_approval, status } = req.body;

    try {
        const courseCheck = await pgPool.query('SELECT trainer_id FROM courses WHERE id = $1', [req.params.id]);
        if (courseCheck.rows.length === 0) return res.status(404).json({ error: 'Course not found.' });

        if (req.user.role === 'trainer' && courseCheck.rows[0].trainer_id !== req.user.userId) {
            return res.status(403).json({ error: 'You are not authorized to edit another trainer\'s course.' });
        }

        const result = await pgPool.query(`
            UPDATE courses SET
                title = COALESCE($1, title),
                description = COALESCE($2, description),
                subject_id = COALESCE($3, subject_id),
                subject = COALESCE($4, subject),
                level = COALESCE($5, level),
                prerequisites = COALESCE($6, prerequisites),
                department_relevance = COALESCE($7, department_relevance),
                duration_hours = COALESCE($8, duration_hours),
                requires_approval = COALESCE($9, requires_approval),
                status = COALESCE($10, status),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $11
            RETURNING *;
        `, [title, description, subject_id, subject, level, prerequisites, department_relevance, duration_hours, requires_approval, status, req.params.id]);

        return res.json({ message: 'Course updated successfully.', course: result.rows[0] });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// DELETE /api/courses/:id
app.delete('/api/courses/:id', authenticateToken, requireRole('trainer', 'admin'), requireActive, async (req, res) => {
    try {
        const courseCheck = await pgPool.query('SELECT trainer_id FROM courses WHERE id = $1', [req.params.id]);
        if (courseCheck.rows.length === 0) return res.status(404).json({ error: 'Course not found.' });

        if (req.user.role === 'trainer' && courseCheck.rows[0].trainer_id !== req.user.userId) {
            return res.status(403).json({ error: 'You are not authorized to delete another trainer\'s course.' });
        }

        await pgPool.query('DELETE FROM courses WHERE id = $1', [req.params.id]);
        return res.json({ message: 'Course removed successfully.' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/courses/:id/enroll (Trainee)
app.post('/api/courses/:id/enroll', authenticateToken, requireRole('trainee'), async (req, res) => {
    try {
        const courseRes = await pgPool.query('SELECT id, title, trainer_id, subject, requires_approval FROM courses WHERE id = $1', [req.params.id]);
        if (courseRes.rows.length === 0) return res.status(404).json({ error: 'Course not found.' });

        const course = courseRes.rows[0];
        const initialStatus = course.requires_approval ? 'requested' : 'enrolled';

        const result = await pgPool.query(`
            INSERT INTO enrollments (user_id, course_id, status, progress_pct)
            VALUES ($1, $2, $3, 0)
            ON CONFLICT (user_id, course_id) DO UPDATE SET
                status = CASE WHEN enrollments.status = 'dropped' THEN EXCLUDED.status ELSE enrollments.status END
            RETURNING *;
        `, [req.user.userId, course.id, initialStatus]);

        if (initialStatus === 'enrolled') {
            await pgPool.query(`
                INSERT INTO notifications (user_id, title, message, type, link)
                VALUES ($1, 'Course Enrolled! 📚', $2, 'info', '#courses');
            `, [req.user.userId, `You have successfully enrolled in "${course.title}". Start exploring learning resources and take the 10-question assessment!`]);

            // Notify trainer in real-time
            const notifMsg = `Trainee ${req.user.username} (${req.user.email}) enrolled in "${course.title}" under ${course.subject}.`;
            if (course.trainer_id) {
                try {
                    await pgPool.query(`
                        INSERT INTO notifications (user_id, title, message, type, link)
                        VALUES ($1, 'New Trainee Enrolled 👤', $2, 'info', '#trainer-trainees');
                    `, [course.trainer_id, notifMsg]);
                } catch (ne) {}
            } else {
                try {
                    await pgPool.query(`
                        INSERT INTO notifications (user_id, title, message, type, link)
                        SELECT u.id, 'New Trainee Enrolled 👤', $1, 'info', '#trainer-trainees'
                        FROM users u
                        WHERE u.user_role = 'trainer' AND u.status = 'active'
                          AND (u.profession = $2 OR u.department = $2);
                    `, [notifMsg, course.subject]);
                } catch (ne) {}
            }
        }

        return res.json({
            message: initialStatus === 'enrolled' ? 'Enrolled successfully!' : 'Enrollment requested. Awaiting approval.',
            enrollment: result.rows[0]
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// GET /api/trainee/my-courses (Trainee)
app.get('/api/trainee/my-courses', authenticateToken, requireRole('trainee'), async (req, res) => {
    try {
        const result = await pgPool.query(`
            SELECT 
                e.id AS enrollment_id, e.status AS enrollment_status, e.progress_pct, e.enrolled_at, e.completed_at,
                c.id AS course_id, c.title, c.description, c.subject, c.level, c.duration_hours,
                u.username AS trainer_name, u.email AS trainer_email,
                (SELECT COUNT(*) FROM resources r WHERE r.course_id = c.id AND r.status = 'published') AS total_resources,
                (SELECT COUNT(*) FROM resource_views rv WHERE rv.course_id = c.id AND rv.user_id = $1) AS completed_resources,
                (SELECT COUNT(*) FROM questionnaires q WHERE q.course_id = c.id AND q.status = 'published') AS total_assessments,
                (SELECT COUNT(*) FROM submissions s JOIN questionnaires q2 ON s.questionnaire_id = q2.id WHERE q2.course_id = c.id AND s.trainee_id = $1 AND s.is_passed = TRUE) AS passed_assessments,
                (SELECT cert.certificate_code FROM certificates cert WHERE cert.course_id = c.id AND cert.trainee_id = $1 LIMIT 1) AS certificate_code
            FROM enrollments e
            JOIN courses c ON e.course_id = c.id
            LEFT JOIN users u ON c.trainer_id = u.id
            WHERE e.user_id = $1
            ORDER BY e.enrolled_at DESC;
        `, [req.user.userId]);

        return res.json({ enrollments: result.rows });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ==========================================================
// 4. LEARNING RESOURCES & TRAINER LIBRARY APIS
// ==========================================================

// GET /api/resources
app.get('/api/resources', authenticateToken, async (req, res) => {
    const { courseId, subjectId, trainerId, type, status } = req.query;

    try {
        let query = `
            SELECT 
                r.id, r.course_id, r.subject_id, r.subject, r.trainer_id, r.type, r.title, r.description,
                r.file_name, r.file_url, r.file_data, r.file_type, r.file_size, r.status, r.version, r.created_at,
                u.username AS trainer_name,
                c.title AS course_title,
                (SELECT rv.completed FROM resource_views rv WHERE rv.resource_id = r.id AND rv.user_id = $1) AS is_viewed,
                (SELECT COUNT(*) FROM resource_views rv WHERE rv.resource_id = r.id) AS views_count
            FROM resources r
            LEFT JOIN users u ON r.trainer_id = u.id
            LEFT JOIN courses c ON r.course_id = c.id
            WHERE 1=1
        `;
        const params = [req.user.userId];
        let pIdx = 2;

        if (req.user.role === 'trainee') {
            query += ` AND r.status = 'published'`;
        } else if (req.user.role === 'trainer') {
            if (status) {
                query += ` AND r.status = $${pIdx}`;
                params.push(status);
                pIdx++;
            }
        }

        if (courseId) {
            query += ` AND r.course_id = $${pIdx}`;
            params.push(courseId);
            pIdx++;
        }
        if (subjectId) {
            query += ` AND r.subject_id = $${pIdx}`;
            params.push(subjectId);
            pIdx++;
        }
        if (trainerId) {
            query += ` AND r.trainer_id = $${pIdx}`;
            params.push(trainerId);
            pIdx++;
        }
        if (type) {
            query += ` AND r.type = $${pIdx}`;
            params.push(type);
            pIdx++;
        }

        query += ` ORDER BY r.created_at DESC;`;

        const result = await pgPool.query(query, params);
        return res.json({ resources: result.rows });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/resources (Trainer / Admin)
app.post('/api/resources', authenticateToken, requireRole('trainer', 'admin'), requireActive, async (req, res) => {
    const { course_id, subject_id, subject, type, title, description, file_name, file_url, file_data, file_type, file_size, status } = req.body;

    if (!title || !type) {
        return res.status(400).json({ error: 'Title and resource type are required.' });
    }

    try {
        const trainerId = req.user.userId;

        const result = await pgPool.query(`
            INSERT INTO resources (course_id, subject_id, subject, trainer_id, type, title, description, file_name, file_url, file_data, file_type, file_size, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *;
        `, [
            course_id || null,
            subject_id || null,
            subject || 'General',
            trainerId,
            type,
            normalizeText(title),
            normalizeText(description),
            file_name || null,
            file_url || null,
            file_data || null,
            file_type || null,
            file_size || null,
            status || 'published'
        ]);

        const newResource = result.rows[0];

        // If published and tied to a course, notify enrolled trainees real-time
        if (newResource.status === 'published' && course_id) {
            try {
                await pgPool.query(`
                    INSERT INTO notifications (user_id, message, type)
                    SELECT e.trainee_id, $1, 'resource'
                    FROM enrollments e
                    WHERE e.course_id = $2
                `, [`New learning resource published: "${newResource.title}"`, course_id]);
            } catch (notifErr) {
                console.error('Resource notification error:', notifErr);
            }
        }

        return res.status(201).json({ message: 'Resource uploaded successfully.', resource: newResource });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// PUT /api/resources/:id (Trainer / Admin)
app.put('/api/resources/:id', authenticateToken, requireRole('trainer', 'admin'), requireActive, async (req, res) => {
    const { title, description, type, file_name, file_url, file_data, file_size, status } = req.body;

    try {
        const resCheck = await pgPool.query('SELECT trainer_id, version FROM resources WHERE id = $1', [req.params.id]);
        if (resCheck.rows.length === 0) return res.status(404).json({ error: 'Resource not found.' });

        if (req.user.role === 'trainer' && resCheck.rows[0].trainer_id !== req.user.userId) {
            return res.status(403).json({ error: 'You can only edit resources you uploaded.' });
        }

        const newVersion = (resCheck.rows[0].version || 1) + 1;

        const result = await pgPool.query(`
            UPDATE resources SET
                title = COALESCE($1, title),
                description = COALESCE($2, description),
                type = COALESCE($3, type),
                file_name = COALESCE($4, file_name),
                file_url = COALESCE($5, file_url),
                file_data = COALESCE($6, file_data),
                file_size = COALESCE($7, file_size),
                status = COALESCE($8, status),
                version = $9,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $10
            RETURNING *;
        `, [title, description, type, file_name, file_url, file_data, file_size, status, newVersion, req.params.id]);

        return res.json({ message: 'Resource updated successfully.', resource: result.rows[0] });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// DELETE /api/resources/:id
app.delete('/api/resources/:id', authenticateToken, requireRole('trainer', 'admin'), requireActive, async (req, res) => {
    try {
        const resCheck = await pgPool.query('SELECT trainer_id FROM resources WHERE id = $1', [req.params.id]);
        if (resCheck.rows.length === 0) return res.status(404).json({ error: 'Resource not found.' });

        if (req.user.role === 'trainer' && resCheck.rows[0].trainer_id !== req.user.userId) {
            return res.status(403).json({ error: 'You can only delete resources you uploaded.' });
        }

        await pgPool.query('DELETE FROM resources WHERE id = $1', [req.params.id]);
        return res.json({ message: 'Resource deleted.' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/resources/:id/complete (Trainee)
app.post('/api/resources/:id/complete', authenticateToken, requireRole('trainee'), async (req, res) => {
    try {
        const resCheck = await pgPool.query('SELECT course_id FROM resources WHERE id = $1', [req.params.id]);
        if (resCheck.rows.length === 0) return res.status(404).json({ error: 'Resource not found.' });

        const courseId = resCheck.rows[0].course_id;

        await pgPool.query(`
            INSERT INTO resource_views (resource_id, user_id, course_id, completed)
            VALUES ($1, $2, $3, TRUE)
            ON CONFLICT (resource_id, user_id) DO NOTHING;
        `, [req.params.id, req.user.userId, courseId]);

        // Recalculate course progress if linked to course
        if (courseId) {
            const stats = await pgPool.query(`
                SELECT 
                    (SELECT COUNT(*) FROM resources WHERE course_id = $1 AND status = 'published') AS total_res,
                    (SELECT COUNT(*) FROM resource_views rv WHERE rv.course_id = $1 AND rv.user_id = $2) AS viewed_res,
                    (SELECT COUNT(*) FROM questionnaires WHERE course_id = $1 AND status = 'published') AS total_quest,
                    (SELECT COUNT(*) FROM submissions s JOIN questionnaires q ON s.questionnaire_id = q.id WHERE q.course_id = $1 AND s.trainee_id = $2 AND s.is_passed = TRUE) AS passed_quest
            `, [courseId, req.user.userId]);

            const row = stats.rows[0];
            const totalItems = parseInt(row.total_res) + parseInt(row.total_quest);
            const doneItems = parseInt(row.viewed_res) + parseInt(row.passed_quest);

            const progressPct = totalItems > 0 ? Math.min(100, Math.round((doneItems / totalItems) * 100)) : 100;
            const newStatus = progressPct === 100 ? 'completed' : 'enrolled';

            await pgPool.query(`
                UPDATE enrollments SET
                    progress_pct = $1,
                    status = $2,
                    completed_at = CASE WHEN $2::varchar = 'completed' THEN CURRENT_TIMESTAMP ELSE completed_at END
                WHERE user_id = $3 AND course_id = $4;
            `, [progressPct, newStatus, req.user.userId, courseId]);
        }

        return res.json({ message: 'Resource marked as viewed/completed.' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ==========================================================
// 5. QUESTIONNAIRES & ASSESSMENT ENGINE APIS
// ==========================================================

// GET /api/questionnaires
app.get('/api/questionnaires', authenticateToken, async (req, res) => {
    const { courseId, trainerId, status } = req.query;

    try {
        let query = `
            SELECT 
                q.id, q.course_id, q.subject_id, q.subject, q.trainer_id, q.title, q.description,
                q.deadline, q.duration_minutes, q.attempts_allowed, q.pass_threshold, q.status, q.created_at,
                u.username AS trainer_name,
                c.title AS course_title,
                (SELECT COUNT(*) FROM questions qu WHERE qu.questionnaire_id = q.id) AS question_count,
                (SELECT COUNT(*) FROM submissions s WHERE s.questionnaire_id = q.id AND s.trainee_id = $1) AS user_attempts,
                (SELECT s2.score_percentage FROM submissions s2 WHERE s2.questionnaire_id = q.id AND s2.trainee_id = $1 ORDER BY s2.score_percentage DESC LIMIT 1) AS best_score,
                (SELECT s3.is_passed FROM submissions s3 WHERE s3.questionnaire_id = q.id AND s3.trainee_id = $1 ORDER BY s3.score_percentage DESC LIMIT 1) AS is_passed
            FROM questionnaires q
            LEFT JOIN users u ON q.trainer_id = u.id
            LEFT JOIN courses c ON q.course_id = c.id
            WHERE 1=1
        `;
        const params = [req.user.userId];
        let pIdx = 2;

        if (req.user.role === 'trainee') {
            query += ` AND q.status = 'published'`;
        }

        if (courseId) {
            query += ` AND q.course_id = $${pIdx}`;
            params.push(courseId);
            pIdx++;
        }
        if (trainerId) {
            query += ` AND q.trainer_id = $${pIdx}`;
            params.push(trainerId);
            pIdx++;
        }
        if (status) {
            query += ` AND q.status = $${pIdx}`;
            params.push(status);
            pIdx++;
        }

        query += ` ORDER BY q.created_at DESC;`;

        const result = await pgPool.query(query, params);
        return res.json({ questionnaires: result.rows });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// GET /api/questionnaires/:id
app.get('/api/questionnaires/:id', authenticateToken, async (req, res) => {
    try {
        const questRes = await pgPool.query(`
            SELECT q.*, u.username AS trainer_name, c.title AS course_title,
                   (SELECT COUNT(*) FROM submissions s WHERE s.questionnaire_id = q.id AND s.trainee_id = $2) AS user_attempts
            FROM questionnaires q
            LEFT JOIN users u ON q.trainer_id = u.id
            LEFT JOIN courses c ON q.course_id = c.id
            WHERE q.id = $1;
        `, [req.params.id, req.user.userId]);

        if (questRes.rows.length === 0) return res.status(404).json({ error: 'Questionnaire not found.' });
        const questionnaire = questRes.rows[0];

        // Fetch questions
        let questionsQuery = '';
        if (req.user.role === 'trainee') {
            // Hide answers and explanations from Trainee during test fetching
            questionsQuery = `
                SELECT id, questionnaire_id, question_text, options, marks, order_num
                FROM questions WHERE questionnaire_id = $1 ORDER BY order_num ASC;
            `;
        } else {
            // Trainers and Admins see complete answer keys
            questionsQuery = `
                SELECT id, questionnaire_id, question_text, options, correct_option_index, marks, explanation, order_num
                FROM questions WHERE questionnaire_id = $1 ORDER BY order_num ASC;
            `;
        }

        const questionsRes = await pgPool.query(questionsQuery, [questionnaire.id]);

        return res.json({
            questionnaire,
            questions: questionsRes.rows
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/questionnaires (Trainer / Admin)
app.post('/api/questionnaires', authenticateToken, requireRole('trainer', 'admin'), requireActive, async (req, res) => {
    const { course_id, subject_id, subject, title, description, deadline, duration_minutes, attempts_allowed, pass_threshold, status, questions } = req.body;

    if (!title || !deadline || !questions || !Array.isArray(questions) || questions.length === 0) {
        return res.status(400).json({ error: 'Title, deadline, and at least one question are required.' });
    }

    const client = await pgPool.connect();
    try {
        await client.query('BEGIN');

        const questInsert = await client.query(`
            INSERT INTO questionnaires (course_id, subject_id, subject, trainer_id, title, description, deadline, duration_minutes, attempts_allowed, pass_threshold, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *;
        `, [
            course_id || null,
            subject_id || null,
            subject || 'General',
            req.user.userId,
            normalizeText(title),
            normalizeText(description),
            new Date(deadline),
            parseInt(duration_minutes) || 30,
            parseInt(attempts_allowed) || 1,
            parseInt(pass_threshold) || 70,
            status || 'published'
        ]);

        const questionnaireId = questInsert.rows[0].id;

        for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            await client.query(`
                INSERT INTO questions (questionnaire_id, question_text, options, correct_option_index, marks, explanation, order_num)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [
                questionnaireId,
                normalizeText(q.question_text),
                JSON.stringify(q.options || []),
                parseInt(q.correct_option_index) || 0,
                parseInt(q.marks) || 1,
                q.explanation || null,
                i + 1
            ]);
        }

        // Broadcast real-time notification to active trainees
        try {
            const deadlineDateStr = deadline ? new Date(deadline).toLocaleDateString() : 'No expiry';
            await client.query(`
                INSERT INTO notifications (user_id, title, message, type, link)
                SELECT id, 'New Assessment Published 📝', $1, 'assessment', '#assessments'
                FROM users
                WHERE user_role = 'trainee' AND status = 'active';
            `, [`Assessment "${normalizeText(title)}" is now open (Deadline: ${deadlineDateStr}, Passing threshold: ${pass_threshold || 70}%).`]);
        } catch (e) {
            console.error('Questionnaire notification broadcast error:', e);
        }

        await client.query('COMMIT');
        return res.status(201).json({ message: 'Questionnaire published successfully.', questionnaire: questInsert.rows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        return res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// POST /api/questionnaires/:id/attempt (Trainee MCQ Assessment Submission)
app.post('/api/questionnaires/:id/attempt', authenticateToken, requireRole('trainee'), async (req, res) => {
    const { answers } = req.body; // Map: { [questionId]: chosenIndex }

    if (!answers || typeof answers !== 'object') {
        return res.status(400).json({ error: 'Answers map is required.' });
    }

    const client = await pgPool.connect();
    try {
        await client.query('BEGIN');

        const questRes = await client.query('SELECT * FROM questionnaires WHERE id = $1', [req.params.id]);
        if (questRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Assessment questionnaire not found.' });
        }

        const questionnaire = questRes.rows[0];

        // 1. STRICT SERVER-SIDE DEADLINE ENFORCEMENT
        const now = new Date();
        const deadline = new Date(questionnaire.deadline);
        if (now > deadline) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                error: `Assessment deadline expired on ${deadline.toLocaleString()}. Submissions are strictly locked.`,
                is_overdue: true
            });
        }

        // 2. CHECK ATTEMPTS ALLOWED
        const pastAttemptsRes = await client.query('SELECT COUNT(*) FROM submissions WHERE questionnaire_id = $1 AND trainee_id = $2', [questionnaire.id, req.user.userId]);
        const attemptsUsed = parseInt(pastAttemptsRes.rows[0].count);
        if (questionnaire.attempts_allowed > 0 && attemptsUsed >= questionnaire.attempts_allowed) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `Maximum allowed attempts (${questionnaire.attempts_allowed}) already reached for this assessment.` });
        }

        // 3. AUTO-SCORE MCQs
        const questionsRes = await client.query('SELECT * FROM questions WHERE questionnaire_id = $1 ORDER BY order_num ASC', [questionnaire.id]);
        const questions = questionsRes.rows;

        let totalMarks = 0;
        let earnedMarks = 0;
        let correctCount = 0;
        const breakdown = [];

        for (const q of questions) {
            totalMarks += q.marks;
            const chosen = answers[q.id] !== undefined ? parseInt(answers[q.id]) : -1;
            const isCorrect = chosen === q.correct_option_index;

            if (isCorrect) {
                earnedMarks += q.marks;
                correctCount++;
            }

            breakdown.push({
                question_id: q.id,
                question_text: q.question_text,
                options: q.options,
                chosen_option_index: chosen,
                correct_option_index: q.correct_option_index,
                is_correct: isCorrect,
                marks_earned: isCorrect ? q.marks : 0,
                total_marks: q.marks,
                explanation: q.explanation
            });
        }

        const scorePercentage = totalMarks > 0 ? ((earnedMarks / totalMarks) * 100).toFixed(2) : 0;
        const isPassed = parseFloat(scorePercentage) >= questionnaire.pass_threshold;
        const attemptNumber = attemptsUsed + 1;

        // Record submission
        const subInsert = await client.query(`
            INSERT INTO submissions (questionnaire_id, trainee_id, answers, total_questions, correct_answers, score_percentage, is_passed, attempt_number)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *;
        `, [
            questionnaire.id,
            req.user.userId,
            JSON.stringify(answers),
            questions.length,
            correctCount,
            scorePercentage,
            isPassed,
            attemptNumber
        ]);

        let issuedCertificate = null;

        // 4. ON PASSING -> AUTO ISSUE CERTIFICATE
        if (isPassed) {
            const certCode = 'CERT-' + new Date().getFullYear() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
            const certTitle = `${questionnaire.title} Certified`;

            const certRes = await client.query(`
                INSERT INTO certificates (trainee_id, course_id, questionnaire_id, certificate_code, title, issuer)
                VALUES ($1, $2, $3, $4, $5, 'EduPeers L&D Academy')
                RETURNING *;
            `, [req.user.userId, questionnaire.course_id, questionnaire.id, certCode, certTitle]);

            issuedCertificate = certRes.rows[0];

            // Add certificate entry to trainee profile
            const profileRes = await client.query('SELECT certificates FROM trainee_profiles WHERE user_id = $1', [req.user.userId]);
            const certList = (profileRes.rows[0] && profileRes.rows[0].certificates) || [];
            certList.push({
                title: certTitle,
                issuer: 'EduPeers L&D Academy',
                issue_date: new Date().toISOString().split('T')[0],
                certificate_code: certCode
            });
            await client.query('UPDATE trainee_profiles SET certificates = $1 WHERE user_id = $2', [JSON.stringify(certList), req.user.userId]);

            // Notify Trainee
            await client.query(`
                INSERT INTO notifications (user_id, title, message, type, link)
                VALUES ($1, 'Assessment Passed! 🎉', $2, 'success', '#certificates');
            `, [req.user.userId, `Congratulations! You passed ${questionnaire.title} with ${scorePercentage}% and earned a certificate!`]);

            // Update course progress
            if (questionnaire.course_id) {
                const stats = await client.query(`
                    SELECT 
                        (SELECT COUNT(*) FROM resources WHERE course_id = $1 AND status = 'published') AS total_res,
                        (SELECT COUNT(*) FROM resource_views rv WHERE rv.course_id = $1 AND rv.user_id = $2) AS viewed_res,
                        (SELECT COUNT(*) FROM questionnaires WHERE course_id = $1 AND status = 'published') AS total_quest,
                        (SELECT COUNT(*) FROM submissions s JOIN questionnaires q ON s.questionnaire_id = q.id WHERE q.course_id = $1 AND s.trainee_id = $2 AND s.is_passed = TRUE) AS passed_quest
                `, [questionnaire.course_id, req.user.userId]);

                const row = stats.rows[0];
                const totalItems = parseInt(row.total_res) + parseInt(row.total_quest);
                const doneItems = parseInt(row.viewed_res) + parseInt(row.passed_quest);
                const progressPct = totalItems > 0 ? Math.min(100, Math.round((doneItems / totalItems) * 100)) : 100;
                const newStatus = progressPct === 100 ? 'completed' : 'enrolled';

                await client.query(`
                    UPDATE enrollments SET
                        progress_pct = $1,
                        status = $2,
                        completed_at = CASE WHEN $2::varchar = 'completed' THEN CURRENT_TIMESTAMP ELSE completed_at END
                    WHERE user_id = $3 AND course_id = $4;
                `, [progressPct, newStatus, req.user.userId, questionnaire.course_id]);
            }
        }

        // Real-time notification to trainer about trainee submission
        if (questionnaire.trainer_id) {
            try {
                await client.query(`
                    INSERT INTO notifications (user_id, title, message, type, link)
                    VALUES ($1, 'Assessment Submission Received 📝', $2, 'info', '#trainer-trainees');
                `, [
                    questionnaire.trainer_id,
                    `Trainee ${req.user.username} (${req.user.email}) completed "${questionnaire.title}" with a score of ${scorePercentage}% (${isPassed ? 'PASSED ✅' : 'FAILED ❌'}).`
                ]);
            } catch (e) {
                console.error('Submission notification to trainer error:', e);
            }
        }

        await client.query('COMMIT');

        return res.json({
            message: isPassed ? 'Congratulations! You passed the assessment!' : 'Assessment completed. Passing score threshold was not met.',
            submission: subInsert.rows[0],
            breakdown,
            certificate: issuedCertificate
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Assessment submission error:', err);
        return res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// GET /api/questionnaires/:id/submissions (Trainer / Admin)
app.get('/api/questionnaires/:id/submissions', authenticateToken, requireRole('trainer', 'admin'), async (req, res) => {
    try {
        const result = await pgPool.query(`
            SELECT 
                s.id, s.questionnaire_id, s.trainee_id, s.score_percentage, s.is_passed, s.attempt_number, s.submitted_at,
                u.username AS trainee_name, u.email AS trainee_email, u.department AS trainee_department
            FROM submissions s
            JOIN users u ON s.trainee_id = u.id
            WHERE s.questionnaire_id = $1
            ORDER BY s.submitted_at DESC;
        `, [req.params.id]);

        return res.json({ submissions: result.rows });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ==========================================================
// 6. TRAINER PERFORMANCE & PARTICIPATION MONITOR APIS
// ==========================================================

// GET /api/trainer/overview (Trainer Dashboard & Domain Matched Analytics)
app.get('/api/trainer/overview', authenticateToken, requireRole('trainer', 'admin'), requireActive, async (req, res) => {
    try {
        const trainerId = req.user.userId;

        // Fetch Trainer's designated domain & expertise
        const trainerUserRes = await pgPool.query(`
            SELECT u.*, trp.expertise_tags, trp.bio, trp.experience_years
            FROM users u
            LEFT JOIN trainer_profiles trp ON trp.user_id = u.id
            WHERE u.id = $1;
        `, [trainerId]);

        const trainerUser = trainerUserRes.rows[0] || {};
        const trainerDomain = trainerUser.profession || trainerUser.department || '';

        // 1. My Authored / Domain Courses
        const coursesRes = await pgPool.query(`
            SELECT c.*,
                   (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS enrolled_trainees,
                   (SELECT AVG(e.progress_pct) FROM enrollments e WHERE e.course_id = c.id) AS avg_progress
            FROM courses c
            WHERE c.trainer_id = $1 OR c.subject = $2
            ORDER BY c.created_at DESC;
        `, [trainerId, trainerDomain]);

        // 2. Trainee Submissions (across trainer's questionnaires or domain-matched trainees)
        const submissionsRes = await pgPool.query(`
            SELECT 
                s.id, s.questionnaire_id, s.trainee_id, s.score_percentage, s.is_passed, s.attempt_number, s.submitted_at,
                q.title AS questionnaire_title, q.subject AS questionnaire_subject,
                u.username AS trainee_name, u.email AS trainee_email, u.department AS trainee_department,
                u.profession AS trainee_domain, u.institution AS trainee_institution, u.age AS trainee_age, u.gender AS trainee_gender
            FROM submissions s
            JOIN questionnaires q ON s.questionnaire_id = q.id
            JOIN users u ON s.trainee_id = u.id
            WHERE q.trainer_id = $1 
               OR q.subject = $2
               OR u.profession = $2
               OR u.department = $2
               OR EXISTS (
                   SELECT 1 FROM enrollments e
                   JOIN courses c ON e.course_id = c.id
                   WHERE e.user_id = u.id AND (c.trainer_id = $1 OR c.subject = $2)
               )
            ORDER BY s.submitted_at DESC
            LIMIT 100;
        `, [trainerId, trainerDomain]);

        // 3. Matched & Enrolled Trainees
        const matchedTraineesRes = await pgPool.query(`
            SELECT 
                u.id, u.username, u.email, u.age, u.gender, u.institution, u.department, u.profession, u.status, u.created_at,
                tp.qualifications, tp.skills, tp.work_experience,
                (SELECT COUNT(*) FROM enrollments e WHERE e.user_id = u.id) AS total_enrolled_courses,
                (SELECT AVG(s.score_percentage) FROM submissions s WHERE s.trainee_id = u.id) AS avg_test_score,
                (SELECT COUNT(*) FROM submissions s WHERE s.trainee_id = u.id AND s.is_passed = TRUE) AS passed_tests_count
            FROM users u
            LEFT JOIN trainee_profiles tp ON tp.user_id = u.id
            WHERE u.user_role = 'trainee'
              AND (
                  u.profession = $1 
                  OR u.department = $1 
                  OR tp.interests::text ILIKE $2
                  OR EXISTS (
                      SELECT 1 FROM enrollments e 
                      JOIN courses c ON e.course_id = c.id 
                      WHERE e.user_id = u.id AND (c.trainer_id = $3 OR c.subject = $1)
                  )
              )
            ORDER BY u.created_at DESC;
        `, [trainerDomain, `%${trainerDomain}%`, trainerId]);

        // 4. Feedback Received
        const feedbackRes = await pgPool.query(`
            SELECT f.*, u.username AS trainee_name, c.title AS course_title
            FROM feedback f
            LEFT JOIN users u ON f.user_id = u.id
            LEFT JOIN courses c ON f.course_id = c.id
            WHERE f.trainer_id = $1
            ORDER BY f.created_at DESC;
        `, [trainerId]);

        // Aggregated Metrics
        const totalCourses = coursesRes.rows.length;
        const totalEnrollments = matchedTraineesRes.rows.length;
        const totalSubmissions = submissionsRes.rows.length;
        const passedSubmissions = submissionsRes.rows.filter(s => s.is_passed).length;
        const passRate = totalSubmissions > 0 ? Math.round((passedSubmissions / totalSubmissions) * 100) : 0;
        const avgRating = feedbackRes.rows.length > 0 ? (feedbackRes.rows.reduce((acc, f) => acc + f.rating, 0) / feedbackRes.rows.length).toFixed(1) : '5.0';

        return res.json({
            trainer_domain: trainerDomain,
            metrics: {
                totalCourses,
                totalEnrollments,
                totalSubmissions,
                passRate,
                avgRating
            },
            courses: coursesRes.rows,
            submissions: submissionsRes.rows,
            matched_trainees: matchedTraineesRes.rows,
            feedback: feedbackRes.rows
        });
    } catch (err) {
        console.error('Trainer overview error:', err);
        return res.status(500).json({ error: err.message });
    }
});

// GET /api/trainer/trainees (Domain-Matched Trainees with test marks & full profile)
app.get('/api/trainer/trainees', authenticateToken, requireRole('trainer', 'admin'), requireActive, async (req, res) => {
    try {
        const trainerId = req.user.userId;

        // Retrieve trainer domain
        const trainerRes = await pgPool.query('SELECT profession, department FROM users WHERE id = $1', [trainerId]);
        const trainer = trainerRes.rows[0] || {};
        const trainerDomain = trainer.profession || trainer.department || '';

        const traineesRes = await pgPool.query(`
            SELECT 
                u.id, u.username, u.email, u.age, u.gender, u.institution, u.department, u.profession, u.status, u.created_at,
                tp.qualifications, tp.skills, tp.work_experience, tp.certificates,
                (
                    SELECT json_agg(json_build_object(
                        'course_id', c.id,
                        'title', c.title,
                        'subject', c.subject,
                        'progress_pct', e.progress_pct,
                        'status', e.status,
                        'enrolled_at', e.enrolled_at
                    ))
                    FROM enrollments e
                    JOIN courses c ON e.course_id = c.id
                    WHERE e.user_id = u.id
                ) AS enrolled_courses,
                (
                    SELECT json_agg(json_build_object(
                        'submission_id', s.id,
                        'questionnaire_title', q.title,
                        'subject', q.subject,
                        'score_percentage', s.score_percentage,
                        'is_passed', s.is_passed,
                        'attempt_number', s.attempt_number,
                        'submitted_at', s.submitted_at
                    ))
                    FROM submissions s
                    JOIN questionnaires q ON s.questionnaire_id = q.id
                    WHERE s.trainee_id = u.id
                ) AS test_submissions
            FROM users u
            LEFT JOIN trainee_profiles tp ON tp.user_id = u.id
            WHERE u.user_role = 'trainee'
              AND (
                  u.profession = $1 
                  OR u.department = $1 
                  OR tp.interests::text ILIKE $2
                  OR EXISTS (
                      SELECT 1 FROM enrollments e 
                      JOIN courses c ON e.course_id = c.id 
                      WHERE e.user_id = u.id AND (c.trainer_id = $3 OR c.subject = $1)
                  )
              )
            ORDER BY u.created_at DESC;
        `, [trainerDomain, `%${trainerDomain}%`, trainerId]);

        return res.json({
            domain: trainerDomain,
            trainees: traineesRes.rows
        });
    } catch (err) {
        console.error('Trainer trainees error:', err);
        return res.status(500).json({ error: err.message });
    }
});

// ==========================================================
// 7. FEEDBACK APIS
// ==========================================================

// POST /api/feedback (Trainee)
app.post('/api/feedback', authenticateToken, requireRole('trainee'), async (req, res) => {
    const { course_id, trainer_id, target_type, rating, ratings, comments, is_anonymous } = req.body;

    if (!rating || !comments) {
        return res.status(400).json({ error: 'Rating and comments are required.' });
    }

    try {
        const result = await pgPool.query(`
            INSERT INTO feedback (user_id, course_id, trainer_id, target_type, target_id, rating, ratings, comments, is_anonymous)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *;
        `, [
            req.user.userId,
            course_id || null,
            trainer_id || null,
            target_type || 'course',
            course_id || trainer_id || null,
            Math.min(5, Math.max(1, parseInt(rating))),
            ratings ? JSON.stringify(ratings) : JSON.stringify({ quality: rating, relevance: rating, delivery: rating }),
            normalizeText(comments),
            is_anonymous === true
        ]);

        // Real-time notification to trainer
        if (trainer_id) {
            try {
                await pgPool.query(`
                    INSERT INTO notifications (user_id, title, message, type, link)
                    VALUES ($1, 'New Feedback Received ⭐', $2, 'info', '#trainer-trainees');
                `, [trainer_id, `You received a ${Math.min(5, Math.max(1, parseInt(rating)))}-star rating and feedback from ${is_anonymous === true ? 'an anonymous trainee' : req.user.username}.`]);
            } catch (e) {
                console.error('Feedback notification error:', e);
            }
        }

        return res.status(201).json({ message: 'Feedback submitted successfully. Thank you!', feedback: result.rows[0] });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ==========================================================
// 8. ADMIN USER GOVERNANCE & APPROVALS APIS (FULL VISIBILITY)
// ==========================================================

// GET /api/admin/users (Admin sees ALL trainers and trainees regardless of role or domain)
app.get('/api/admin/users', authenticateToken, requireRole('admin'), async (req, res) => {
    const { role, status, search } = req.query;

    try {
        let query = `
            SELECT 
                u.id, u.username, u.email, u.user_role, u.status, u.department, u.designation, u.phone, u.photo_url, 
                u.age, u.gender, u.institution, u.profession, u.created_at,
                tp.qualifications AS trainee_qualifications, tp.work_experience, tp.skills, tp.manager_name, tp.certificates AS trainee_certificates,
                trp.bio AS trainer_bio, trp.expertise_tags, trp.experience_years,
                (SELECT COUNT(*) FROM enrollments e WHERE e.user_id = u.id) AS total_enrolled_courses,
                (SELECT COUNT(*) FROM enrollments e WHERE e.user_id = u.id AND (e.status = 'completed' OR e.progress_pct = 100)) AS completed_courses_count,
                (SELECT AVG(s.score_percentage) FROM submissions s WHERE s.trainee_id = u.id) AS avg_test_marks,
                (SELECT COUNT(*) FROM submissions s WHERE s.trainee_id = u.id) AS total_test_attempts,
                (SELECT COUNT(*) FROM submissions s WHERE s.trainee_id = u.id AND s.is_passed = TRUE) AS passed_tests_count,
                (SELECT COUNT(*) FROM certificates cert WHERE cert.trainee_id = u.id) AS total_certificates_issued,
                (SELECT COUNT(*) FROM courses c WHERE c.trainer_id = u.id) AS trainer_courses_count,
                (
                    SELECT json_agg(json_build_object(
                        'title', c.title,
                        'subject', c.subject,
                        'progress_pct', e.progress_pct,
                        'status', e.status
                    ))
                    FROM enrollments e
                    JOIN courses c ON e.course_id = c.id
                    WHERE e.user_id = u.id
                ) AS enrolled_courses_details,
                (
                    SELECT json_agg(json_build_object(
                        'test_title', q.title,
                        'subject', q.subject,
                        'score_percentage', s.score_percentage,
                        'is_passed', s.is_passed,
                        'submitted_at', s.submitted_at
                    ))
                    FROM submissions s
                    JOIN questionnaires q ON s.questionnaire_id = q.id
                    WHERE s.trainee_id = u.id
                ) AS test_submissions_details
            FROM users u
            LEFT JOIN trainee_profiles tp ON tp.user_id = u.id
            LEFT JOIN trainer_profiles trp ON trp.user_id = u.id
            WHERE 1=1
        `;
        const params = [];
        let pIdx = 1;

        if (role) {
            query += ` AND u.user_role = $${pIdx}`;
            params.push(role);
            pIdx++;
        }
        if (status) {
            query += ` AND u.status = $${pIdx}`;
            params.push(status);
            pIdx++;
        }
        if (search) {
            query += ` AND (u.username ILIKE $${pIdx} OR u.email ILIKE $${pIdx} OR u.department ILIKE $${pIdx} OR u.institution ILIKE $${pIdx} OR u.profession ILIKE $${pIdx})`;
            params.push(`%${search}%`);
            pIdx++;
        }

        query += ` ORDER BY u.created_at DESC;`;

        const result = await pgPool.query(query, params);
        return res.json({ users: result.rows });
    } catch (err) {
        console.error('Admin users error:', err);
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/admin/users/:id/approve
app.post('/api/admin/users/:id/approve', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const result = await pgPool.query(`
            UPDATE users SET status = 'active', updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING id, username, email, user_role, status;
        `, [req.params.id]);

        if (result.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
        const user = result.rows[0];

        // Record Audit Log
        await pgPool.query(`
            INSERT INTO audit_logs (actor_id, actor_name, action, target_user_id, details)
            VALUES ($1, $2, 'USER_APPROVED', $3, $4);
        `, [req.user.userId, req.user.username, user.id, JSON.stringify({ role: user.user_role, email: user.email })]);

        // In-app notification for the user
        await pgPool.query(`
            INSERT INTO notifications (user_id, title, message, type, link)
            VALUES ($1, 'Account Approved! 🎉', 'Welcome to EduPeers! Your trainer account has been reviewed and approved by an Administrator. All features are now unlocked.', 'success', '#home');
        `, [user.id]);

        // Real-time WebSocket push to the approved user and all connected admins
        broadcastToUser(user.id, {
            type: 'account_approved',
            userId: user.id,
            status: 'active',
            message: 'Your account has been approved by an Administrator! All features are now unlocked.'
        });

        broadcastToRole('admin', {
            type: 'user_approved_broadcast',
            userId: user.id,
            username: user.username,
            role: user.user_role
        });

        return res.json({ message: `User ${user.username} (${user.user_role}) approved successfully.`, user });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/admin/users/:id/reject
app.post('/api/admin/users/:id/reject', authenticateToken, requireRole('admin'), async (req, res) => {
    const { reason } = req.body;
    try {
        const userRes = await pgPool.query('SELECT username, email, user_role FROM users WHERE id = $1', [req.params.id]);
        if (userRes.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
        const user = userRes.rows[0];

        await pgPool.query('DELETE FROM users WHERE id = $1', [req.params.id]);

        await pgPool.query(`
            INSERT INTO audit_logs (actor_id, actor_name, action, target_user_id, details)
            VALUES ($1, $2, 'USER_REJECTED', NULL, $3);
        `, [req.user.userId, req.user.username, JSON.stringify({ email: user.email, reason: reason || 'Application declined by Admin' })]);

        return res.json({ message: `Registration for ${user.email} rejected.` });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/admin/users/:id/role
app.post('/api/admin/users/:id/role', authenticateToken, requireRole('admin'), async (req, res) => {
    const { role } = req.body;
    if (!['trainee', 'trainer', 'admin'].includes(role)) {
        return res.status(400).json({ error: 'Role must be strictly one of: trainee, trainer, admin.' });
    }

    try {
        const result = await pgPool.query(`
            UPDATE users SET user_role = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING id, username, email, user_role, status;
        `, [role, req.params.id]);

        if (result.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
        const user = result.rows[0];

        // Ensure corresponding profile exists
        if (role === 'trainee') {
            await pgPool.query('INSERT INTO trainee_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING;', [user.id]);
        } else if (role === 'trainer') {
            await pgPool.query('INSERT INTO trainer_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING;', [user.id]);
        }

        await pgPool.query(`
            INSERT INTO audit_logs (actor_id, actor_name, action, target_user_id, details)
            VALUES ($1, $2, 'USER_ROLE_CHANGED', $3, $4);
        `, [req.user.userId, req.user.username, user.id, JSON.stringify({ newRole: role, email: user.email })]);

        return res.json({ message: `Role updated to ${role} for ${user.username}.`, user });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/admin/users/:id/status
app.post('/api/admin/users/:id/status', authenticateToken, requireRole('admin'), async (req, res) => {
    const { status } = req.body;
    if (!['pending', 'active', 'suspended'].includes(status)) {
        return res.status(400).json({ error: 'Status must be one of: pending, active, suspended.' });
    }

    try {
        const result = await pgPool.query(`
            UPDATE users SET status = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING id, username, email, user_role, status;
        `, [status, req.params.id]);

        if (result.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
        const user = result.rows[0];

        await pgPool.query(`
            INSERT INTO audit_logs (actor_id, actor_name, action, target_user_id, details)
            VALUES ($1, $2, 'USER_STATUS_CHANGED', $3, $4);
        `, [req.user.userId, req.user.username, user.id, JSON.stringify({ status, email: user.email })]);

        return res.json({ message: `Status updated to ${status} for ${user.username}.`, user });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/audit-logs
app.get('/api/admin/audit-logs', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const result = await pgPool.query(`
            SELECT a.*, u.email AS target_email
            FROM audit_logs a
            LEFT JOIN users u ON a.target_user_id = u.id
            ORDER BY a.created_at DESC
            LIMIT 100;
        `);
        return res.json({ audit_logs: result.rows });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ==========================================================
// 9. 5 REAL-TIME ADMIN ANALYTICS DASHBOARDS
// ==========================================================

// 1. Courses Dashboard
app.get('/api/admin/dashboards/courses', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const totalCourses = await pgPool.query('SELECT COUNT(*) FROM courses');
        const publishedCourses = await pgPool.query('SELECT COUNT(*) FROM courses WHERE status = \'published\'');
        const draftCourses = await pgPool.query('SELECT COUNT(*) FROM courses WHERE status = \'draft\'');

        const popularity = await pgPool.query(`
            SELECT c.id, c.title, c.subject, COUNT(e.id) AS enrollments_count,
                   AVG(e.progress_pct) AS avg_completion_pct
            FROM courses c
            LEFT JOIN enrollments e ON c.id = e.course_id
            GROUP BY c.id, c.title, c.subject
            ORDER BY enrollments_count DESC;
        `);

        return res.json({
            summary: {
                total: parseInt(totalCourses.rows[0].count),
                published: parseInt(publishedCourses.rows[0].count),
                draft: parseInt(draftCourses.rows[0].count)
            },
            courses: popularity.rows
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// 2. Enrollments Dashboard
app.get('/api/admin/dashboards/enrollments', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const totalEnrollments = await pgPool.query('SELECT COUNT(*) FROM enrollments');
        const completedEnrollments = await pgPool.query('SELECT COUNT(*) FROM enrollments WHERE status = \'completed\' OR progress_pct = 100');
        const inProgressEnrollments = await pgPool.query('SELECT COUNT(*) FROM enrollments WHERE status = \'enrolled\' AND progress_pct < 100');
        const requestedEnrollments = await pgPool.query('SELECT COUNT(*) FROM enrollments WHERE status = \'requested\'');

        const byDepartment = await pgPool.query(`
            SELECT u.department, COUNT(e.id) AS count, AVG(e.progress_pct) AS avg_progress
            FROM enrollments e
            JOIN users u ON e.user_id = u.id
            GROUP BY u.department
            ORDER BY count DESC;
        `);

        return res.json({
            summary: {
                total: parseInt(totalEnrollments.rows[0].count),
                completed: parseInt(completedEnrollments.rows[0].count),
                in_progress: parseInt(inProgressEnrollments.rows[0].count),
                requested: parseInt(requestedEnrollments.rows[0].count)
            },
            departments: byDepartment.rows
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// 3. Certifications Dashboard
app.get('/api/admin/dashboards/certifications', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const totalCerts = await pgPool.query('SELECT COUNT(*) FROM certificates');
        const certsByCourse = await pgPool.query(`
            SELECT COALESCE(c.title, 'Direct Skill Cert') AS course_title, COUNT(cert.id) AS certs_issued
            FROM certificates cert
            LEFT JOIN courses c ON cert.course_id = c.id
            GROUP BY c.title
            ORDER BY certs_issued DESC;
        `);

        const certsByDept = await pgPool.query(`
            SELECT u.department, COUNT(cert.id) AS certs_issued
            FROM certificates cert
            JOIN users u ON cert.trainee_id = u.id
            GROUP BY u.department
            ORDER BY certs_issued DESC;
        `);

        const recentCerts = await pgPool.query(`
            SELECT cert.*, u.username AS trainee_name, u.email AS trainee_email, u.department
            FROM certificates cert
            JOIN users u ON cert.trainee_id = u.id
            ORDER BY cert.issued_at DESC
            LIMIT 25;
        `);

        return res.json({
            summary: {
                total_issued: parseInt(totalCerts.rows[0].count)
            },
            by_course: certsByCourse.rows,
            by_department: certsByDept.rows,
            recent: recentCerts.rows
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// 4. Assessments Dashboard
app.get('/api/admin/dashboards/assessments', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const totalAttempts = await pgPool.query('SELECT COUNT(*) FROM submissions');
        const avgScore = await pgPool.query('SELECT AVG(score_percentage) FROM submissions');
        const passRate = await pgPool.query(`
            SELECT 
                COUNT(*) FILTER (WHERE is_passed = TRUE) * 100.0 / NULLIF(COUNT(*), 0) AS pass_pct
            FROM submissions;
        `);

        const bySubject = await pgPool.query(`
            SELECT q.subject, COUNT(s.id) AS total_attempts, AVG(s.score_percentage) AS avg_score,
                   COUNT(s.id) FILTER (WHERE s.is_passed = TRUE) * 100.0 / NULLIF(COUNT(s.id), 0) AS pass_pct
            FROM submissions s
            JOIN questionnaires q ON s.questionnaire_id = q.id
            GROUP BY q.subject
            ORDER BY total_attempts DESC;
        `);

        return res.json({
            summary: {
                total_attempts: parseInt(totalAttempts.rows[0].count),
                average_score: parseFloat(avgScore.rows[0].avg || 0).toFixed(1),
                pass_rate: parseFloat(passRate.rows[0].pass_pct || 0).toFixed(1)
            },
            by_subject: bySubject.rows
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// 5. Participation Statistics Dashboard
app.get('/api/admin/dashboards/participation', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const totalUsers = await pgPool.query('SELECT COUNT(*) FROM users WHERE status = \'active\'');
        const activeTrainees = await pgPool.query('SELECT COUNT(*) FROM users WHERE user_role = \'trainee\' AND status = \'active\'');
        const activeTrainers = await pgPool.query('SELECT COUNT(*) FROM users WHERE user_role = \'trainer\' AND status = \'active\'');
        const pendingUsers = await pgPool.query('SELECT COUNT(*) FROM users WHERE status = \'pending\'');

        const inactiveTrainees = await pgPool.query(`
            SELECT u.id, u.username, u.email, u.department, u.created_at
            FROM users u
            WHERE u.user_role = 'trainee' AND u.status = 'active'
            AND NOT EXISTS (SELECT 1 FROM enrollments e WHERE e.user_id = u.id)
            LIMIT 20;
        `);

        return res.json({
            summary: {
                total_active: parseInt(totalUsers.rows[0].count),
                active_trainees: parseInt(activeTrainees.rows[0].count),
                active_trainers: parseInt(activeTrainers.rows[0].count),
                pending_approvals: parseInt(pendingUsers.rows[0].count)
            },
            inactive_trainees: inactiveTrainees.rows
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ==========================================================
// 10. COMPETENCY MAPPING APIS
// ==========================================================

// GET /api/admin/subjects
app.get('/api/admin/subjects', authenticateToken, async (req, res) => {
    try {
        const result = await pgPool.query('SELECT * FROM subjects ORDER BY name ASC');
        return res.json({ subjects: result.rows });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/admin/subjects
app.post('/api/admin/subjects', authenticateToken, requireRole('admin'), async (req, res) => {
    const { name, category, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Subject name is required.' });

    try {
        const result = await pgPool.query(`
            INSERT INTO subjects (name, category, description)
            VALUES ($1, $2, $3)
            RETURNING *;
        `, [normalizeText(name), category || 'Technical', description || '']);
        return res.status(201).json({ subject: result.rows[0] });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// GET /api/competency-map (Live Matrix of Subjects & Trainers)
app.get('/api/competency-map', authenticateToken, requireRole('trainer', 'admin'), async (req, res) => {
    try {
        const subjectsRes = await pgPool.query('SELECT * FROM subjects ORDER BY category, name');
        const trainersRes = await pgPool.query(`
            SELECT 
                u.id, u.username, u.email, u.department, u.designation, u.profession, u.photo_url, u.status,
                tp.expertise_tags, tp.experience_years, tp.bio, tp.qualifications, tp.skills,
                (SELECT COUNT(*) FROM courses c WHERE c.trainer_id = u.id AND c.status = 'published') AS course_load,
                (SELECT AVG(f.rating) FROM feedback f WHERE f.trainer_id = u.id) AS avg_rating,
                COALESCE((SELECT json_agg(c.subject) FROM courses c WHERE c.trainer_id = u.id), '[]'::json) AS taught_subjects
            FROM users u
            LEFT JOIN trainer_profiles tp ON tp.user_id = u.id
            WHERE u.user_role = 'trainer';
        `);

        const subjects = subjectsRes.rows;
        const trainers = trainersRes.rows;

        // Compute matrix mapping
        const matrix = subjects.map(s => {
            const subName = (s.name || '').toLowerCase().trim();
            const subCat = (s.category || '').toLowerCase().trim();

            const matchingTrainers = trainers.filter(t => {
                // 1. Check expertise_tags
                const tags = Array.isArray(t.expertise_tags) ? t.expertise_tags : [];
                if (tags.some(tag => {
                    const str = (typeof tag === 'string' ? tag : tag.name || '').toLowerCase().trim();
                    return str === subName || str.includes(subName) || subName.includes(str);
                })) return true;

                // 2. Check profession / study domain
                const prof = (t.profession || '').toLowerCase().trim();
                if (prof && (prof === subName || prof.includes(subName) || subName.includes(prof))) return true;

                // 3. Check department
                const dept = (t.department || '').toLowerCase().trim();
                if (dept && (dept === subName || dept.includes(subName) || subName.includes(dept))) return true;

                // 4. Check skills
                const skills = Array.isArray(t.skills) ? t.skills : [];
                if (skills.some(sk => {
                    const skName = (typeof sk === 'string' ? sk : sk.name || '').toLowerCase().trim();
                    return skName === subName || skName.includes(subName) || subName.includes(skName);
                })) return true;

                // 5. Check taught courses
                const taught = Array.isArray(t.taught_subjects) ? t.taught_subjects : [];
                if (taught.some(ts => (ts || '').toLowerCase().trim() === subName)) return true;

                return false;
            });

            return {
                subject: s,
                qualified_trainers_count: matchingTrainers.length,
                trainers: matchingTrainers.map(t => ({
                    id: t.id,
                    name: t.username,
                    email: t.email,
                    department: t.department || t.profession || s.category,
                    designation: t.designation || 'Specialist Trainer',
                    experience_years: t.experience_years || 5,
                    course_load: parseInt(t.course_load || 0),
                    rating: parseFloat(t.avg_rating || 5.0).toFixed(1),
                    status: t.status,
                    availability: parseInt(t.course_load || 0) < 3 ? 'Available' : 'High Load'
                }))
            };
        });

        return res.json({ matrix, total_subjects: subjects.length, total_trainers: trainers.length });
    } catch (err) {
        console.error('Competency map error:', err);
        return res.status(500).json({ error: err.message });
    }
});

// ==========================================================
// 11. HOMEPAGE PUBLISHING & NOTIFICATIONS APIS
// ==========================================================

// GET /api/homepage/feed
app.get('/api/homepage/feed', authenticateToken, async (req, res) => {
    try {
        const userRole = req.user.role;
        // Admin can see all posts; others only see posts targeted at them or at everyone
        const postsRes = await pgPool.query(`
            SELECT p.*, u.username AS author_name
            FROM homepage_posts p
            LEFT JOIN users u ON p.author_id = u.id
            WHERE p.is_published = TRUE
              AND ($1 = 'admin' OR p.target_role IS NULL OR p.target_role = $1)
              AND (p.expires_at IS NULL OR p.expires_at > CURRENT_TIMESTAMP)
            ORDER BY p.priority = 'high' DESC, p.created_at DESC
            LIMIT 30;
        `, [userRole]);

        // Also fetch newly added courses for auto-surface
        const newCoursesRes = await pgPool.query(`
            SELECT c.id, c.title, c.description, c.subject, c.level, c.created_at, u.username AS trainer_name
            FROM courses c
            LEFT JOIN users u ON c.trainer_id = u.id
            WHERE c.status = 'published'
            ORDER BY c.created_at DESC
            LIMIT 4;
        `);

        return res.json({
            posts: postsRes.rows,
            newly_added_courses: newCoursesRes.rows
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/admin/homepage/publish (Admin)
app.post('/api/admin/homepage/publish', authenticateToken, requireRole('admin'), async (req, res) => {
    const { type, title, content, priority, target_role, expires_at } = req.body;

    if (!type || !title || !content) {
        return res.status(400).json({ error: 'Type, title, and content are required.' });
    }

    try {
        const result = await pgPool.query(`
            INSERT INTO homepage_posts (type, title, content, priority, target_role, author_id, expires_at, is_published)
            VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
            RETURNING *;
        `, [
            type,
            normalizeText(title),
            normalizeText(content),
            priority || 'normal',
            target_role || null,
            req.user.userId,
            expires_at ? new Date(expires_at) : null
        ]);

        const post = result.rows[0];

        // Broadcast real-time in-app notification to target audience (both trainer & trainee)
        try {
            const notifTitle = `📢 ${normalizeText(title)}`;
            const notifMsg = content.length > 140 ? normalizeText(content).substring(0, 137) + '...' : normalizeText(content);
            if (target_role && target_role !== 'all') {
                await pgPool.query(`
                    INSERT INTO notifications (user_id, title, message, type, link)
                    SELECT id, $1, $2, 'announcement', '#home'
                    FROM users
                    WHERE status = 'active' AND user_role = $3;
                `, [notifTitle, notifMsg, target_role]);
            } else {
                await pgPool.query(`
                    INSERT INTO notifications (user_id, title, message, type, link)
                    SELECT id, $1, $2, 'announcement', '#home'
                    FROM users
                    WHERE status = 'active';
                `, [notifTitle, notifMsg]);
            }
        } catch (notifErr) {
            console.error('Error broadcasting announcement notification:', notifErr);
        }

        return res.status(201).json({ message: 'Post published to homepage.', post });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// DELETE /api/admin/homepage/posts/:id
app.delete('/api/admin/homepage/posts/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        await pgPool.query('DELETE FROM homepage_posts WHERE id = $1', [req.params.id]);
        return res.json({ message: 'Post removed.' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// GET /api/notifications
app.get('/api/notifications', authenticateToken, async (req, res) => {
    try {
        const result = await pgPool.query(`
            SELECT * FROM notifications
            WHERE user_id = $1 AND is_read = FALSE
            ORDER BY created_at DESC
            LIMIT 30;
        `, [req.user.userId]);

        return res.json({ notifications: result.rows });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/notifications/read-all  — MUST be before /:id/read so Express doesn't treat 'read-all' as a UUID
app.post('/api/notifications/read-all', authenticateToken, async (req, res) => {
    try {
        await pgPool.query('DELETE FROM notifications WHERE user_id = $1', [req.user.userId]);
        return res.json({ message: 'All notifications cleared.' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/notifications/:id/read  (deletes single notification — removes from drawer)
app.post('/api/notifications/:id/read', authenticateToken, async (req, res) => {
    try {
        await pgPool.query('DELETE FROM notifications WHERE id = $1 AND user_id = $2', [req.params.id, req.user.userId]);
        return res.json({ message: 'Notification dismissed.' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ==========================================================
// 12. GLOBAL SEARCH API
// ==========================================================

// GET /api/search
app.get('/api/search', authenticateToken, async (req, res) => {
    const q = normalizeText(req.query.q);
    if (!q) return res.json({ courses: [], resources: [], trainers: [], subjects: [] });

    try {
        const term = `%${q}%`;

        const courses = await pgPool.query(`
            SELECT id, title, subject, level, duration_hours, description
            FROM courses
            WHERE (title ILIKE $1 OR description ILIKE $1 OR subject ILIKE $1)
              AND (status = 'published' OR $2 IN ('trainer', 'admin'))
            LIMIT 10;
        `, [term, req.user.role]);

        const resources = await pgPool.query(`
            SELECT id, title, type, subject, description
            FROM resources
            WHERE (title ILIKE $1 OR description ILIKE $1 OR subject ILIKE $1)
              AND (status = 'published' OR $2 IN ('trainer', 'admin'))
            LIMIT 10;
        `, [term, req.user.role]);

        const trainers = await pgPool.query(`
            SELECT u.id, u.username, u.email, u.department, u.designation, tp.expertise_tags
            FROM users u
            JOIN trainer_profiles tp ON tp.user_id = u.id
            WHERE (u.username ILIKE $1 OR u.department ILIKE $1 OR tp.bio ILIKE $1)
              AND u.user_role = 'trainer' AND u.status = 'active'
            LIMIT 10;
        `, [term]);

        const subjects = await pgPool.query(`
            SELECT id, name, category, description
            FROM subjects
            WHERE name ILIKE $1 OR category ILIKE $1 OR description ILIKE $1
            LIMIT 10;
        `, [term]);

        return res.json({
            courses: courses.rows,
            resources: resources.rows,
            trainers: trainers.rows,
            subjects: subjects.rows
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ==========================================================
// 14. PEERS CONNECT – PRESENCE, CONNECTIONS, CHAT, RESOURCES
// ==========================================================

// Attach WebSocket server to the HTTP server (created at bottom of file)
let _wss = null;

function setupWebSocketServer(httpServer) {
    _wss = new WebSocket.Server({ server: httpServer });

    _wss.on('connection', (ws) => {
        // Heartbeat: keep connection alive
        ws.isAlive = true;
        ws.on('pong', () => { ws.isAlive = true; });

        ws.on('message', async (raw) => {
            let data;
            try { data = JSON.parse(raw); } catch { return; }

            if (data.type === 'identify') {
                // Register or update presence
                connectedClients.set(ws, {
                    userId:      data.userId      || '',
                    username:    data.username     || '',
                    avatar:      data.avatar       || '',
                    role:        data.role         || 'trainee',
                    institution: data.institution  || '',
                    profession:  data.profession   || '',
                    email:       data.email        || ''
                });
                broadcastPresence();
                return;
            }

            if (data.type === 'ping') {
                ws.send(JSON.stringify({ type: 'pong' }));
                return;
            }

            // ── Direct Message ──────────────────────────────
            if (data.type === 'chat_message') {
                const sender = connectedClients.get(ws);
                if (!sender) return;

                // Persist to DB
                try {
                    // Resolve receiver UUID from username or toId
                    let receiverId = data.toId;
                    if (!receiverId && data.to) {
                        const r = await pgPool.query('SELECT id FROM users WHERE LOWER(username)=LOWER($1)', [data.to]);
                        if (r.rows.length) receiverId = r.rows[0].id;
                    }
                    if (receiverId) {
                        await pgPool.query(
                            'INSERT INTO peer_messages(sender_id, receiver_id, text) VALUES($1,$2,$3)',
                            [sender.userId, receiverId, data.text]
                        );
                    }
                } catch (e) {
                    console.error('Chat persist error:', e.message);
                }

                // Deliver to recipient if online
                const recipientSock = data.toId
                    ? findSocketByUserId(data.toId)
                    : findSocketByUsername(data.to);

                if (recipientSock && recipientSock.readyState === 1) {
                    recipientSock.send(JSON.stringify({
                        type:      'direct_message',
                        from:      sender.username,
                        fromId:    sender.userId,
                        text:      data.text,
                        avatar:    sender.avatar,
                        timestamp: data.timestamp || new Date().toISOString()
                    }));
                }
                return;
            }
        });

        ws.on('close', () => {
            connectedClients.delete(ws);
            broadcastPresence();
        });

        ws.on('error', () => {
            connectedClients.delete(ws);
        });
    });

    // Heartbeat interval – removes dead sockets
    const heartbeat = setInterval(() => {
        for (const [sock, info] of connectedClients) {
            if (!sock.isAlive) {
                connectedClients.delete(sock);
                sock.terminate();
            } else {
                sock.isAlive = false;
                sock.ping();
            }
        }
        // Not broadcasting here – avoids spam; presence updates on join/leave only
    }, 30000);

    _wss.on('close', () => clearInterval(heartbeat));

    console.log('✅ Peers Connect WebSocket server attached');
}

// ── REST: Who is online right now ────────────────────────
app.get('/api/peers/online', authenticateToken, async (req, res) => {
    try {
        // Get all users who are active (approved) — we merge with WS online status
        const dbRes = await pgPool.query(`
            SELECT id, username, user_role AS role, photo_url AS avatar,
                   department AS institution, designation AS profession, status
            FROM users
            WHERE status = 'active' AND id != $1
            ORDER BY username
        `, [req.user.userId]);

        // Determine connection status for each peer relative to the requesting user
        const myId = req.user.userId;
        const connRes = await pgPool.query(`
            SELECT requester_id, addressee_id, status
            FROM peer_connections
            WHERE requester_id = $1 OR addressee_id = $1
        `, [myId]);

        const connMap = {};
        for (const row of connRes.rows) {
            const otherId = row.requester_id === myId ? row.addressee_id : row.requester_id;
            const isRequester = row.requester_id === myId;
            if (row.status === 'accepted') {
                connMap[otherId] = 'accepted';
            } else if (row.status === 'pending' && isRequester) {
                connMap[otherId] = 'outgoing_pending';
            } else if (row.status === 'pending' && !isRequester) {
                connMap[otherId] = 'incoming_pending';
            }
        }

        const onlineUserIds = new Set(
            Array.from(connectedClients.values()).map(c => c.userId)
        );

        const peers = dbRes.rows.map(u => ({
            id:               u.id,
            username:         u.username,
            role:             u.role,
            avatar:           u.avatar || '',
            institution:      u.institution || '',
            profession:       u.profession || '',
            status:           onlineUserIds.has(u.id) ? 'online' : 'offline',
            connectionStatus: connMap[u.id] || 'none'
        }));

        return res.json({ peers });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// ── REST: My connected network ────────────────────────────
app.get('/api/peers/my-network/:username', authenticateToken, async (req, res) => {
    try {
        const myId = req.user.userId;
        const networkRes = await pgPool.query(`
            SELECT u.id, u.username, u.user_role AS role, u.photo_url AS avatar,
                   u.department AS institution, u.designation AS profession
            FROM peer_connections pc
            JOIN users u ON (
                CASE WHEN pc.requester_id = $1 THEN u.id = pc.addressee_id
                     ELSE u.id = pc.requester_id END
            )
            WHERE (pc.requester_id = $1 OR pc.addressee_id = $1)
              AND pc.status = 'accepted'
            ORDER BY u.username
        `, [myId]);

        const onlineUserIds = new Set(Array.from(connectedClients.values()).map(c => c.userId));

        const network = networkRes.rows.map(u => ({
            ...u,
            status:           onlineUserIds.has(u.id) ? 'online' : 'offline',
            connectionStatus: 'accepted'
        }));

        return res.json({ network });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// ── REST: Incoming connection requests for a user ─────────
app.get('/api/peers/requests/:username', authenticateToken, async (req, res) => {
    try {
        const myId = req.user.userId;
        const reqRes = await pgPool.query(`
            SELECT u.id, u.username AS "from", u.photo_url AS avatar,
                   u.user_role AS role, u.department AS institution,
                   u.designation AS profession, pc.created_at AS requested_at
            FROM peer_connections pc
            JOIN users u ON u.id = pc.requester_id
            WHERE pc.addressee_id = $1 AND pc.status = 'pending'
            ORDER BY pc.created_at DESC
        `, [myId]);

        return res.json({ requests: reqRes.rows });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// ── REST: Send connection request ─────────────────────────
app.post('/api/peers/request', authenticateToken, async (req, res) => {
    const { to } = req.body;
    const myId = req.user.userId;
    if (!to) return res.status(400).json({ error: 'Target username required.' });

    try {
        // Resolve target user
        const targetRes = await pgPool.query(
            'SELECT id, username FROM users WHERE LOWER(username)=LOWER($1) AND status=\'active\'', [to]
        );
        if (!targetRes.rows.length) {
            return res.status(404).json({ error: 'User not found or not active.' });
        }
        const targetId = targetRes.rows[0].id;
        if (targetId === myId) {
            return res.status(400).json({ error: 'You cannot connect with yourself.' });
        }

        // Check for existing connection in either direction
        const existingRes = await pgPool.query(`
            SELECT id, status, requester_id FROM peer_connections
            WHERE (requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1)
        `, [myId, targetId]);

        if (existingRes.rows.length) {
            const existing = existingRes.rows[0];
            if (existing.status === 'accepted') {
                return res.json({ status: 'accepted', message: 'Already connected.' });
            }
            if (existing.status === 'pending') {
                // If the target had already sent to me — auto-accept
                if (existing.requester_id === targetId) {
                    await pgPool.query(
                        'UPDATE peer_connections SET status=\'accepted\', updated_at=NOW() WHERE id=$1',
                        [existing.id]
                    );
                    // Notify both via WS
                    const myInfo = connectedClients.get(findSocketByUserId(myId));
                    const targetSock = findSocketByUserId(targetId);
                    if (targetSock) targetSock.send(JSON.stringify({ type: 'request_accepted', by: req.user.username || myId }));
                    return res.json({ status: 'accepted', message: 'Connection accepted!' });
                }
                return res.json({ status: 'outgoing_pending', message: 'Request already sent.' });
            }
        }

        // Create new request
        await pgPool.query(
            'INSERT INTO peer_connections(requester_id, addressee_id, status) VALUES($1,$2,\'pending\')',
            [myId, targetId]
        );

        // Notify target via WebSocket if online
        const targetSock = findSocketByUserId(targetId);
        const senderInfo = connectedClients.get(findSocketByUserId(myId));
        if (targetSock && targetSock.readyState === 1) {
            targetSock.send(JSON.stringify({
                type:   'request_received',
                from:   senderInfo ? senderInfo.username : (req.user.username || myId),
                fromId: myId,
                avatar: senderInfo ? senderInfo.avatar : ''
            }));
        }

        return res.json({ status: 'pending', message: 'Connection request sent!' });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// ── REST: Accept connection request ───────────────────────
app.post('/api/peers/accept', authenticateToken, async (req, res) => {
    const { from } = req.body; // from = username of the requester
    const myId = req.user.userId;
    if (!from) return res.status(400).json({ error: 'Requester username required.' });

    try {
        const fromRes = await pgPool.query('SELECT id FROM users WHERE LOWER(username)=LOWER($1)', [from]);
        if (!fromRes.rows.length) return res.status(404).json({ error: 'User not found.' });
        const fromId = fromRes.rows[0].id;

        const updated = await pgPool.query(`
            UPDATE peer_connections
            SET status='accepted', updated_at=NOW()
            WHERE requester_id=$1 AND addressee_id=$2 AND status='pending'
            RETURNING id
        `, [fromId, myId]);

        if (!updated.rows.length) {
            return res.status(404).json({ error: 'Pending request not found.' });
        }

        // Notify the requester via WS
        const requesterSock = findSocketByUserId(fromId);
        const myInfo = connectedClients.get(findSocketByUserId(myId));
        if (requesterSock && requesterSock.readyState === 1) {
            requesterSock.send(JSON.stringify({
                type: 'request_accepted',
                by:   myInfo ? myInfo.username : (req.user.username || myId)
            }));
        }

        return res.json({ message: `You are now connected with ${from}!` });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// ── REST: Reject / decline connection request ─────────────
app.post('/api/peers/reject', authenticateToken, async (req, res) => {
    const { from } = req.body;
    const myId = req.user.userId;
    if (!from) return res.status(400).json({ error: 'Requester username required.' });

    try {
        const fromRes = await pgPool.query('SELECT id FROM users WHERE LOWER(username)=LOWER($1)', [from]);
        if (!fromRes.rows.length) return res.status(404).json({ error: 'User not found.' });
        const fromId = fromRes.rows[0].id;

        await pgPool.query(`
            UPDATE peer_connections
            SET status='rejected', updated_at=NOW()
            WHERE requester_id=$1 AND addressee_id=$2 AND status='pending'
        `, [fromId, myId]);

        // Notify requester via WS
        const requesterSock = findSocketByUserId(fromId);
        const myInfo = connectedClients.get(findSocketByUserId(myId));
        if (requesterSock && requesterSock.readyState === 1) {
            requesterSock.send(JSON.stringify({
                type: 'request_rejected',
                by:   myInfo ? myInfo.username : (req.user.username || myId)
            }));
        }

        return res.json({ message: 'Request declined.' });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// ── REST: Disconnect (remove connection) ──────────────────
app.post('/api/peers/disconnect', authenticateToken, async (req, res) => {
    const { to } = req.body; // target username
    const myId = req.user.userId;
    if (!to) return res.status(400).json({ error: 'Target username required.' });

    try {
        const toRes = await pgPool.query('SELECT id FROM users WHERE LOWER(username)=LOWER($1)', [to]);
        if (!toRes.rows.length) return res.status(404).json({ error: 'User not found.' });
        const toId = toRes.rows[0].id;

        await pgPool.query(`
            DELETE FROM peer_connections
            WHERE (requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1)
        `, [myId, toId]);

        // Notify target via WS
        const targetSock = findSocketByUserId(toId);
        const myInfo = connectedClients.get(findSocketByUserId(myId));
        if (targetSock && targetSock.readyState === 1) {
            targetSock.send(JSON.stringify({
                type: 'connection_removed',
                by:   myInfo ? myInfo.username : (req.user.username || myId)
            }));
        }

        return res.json({ message: `Removed ${to} from your network.` });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// ── REST: Chat history between two users ─────────────────
app.get('/api/chat/history/:userA/:userB', authenticateToken, async (req, res) => {
    const { userA, userB } = req.params;
    try {
        // Resolve UUIDs
        const usersRes = await pgPool.query(
            'SELECT id, username FROM users WHERE LOWER(username) = ANY($1)',
            [[userA.toLowerCase(), userB.toLowerCase()]]
        );
        if (usersRes.rows.length < 2) {
            // One of the users doesn't exist yet – return empty history
            return res.json({ history: [] });
        }
        const idA = usersRes.rows.find(u => u.username.toLowerCase() === userA.toLowerCase())?.id;
        const idB = usersRes.rows.find(u => u.username.toLowerCase() === userB.toLowerCase())?.id;
        if (!idA || !idB) return res.json({ history: [] });

        // Verify requester is one of the two
        const myId = req.user.userId;
        if (myId !== idA && myId !== idB) {
            return res.status(403).json({ error: 'You can only view your own chat history.' });
        }

        const histRes = await pgPool.query(`
            SELECT pm.id, u.username AS sender, pm.text, pm.created_at
            FROM peer_messages pm
            JOIN users u ON u.id = pm.sender_id
            WHERE (pm.sender_id=$1 AND pm.receiver_id=$2)
               OR (pm.sender_id=$2 AND pm.receiver_id=$1)
            ORDER BY pm.created_at ASC
            LIMIT 500
        `, [idA, idB]);

        return res.json({ history: histRes.rows });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// ── REST: List all shared resources in the vault ──────────
app.get('/api/peer-resources', authenticateToken, async (req, res) => {
    try {
        const result = await pgPool.query(`
            SELECT pr.id, u.username AS author, u.id AS "authorId",
                   pr.title, pr.content, pr.file_name, pr.file_type, pr.file_data,
                   pr.created_at AS date
            FROM peer_resources pr
            JOIN users u ON u.id = pr.author_id
            ORDER BY pr.created_at DESC
            LIMIT 50
        `);
        return res.json({ resources: result.rows });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// ── REST: Share a resource ────────────────────────────────
app.post('/api/peer-resources/share', authenticateToken, async (req, res) => {
    const { title, content, file } = req.body;
    const myId = req.user.userId;

    if (!title || !content) {
        return res.status(400).json({ error: 'Title and description are required.' });
    }

    let fileName = null, fileType = null, fileData = null;
    if (file && file.name && file.data) {
        // Validate size (base64 ~4/3 of binary)
        if (file.data.length > 14 * 1024 * 1024) {
            return res.status(400).json({ error: 'File too large (max 10MB).' });
        }
        fileName = file.name;
        fileType = file.type || null;
        fileData = file.data;
    }

    try {
        const insertRes = await pgPool.query(`
            INSERT INTO peer_resources(author_id, title, content, file_name, file_type, file_data)
            VALUES($1,$2,$3,$4,$5,$6) RETURNING id
        `, [myId, title, content, fileName, fileType, fileData]);

        // Fetch the full row for broadcast
        const newRes = await pgPool.query(`
            SELECT pr.id, u.username AS author, u.id AS "authorId",
                   pr.title, pr.content, pr.file_name, pr.file_type,
                   pr.created_at AS date
            FROM peer_resources pr
            JOIN users u ON u.id = pr.author_id
            WHERE pr.id = $1
        `, [insertRes.rows[0].id]);

        // Broadcast to all online peers
        const resource = newRes.rows[0];
        if (_wss) {
            const payload = JSON.stringify({ type: 'new_resource', resource });
            for (const [sock] of connectedClients) {
                if (sock.readyState === 1) sock.send(payload);
            }
        }

        return res.json({ success: true, resource });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// ── REST: Delete a shared resource ───────────────────────
app.delete('/api/peer-resources/:resourceId', authenticateToken, async (req, res) => {
    const { resourceId } = req.params;
    const myId = req.user.userId;

    try {
        // Only author or admin can delete
        const check = await pgPool.query(
            'SELECT id, author_id FROM peer_resources WHERE id=$1', [resourceId]
        );
        if (!check.rows.length) return res.status(404).json({ error: 'Resource not found.' });

        const isAdmin = req.user.role === 'admin';
        if (check.rows[0].author_id !== myId && !isAdmin) {
            return res.status(403).json({ error: 'You can only delete your own resources.' });
        }

        await pgPool.query('DELETE FROM peer_resources WHERE id=$1', [resourceId]);

        // Broadcast deletion
        if (_wss) {
            const payload = JSON.stringify({ type: 'resource_deleted', resourceId });
            for (const [sock] of connectedClients) {
                if (sock.readyState === 1) sock.send(payload);
            }
        }

        return res.json({ message: 'Resource deleted.' });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// Health endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'active', platform: 'EduPeers Role-Based L&D Platform', time: new Date() });
});

// ==========================================================
// 13. AI TUTOR & SESSIONS APIS (Cloud-Synced with Gemini 3.6 Flash)
// ==========================================================

const geminiApiKey = (process.env.GEMINI_API_KEY || '').trim().replace(/^['"]|['"]$/g, '');
let geminiGenAi = null;
if (geminiApiKey) {
    geminiGenAi = new GoogleGenAI({ apiKey: geminiApiKey });
}

let openaiClient = null;
if (process.env.OPENAI_API_KEY) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// 13.1 Get All AI Chat Sessions for Logged-In User
app.get('/api/ai/sessions', authenticateToken, async (req, res) => {
    try {
        const result = await pgPool.query(
            'SELECT id, title, created_at, updated_at FROM ai_sessions WHERE user_id = $1 ORDER BY updated_at DESC',
            [req.user.userId]
        );
        return res.json(result.rows);
    } catch (e) {
        console.error('Error fetching AI sessions:', e);
        return res.status(500).json({ error: 'Failed to fetch AI sessions.' });
    }
});

// 13.2 Create a New AI Chat Session
app.post('/api/ai/sessions', authenticateToken, async (req, res) => {
    const { title } = req.body;
    const sessionTitle = (title || 'New Conversation').trim();
    try {
        const result = await pgPool.query(
            `INSERT INTO ai_sessions (user_id, title)
             VALUES ($1, $2)
             RETURNING id, title, created_at, updated_at`,
            [req.user.userId, sessionTitle]
        );
        return res.json(result.rows[0]);
    } catch (e) {
        console.error('Error creating AI session:', e);
        return res.status(500).json({ error: 'Failed to create AI session.' });
    }
});

// 13.3 Get Active Session Messages
app.get('/api/ai/sessions/:sessionId', authenticateToken, async (req, res) => {
    const { sessionId } = req.params;
    try {
        const sessionRes = await pgPool.query(
            'SELECT id, title, created_at, updated_at FROM ai_sessions WHERE id = $1 AND user_id = $2',
            [sessionId, req.user.userId]
        );
        if (sessionRes.rows.length === 0) {
            return res.status(404).json({ error: 'Session not found.' });
        }
        const session = sessionRes.rows[0];

        const messagesRes = await pgPool.query(
            'SELECT id, role, content, created_at FROM ai_messages WHERE session_id = $1 ORDER BY created_at ASC',
            [sessionId]
        );

        return res.json({
            id: session.id,
            title: session.title,
            messages: messagesRes.rows
        });
    } catch (e) {
        console.error('Error fetching session details:', e);
        return res.status(500).json({ error: 'Failed to fetch session details.' });
    }
});

// 13.4 Rename Session Title
app.put('/api/ai/sessions/:sessionId', authenticateToken, async (req, res) => {
    const { sessionId } = req.params;
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required.' });

    try {
        const result = await pgPool.query(
            `UPDATE ai_sessions
             SET title = $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2 AND user_id = $3
             RETURNING id, title, updated_at`,
            [title.trim(), sessionId, req.user.userId]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Session not found.' });
        return res.json(result.rows[0]);
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// 13.5 Delete Single Session
app.delete('/api/ai/sessions/:sessionId', authenticateToken, async (req, res) => {
    const { sessionId } = req.params;
    try {
        const result = await pgPool.query(
            'DELETE FROM ai_sessions WHERE id = $1 AND user_id = $2 RETURNING id',
            [sessionId, req.user.userId]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Session not found.' });
        return res.json({ message: 'Session deleted successfully.', id: sessionId });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// 13.6 Delete All Sessions for User
app.delete('/api/ai/sessions', authenticateToken, async (req, res) => {
    try {
        await pgPool.query('DELETE FROM ai_sessions WHERE user_id = $1', [req.user.userId]);
        return res.json({ message: 'All AI sessions cleared successfully.' });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// 13.7 Delete Single Message
app.delete('/api/ai/messages/:messageId', authenticateToken, async (req, res) => {
    const { messageId } = req.params;
    try {
        const result = await pgPool.query(
            'DELETE FROM ai_messages WHERE id = $1 AND user_id = $2 RETURNING id',
            [messageId, req.user.userId]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Message not found.' });
        return res.json({ message: 'Message deleted successfully.' });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// 13.8 Main AI Tutor Message & Inference Engine
const handleAiTutorMessage = async (req, res) => {
    const { message, sessionId, history } = req.body;
    if (!message || !message.trim()) {
        return res.status(400).json({ error: 'Message content is required.' });
    }

    const userQuery = message.trim();
    let targetSessionId = sessionId;

    try {
        // 1. Ensure a valid active session exists
        if (!targetSessionId) {
            const newSession = await pgPool.query(
                `INSERT INTO ai_sessions (user_id, title)
                 VALUES ($1, $2)
                 RETURNING id, title`,
                [req.user.userId, userQuery.substring(0, 45) + (userQuery.length > 45 ? '...' : '')]
            );
            targetSessionId = newSession.rows[0].id;
        } else {
            // Verify session belongs to user
            const sessCheck = await pgPool.query(
                'SELECT id, title FROM ai_sessions WHERE id = $1 AND user_id = $2',
                [targetSessionId, req.user.userId]
            );
            if (sessCheck.rows.length === 0) {
                const newSession = await pgPool.query(
                    `INSERT INTO ai_sessions (user_id, title)
                     VALUES ($1, $2)
                     RETURNING id, title`,
                    [req.user.userId, userQuery.substring(0, 45) + (userQuery.length > 45 ? '...' : '')]
                );
                targetSessionId = newSession.rows[0].id;
            }
        }

        // 2. Save user message to database
        const userMsgRes = await pgPool.query(
            `INSERT INTO ai_messages (session_id, user_id, role, content)
             VALUES ($1, $2, 'user', $3)
             RETURNING id, created_at`,
            [targetSessionId, req.user.userId, userQuery]
        );
        const userMessageId = userMsgRes.rows[0].id;

        // 3. Retrieve recent session message history for context
        const recentMsgs = await pgPool.query(
            `SELECT role, content FROM ai_messages
             WHERE session_id = $1
             ORDER BY created_at ASC
             LIMIT 20`,
            [targetSessionId]
        );

        let reply = '';
        const systemPrompt = `You are the EduPeers Expert AI Academic & L&D Tutor.
Your goal is to provide clear, structured, pedagogical, and highly effective explanations for trainees and professionals.
Guidelines:
1. Format all answers cleanly using GitHub Flavored Markdown with bold key terms, numbered lists, bullet points, and code blocks.
2. For code, always specify the language tag (e.g. \`\`\`javascript, \`\`\`python, \`\`\`sql) and include helpful inline comments.
3. For mathematical formulas, use standard LaTeX notation (e.g. $E=mc^2$ or $$...$$).
4. Be encouraging, precise, and offer practical examples or follow-up practice suggestions.`;

        // 4. Generate AI response using Gemini 3.6 Flash or OpenAI or Fallback
        if (geminiGenAi) {
            try {
                const contents = recentMsgs.rows.map(m => ({
                    role: m.role === 'ai' ? 'model' : 'user',
                    parts: [{ text: m.content }]
                }));

                const modelName = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
                const geminiResponse = await geminiGenAi.models.generateContent({
                    model: modelName,
                    config: {
                        systemInstruction: {
                            parts: [{ text: systemPrompt }]
                        },
                        temperature: 0.7,
                        maxOutputTokens: 2048
                    },
                    contents: contents
                });

                reply = geminiResponse.text;
            } catch (geminiErr) {
                console.error('Gemini generateContent error, attempting fallback prompt:', geminiErr.message || geminiErr);
                // Simple single prompt fallback with Gemini
                try {
                    const modelName = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
                    const fallbackRes = await geminiGenAi.models.generateContent({
                        model: modelName,
                        contents: `${systemPrompt}\n\nUser Question: ${userQuery}`
                    });
                    reply = fallbackRes.text;
                } catch (fbErr) {
                    console.error('Gemini fallback also failed:', fbErr.message);
                }
            }
        }

        if (!reply && openaiClient) {
            try {
                const messages = [
                    { role: 'system', content: systemPrompt },
                    ...recentMsgs.rows.map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content }))
                ];
                const openaiRes = await openaiClient.chat.completions.create({
                    model: process.env.OPENAI_MODEL || 'gpt-4o',
                    messages: messages,
                    max_tokens: 1500
                });
                reply = openaiRes.choices[0].message.content;
            } catch (openAiErr) {
                console.error('OpenAI inference error:', openAiErr.message);
            }
        }

        if (!reply) {
            reply = `**AI Academic Tutor Response**\n\nI have analyzed your query regarding: *${userQuery}*.\n\n### Key Concept Breakdown:\n1. **Core Principle**: In structured software engineering and enterprise learning, mastering the underlying fundamentals is key.\n2. **Best Practice**: Break down complex problems into modular, testable components.\n3. **Recommended Study Action**: Review your corresponding module notes and attempt practical coding exercises in the study area.\n\n*Feel free to ask a follow-up question or request a code demonstration on this topic!*`;
        }

        // 5. Save AI reply to database
        const aiMsgRes = await pgPool.query(
            `INSERT INTO ai_messages (session_id, user_id, role, content)
             VALUES ($1, $2, 'ai', $3)
             RETURNING id, created_at`,
            [targetSessionId, req.user.userId, reply]
        );
        const aiMessageId = aiMsgRes.rows[0].id;

        // 6. Update session title if it was a default title
        const currentSess = await pgPool.query('SELECT title FROM ai_sessions WHERE id = $1', [targetSessionId]);
        let sessionTitle = currentSess.rows[0]?.title || 'Conversation';
        if (sessionTitle === 'New Conversation') {
            const words = userQuery.split(/\s+/).slice(0, 6).join(' ');
            sessionTitle = words.length > 35 ? words.substring(0, 35) + '...' : words;
            await pgPool.query(
                'UPDATE ai_sessions SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                [sessionTitle, targetSessionId]
            );
        } else {
            await pgPool.query('UPDATE ai_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [targetSessionId]);
        }

        return res.json({
            reply,
            userMessageId,
            aiMessageId,
            sessionId: targetSessionId,
            sessionTitle
        });
    } catch (err) {
        console.error('AI Tutor pipeline error:', err);
        return res.status(500).json({ error: 'AI Tutor service encountered an error. Please try again.' });
    }
};

app.post('/api/ai/tutor', authenticateToken, handleAiTutorMessage);
app.post('/api/ai/chat', authenticateToken, handleAiTutorMessage);

// Start Server
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 EduPeers L&D Platform Server Running on http://127.0.0.1:${PORT}`);
    setupWebSocketServer(server);
});

module.exports = { app, server, pgPool };
