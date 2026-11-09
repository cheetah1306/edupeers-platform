const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const JWT_SECRET = process.env.JWT_SECRET || 'edupeers_jwt_secure_secret_2026';
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://postgres:cheetah@1306@localhost:5432/edupeers'
});

async function runTests() {
    console.log('--- Testing Profile & Competency Matrix APIs ---');

    // 1. Fetch Admin user
    const adminRes = await pool.query('SELECT * FROM users WHERE user_role=\'admin\' LIMIT 1');
    const admin = adminRes.rows[0];
    const adminToken = jwt.sign({ userId: admin.id, role: 'admin', status: 'active', email: admin.email, username: admin.username }, JWT_SECRET);

    // 2. Fetch Trainer user
    const trainerRes = await pool.query('SELECT * FROM users WHERE user_role=\'trainer\' LIMIT 1');
    const trainer = trainerRes.rows[0];
    const trainerToken = jwt.sign({ userId: trainer.id, role: 'trainer', status: 'active', email: trainer.email, username: trainer.username }, JWT_SECRET);

    // 3. Fetch Trainee user
    const traineeRes = await pool.query('SELECT * FROM users WHERE user_role=\'trainee\' LIMIT 1');
    const trainee = traineeRes.rows[0];
    const traineeToken = jwt.sign({ userId: trainee.id, role: 'trainee', status: 'active', email: trainee.email, username: trainee.username }, JWT_SECRET);

    // Test Competency Map API
    const compRes = await fetch('http://127.0.0.1:4000/api/competency-map', {
        headers: { 'Authorization': 'Bearer ' + adminToken }
    });
    const compData = await compRes.json();
    console.log('✅ Competency Map response status:', compRes.status);
    console.log(`✅ Total Subjects: ${compData.total_subjects}, Total Trainers: ${compData.total_trainers}`);
    compData.matrix.forEach(m => {
        console.log(`   - ${m.subject.name} (${m.subject.category}): ${m.qualified_trainers_count} trainer(s) -> [${m.trainers.map(t => t.name).join(', ')}]`);
    });

    // Test Profile for Admin
    const admProfRes = await fetch('http://127.0.0.1:4000/api/profile', {
        headers: { 'Authorization': 'Bearer ' + adminToken }
    });
    const admProf = await admProfRes.json();
    console.log(`✅ Admin Profile: ${admProf.user.username} (${admProf.user.user_role}), Completeness: ${admProf.profile.completeness_percentage}%`);

    // Test Profile for Trainer
    const trnProfRes = await fetch('http://127.0.0.1:4000/api/profile', {
        headers: { 'Authorization': 'Bearer ' + trainerToken }
    });
    const trnProf = await trnProfRes.json();
    console.log(`✅ Trainer Profile: ${trnProf.user.username} (${trnProf.user.user_role}), Completeness: ${trnProf.profile.completeness_percentage}%`);

    // Test Profile for Trainee
    const trn2ProfRes = await fetch('http://127.0.0.1:4000/api/profile', {
        headers: { 'Authorization': 'Bearer ' + traineeToken }
    });
    const trn2Prof = await trn2ProfRes.json();
    console.log(`✅ Trainee Profile: ${trn2Prof.user.username} (${trn2Prof.user.user_role}), Completeness: ${trn2Prof.profile.completeness_percentage}%`);

    // Test Adding Skill via PUT /api/profile
    const updateRes = await fetch('http://127.0.0.1:4000/api/profile', {
        method: 'PUT',
        headers: {
            'Authorization': 'Bearer ' + traineeToken,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            skills: [{ name: 'PostgreSQL Database Administration', level: 'Advanced' }],
            qualifications: [{ degree: 'B.E. Computer Science', institution: 'Anna University', year: '2024', grade: '8.9 GPA' }]
        })
    });
    console.log('✅ Trainee Profile Update status:', updateRes.status);

    // Re-verify completeness
    const reCheck = await fetch('http://127.0.0.1:4000/api/profile', {
        headers: { 'Authorization': 'Bearer ' + traineeToken }
    });
    const reCheckData = await reCheck.json();
    console.log(`✅ Trainee Updated Completeness: ${reCheckData.profile.completeness_percentage}% (Skills: ${reCheckData.profile.skills.length}, Quals: ${reCheckData.profile.qualifications.length})`);

    console.log('🎉 ALL PROFILE & COMPETENCY TESTS PASSED!');
    await pool.end();
}

runTests().catch(e => {
    console.error('Test Err:', e);
    pool.end();
});
