const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgres://postgres:cheetah@1306@localhost:5432/edupeers' });

async function cleanupFictionalData() {
    const client = await pool.connect();
    try {
        console.log('🧹 Purging all fictional seed and automated test users...');
        await client.query('BEGIN');

        // Delete test and seed users (keep admin@edupeers.com and real users like moneshkutti01@gmail.com)
        const deleteRes = await client.query(`
            DELETE FROM users 
            WHERE email != 'admin@edupeers.com' 
              AND (
                email LIKE '%@edupeers.com'
                OR email LIKE 'test.%'
                OR email LIKE 'e2e.%'
                OR email LIKE 'trainer.ai.%'
                OR email LIKE 'trainee.ai.%'
                OR email LIKE 'trainee.cyber.%'
                OR email LIKE 'robert.trainer.%'
                OR username IN ('Sarah Jenkins', 'Dr. Alex Rivera', 'Marcus Vance', 'Akshay Sharma', 'Priya Patel', 'David Kim', 'Emily Watson', 'Michael Chang', 'Rachel Green', 'Jordan Lee', 'Professor Alan AI', 'Alice AI Learner', 'Bob Cyber Specialist', 'Dr. Robert Specialist')
              )
            RETURNING id, username, email;
        `);

        console.log(`Deleted ${deleteRes.rowCount} fictional/test users:`);
        deleteRes.rows.forEach(r => console.log(` - ${r.username} (${r.email})`));

        // Delete orphaned courses or courses authored by non-existent trainers
        const delCourses = await client.query(`
            DELETE FROM courses WHERE trainer_id IS NOT NULL AND trainer_id NOT IN (SELECT id FROM users);
        `);
        console.log(`Cleaned up ${delCourses.rowCount} orphaned courses.`);

        // Delete fake announcements
        await client.query(`
            DELETE FROM homepage_posts WHERE author_id NOT IN (SELECT id FROM users);
        `);

        // Delete fake feedback
        await client.query(`
            DELETE FROM feedback WHERE user_id NOT IN (SELECT id FROM users);
        `);

        // Delete fake notifications
        await client.query(`
            DELETE FROM notifications WHERE user_id NOT IN (SELECT id FROM users);
        `);

        await client.query('COMMIT');
        console.log('✅ Database successfully cleaned of all fictional records!');

        const remainingUsers = await client.query('SELECT id, username, email, user_role, status, department FROM users');
        console.log('--- REMAINING REAL USERS IN DATABASE ---');
        console.table(remainingUsers.rows);

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Error during cleanup:', e);
    } finally {
        client.release();
        await pool.end();
    }
}

cleanupFictionalData();
