const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: __dirname + '/.env' });

const BASE_URL = 'http://127.0.0.1:4000';
const JWT_SECRET = process.env.JWT_SECRET || 'edupeers_jwt_secure_secret_2026';
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://postgres:cheetah@1306@localhost:5432/edupeers'
});

async function api(path, options = {}) {
    const res = await fetch(`${BASE_URL}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        }
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
}

async function runTest() {
    console.log('--- Testing AI Tutor End-to-End Pipeline ---');

    // 1. Get or create test user
    const userRes = await pool.query("SELECT * FROM users WHERE user_role = 'trainee' LIMIT 1");
    let testUser = userRes.rows[0];
    if (!testUser) {
        const ins = await pool.query(`
            INSERT INTO users (username, email, password_hash, user_role, status, department)
            VALUES ('Tutor Learner', 'tutor.test@edupeers.com', '$2a$10$abcdef', 'trainee', 'active', 'Engineering')
            RETURNING *;
        `);
        testUser = ins.rows[0];
    }

    const token = jwt.sign(
        { userId: testUser.id, username: testUser.username, email: testUser.email, role: testUser.user_role, status: 'active' },
        JWT_SECRET,
        { expiresIn: '1h' }
    );

    const headers = { 'Authorization': `Bearer ${token}` };

    // 2. Create a new AI Session
    console.log('1. Creating new AI Chat Session...');
    const createSessRes = await api('/api/ai/sessions', {
        method: 'POST',
        headers,
        body: JSON.stringify({ title: 'JavaScript Concurrency Study' })
    });
    console.log('   Create session status:', createSessRes.status);
    if (createSessRes.status !== 200 || !createSessRes.data.id) {
        throw new Error(`Failed to create session: ${JSON.stringify(createSessRes.data)}`);
    }
    const sessionId = createSessRes.data.id;
    console.log('   Session ID:', sessionId);

    // 3. List AI Sessions
    console.log('\n2. Listing user AI Sessions...');
    const listSessRes = await api('/api/ai/sessions', { headers });
    console.log('   List status:', listSessRes.status);
    console.log('   Total sessions found:', listSessRes.data.length);

    // 4. Send a query to AI Tutor (Gemini 3.6 Flash)
    console.log('\n3. Sending academic query to AI Tutor via /api/ai/tutor...');
    const tutorRes = await api('/api/ai/tutor', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            message: 'In 2 sentences, what is an event loop in JavaScript?',
            sessionId
        })
    });
    console.log('   AI Tutor status:', tutorRes.status);
    console.log('   AI Tutor reply preview:\n', tutorRes.data.reply);

    if (tutorRes.status !== 200 || !tutorRes.data.reply) {
        throw new Error(`AI Tutor failed: ${JSON.stringify(tutorRes.data)}`);
    }

    // 5. Verify conversation history in PostgreSQL
    console.log('\n4. Verifying stored message history in PostgreSQL...');
    const sessDetailRes = await api(`/api/ai/sessions/${sessionId}`, { headers });
    console.log('   Messages stored count:', sessDetailRes.data.messages?.length);
    if (!sessDetailRes.data.messages || sessDetailRes.data.messages.length < 2) {
        throw new Error('Expected at least 2 messages (user + AI) in database.');
    }
    console.log('   ✅ User message and AI response verified in PostgreSQL database!');

    // 6. Cleanup test session
    console.log('\n5. Cleaning up test session...');
    const delRes = await api(`/api/ai/sessions/${sessionId}`, {
        method: 'DELETE',
        headers
    });
    console.log('   Delete session status:', delRes.status);

    console.log('\n🎉 ALL AI TUTOR END-TO-END TESTS PASSED SUCCESSFULLY!');
}

runTest().catch(err => {
    console.error('Test failed:', err);
    pool.end();
    process.exit(1);
}).finally(() => {
    pool.end();
});
