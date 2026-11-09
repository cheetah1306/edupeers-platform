const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'backend', '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgres://postgres:cheetah@1306@localhost:5432/edupeers' });

async function checkData() {
    try {
        const users = await pool.query('SELECT id, username, email, user_role, status, department FROM users ORDER BY created_at ASC');
        console.log('--- ALL USERS IN DB ---');
        console.table(users.rows);
        
        const courses = await pool.query('SELECT id, title, subject, trainer_id, status FROM courses');
        console.log('--- ALL COURSES IN DB ---');
        console.table(courses.rows);
        
        const subs = await pool.query('SELECT id, user_id, questionnaire_id, score_percentage, is_passed FROM submissions');
        console.log('--- ALL SUBMISSIONS IN DB ---');
        console.table(subs.rows);
    } catch (e) {
        console.error('DB Error:', e.message);
    } finally {
        await pool.end();
    }
}

checkData();
