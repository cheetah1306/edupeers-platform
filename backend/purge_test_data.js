const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgres://postgres:cheetah@1306@localhost:5432/edupeers' });

const REAL_EMAILS = [
    'rajiveakshay1306@gmail.com',
    'mrcatakshay@gmail.com',
    'jacksonhornet1306@gmail.com',
    'admin@edupeers.com',
    'moneshkutti01@gmail.com'
];

async function purgeTestData() {
    console.log('🧹 Purging test-generated records and retaining ONLY real-time users...');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Delete test users (cascades to profiles, enrollments, submissions, views, notes)
        const delUsers = await client.query(`
            DELETE FROM users 
            WHERE email NOT IN ($1, $2, $3, $4, $5)
            RETURNING id, username, email;
        `, REAL_EMAILS);
        console.log(`✅ Deleted ${delUsers.rowCount} test users:`);
        delUsers.rows.forEach(u => console.log(`   - ${u.username} (${u.email})`));

        // 2. Delete test resources (e.g. E2E created resources)
        const delRes = await client.query(`
            DELETE FROM resources 
            WHERE title ILIKE 'E2E%' OR title ILIKE '%Test Cheatsheet%'
            RETURNING id, title;
        `);
        console.log(`✅ Deleted ${delRes.rowCount} test resources.`);

        // 3. Delete test questionnaires (e.g. E2E created questionnaires)
        const delQ = await client.query(`
            DELETE FROM questionnaires 
            WHERE title ILIKE 'E2E%' OR (course_id IS NULL AND trainer_id NOT IN (SELECT id FROM users))
            RETURNING id, title;
        `);
        console.log(`✅ Deleted ${delQ.rowCount} test questionnaires.`);

        // 4. Delete test notifications (e.g. notifications about test users)
        const delNotifs = await client.query(`
            DELETE FROM notifications 
            WHERE message ILIKE '%e2e%' OR message ILIKE '%test.%' OR message ILIKE '%Specialist Trainer%' OR message ILIKE '%178763%';
        `);
        console.log(`✅ Deleted ${delNotifs.rowCount} test notifications.`);

        // 5. Delete test homepage posts (if any)
        const delPosts = await client.query(`
            DELETE FROM homepage_posts 
            WHERE title ILIKE 'E2E%' OR title ILIKE 'Illegal Post';
        `);
        console.log(`✅ Deleted ${delPosts.rowCount} test homepage posts.`);

        await client.query('COMMIT');

        // Verify remaining users
        const remainingUsers = await client.query('SELECT id, username, email, user_role, status FROM users ORDER BY created_at ASC');
        console.log('\n--- VERIFIED REAL-TIME USERS ONLY ---');
        console.table(remainingUsers.rows);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Error purging test data:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

purgeTestData();
