const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgres://postgres:cheetah@1306@localhost:5432/edupeers' });

async function checkCoursesAndQuestions() {
    try {
        const courses = await pool.query(`
            SELECT 
                c.id, c.title, c.subject, c.trainer_id, u.username AS trainer_name,
                (SELECT COUNT(*) FROM questionnaires q WHERE q.course_id = c.id) AS questionnaires_count,
                (SELECT COUNT(*) FROM questions qn JOIN questionnaires q ON qn.questionnaire_id = q.id WHERE q.course_id = c.id) AS questions_count
            FROM courses c
            LEFT JOIN users u ON c.trainer_id = u.id
            ORDER BY c.created_at ASC
        `);
        console.log('--- ALL COURSES IN DB ---');
        console.table(courses.rows);

        const questionnaires = await pool.query(`
            SELECT q.id, q.title, q.subject, q.course_id, (SELECT COUNT(*) FROM questions qn WHERE qn.questionnaire_id = q.id) AS questions_count
            FROM questionnaires q
        `);
        console.log('--- ALL QUESTIONNAIRES IN DB ---');
        console.table(questionnaires.rows);

    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await pool.end();
    }
}

checkCoursesAndQuestions();
