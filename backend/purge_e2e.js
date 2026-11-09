const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function purgeE2EData() {
    const client = await pool.connect();
    try {
        console.log('🧹 Starting comprehensive E2E test data purge...\n');
        await client.query('BEGIN');

        // ─── Step 1: Identify E2E test user IDs ───────────────────────────────
        const e2eUsers = await client.query(`
            SELECT id, username, email FROM users
            WHERE email LIKE 'e2e.%'
               OR (email LIKE '%@edupeers.com' AND email != 'admin@edupeers.com')
        `);
        const e2eIds = e2eUsers.rows.map(r => r.id);
        console.log(`Found ${e2eIds.length} E2E test users:`);
        e2eUsers.rows.forEach(r => console.log(`  - ${r.username} (${r.email})`));

        if (e2eIds.length === 0) {
            console.log('\n✅ No E2E users found. Database is already clean!');
            await client.query('ROLLBACK');
            await pool.end();
            return;
        }

        // Build parameterized placeholder list  e.g. $1,$2,$3
        const ph = e2eIds.map((_, i) => `$${i + 1}`).join(', ');

        // ─── Step 2: submissions (trainee_id) ─────────────────────────────────
        const delSubs = await client.query(
            `DELETE FROM submissions WHERE trainee_id IN (${ph})`, e2eIds
        );
        console.log(`✅ Deleted ${delSubs.rowCount} submissions`);

        // ─── Step 3: resource_views (user_id) ─────────────────────────────────
        const delViews = await client.query(
            `DELETE FROM resource_views WHERE user_id IN (${ph})`, e2eIds
        );
        console.log(`✅ Deleted ${delViews.rowCount} resource_views`);

        // ─── Step 4: enrollments (user_id) ────────────────────────────────────
        const delEnroll = await client.query(
            `DELETE FROM enrollments WHERE user_id IN (${ph})`, e2eIds
        );
        console.log(`✅ Deleted ${delEnroll.rowCount} enrollments`);

        // ─── Step 5: feedback (user_id) ───────────────────────────────────────
        const delFeedback = await client.query(
            `DELETE FROM feedback WHERE user_id IN (${ph})`, e2eIds
        );
        console.log(`✅ Deleted ${delFeedback.rowCount} feedback entries`);

        // ─── Step 6: notifications (user_id) ──────────────────────────────────
        const delNotif = await client.query(
            `DELETE FROM notifications WHERE user_id IN (${ph})`, e2eIds
        );
        console.log(`✅ Deleted ${delNotif.rowCount} notifications`);

        // ─── Step 7: audit_logs (actor_id OR target_user_id) ──────────────────
        const ph2 = e2eIds.map((_, i) => `$${e2eIds.length + i + 1}`).join(', ');
        const delAudit = await client.query(
            `DELETE FROM audit_logs WHERE actor_id IN (${ph}) OR target_user_id IN (${ph2})`,
            [...e2eIds, ...e2eIds]
        );
        console.log(`✅ Deleted ${delAudit.rowCount} audit log entries`);

        // ─── Step 8: ai_sessions (user_id) ────────────────────────────────────
        const delAISess = await client.query(
            `DELETE FROM ai_sessions WHERE user_id IN (${ph})`, e2eIds
        );
        console.log(`✅ Deleted ${delAISess.rowCount} AI sessions`);

        // ─── Step 9: messages (sender_id OR receiver_id) ──────────────────────
        const delMsgs = await client.query(
            `DELETE FROM messages WHERE sender_id IN (${ph}) OR receiver_id IN (${ph2})`,
            [...e2eIds, ...e2eIds]
        );
        console.log(`✅ Deleted ${delMsgs.rowCount} messages`);

        // ─── Step 10: peer_connections ────────────────────────────────────────
        const delPeerConn = await client.query(
            `DELETE FROM peer_connections WHERE requester_id IN (${ph}) OR addressee_id IN (${ph2})`,
            [...e2eIds, ...e2eIds]
        );
        console.log(`✅ Deleted ${delPeerConn.rowCount} peer connections`);

        // ─── Step 11: peer_messages ───────────────────────────────────────────
        const delPeerMsgs = await client.query(
            `DELETE FROM peer_messages WHERE sender_id IN (${ph}) OR receiver_id IN (${ph2})`,
            [...e2eIds, ...e2eIds]
        );
        console.log(`✅ Deleted ${delPeerMsgs.rowCount} peer messages`);

        // ─── Step 12: peer_resources (author_id) ──────────────────────────────
        const delPeerRes = await client.query(
            `DELETE FROM peer_resources WHERE author_id IN (${ph})`, e2eIds
        );
        console.log(`✅ Deleted ${delPeerRes.rowCount} peer resources`);

        // ─── Step 13: homepage_posts (author_id OR E2E title) ─────────────────
        const delPosts = await client.query(
            `DELETE FROM homepage_posts WHERE author_id IN (${ph}) OR title ILIKE 'E2E%'`, e2eIds
        );
        console.log(`✅ Deleted ${delPosts.rowCount} E2E homepage posts`);

        // ─── Step 14: homepage_notifications (author_id) ──────────────────────
        const delHPNotif = await client.query(
            `DELETE FROM homepage_notifications WHERE author_id IN (${ph})`, e2eIds
        );
        console.log(`✅ Deleted ${delHPNotif.rowCount} homepage_notifications`);

        // ─── Step 15: questions & submissions from E2E questionnaires ─────────
        const e2eQuests = await client.query(
            `SELECT id FROM questionnaires WHERE title ILIKE 'E2E%' OR trainer_id IN (${ph})`, e2eIds
        );
        if (e2eQuests.rows.length > 0) {
            const qIds = e2eQuests.rows.map(r => r.id);
            const qph = qIds.map((_, i) => `$${i + 1}`).join(', ');
            await client.query(`DELETE FROM submissions WHERE questionnaire_id IN (${qph})`, qIds);
            const delQs = await client.query(`DELETE FROM questions WHERE questionnaire_id IN (${qph})`, qIds);
            console.log(`✅ Deleted ${delQs.rowCount} questions from E2E questionnaires`);
        }

        // ─── Step 16: E2E questionnaires ──────────────────────────────────────
        const delQuests = await client.query(
            `DELETE FROM questionnaires WHERE title ILIKE 'E2E%' OR trainer_id IN (${ph})`, e2eIds
        );
        console.log(`✅ Deleted ${delQuests.rowCount} E2E questionnaires`);

        // ─── Step 17: E2E resources ───────────────────────────────────────────
        const delRes = await client.query(
            `DELETE FROM resources WHERE title ILIKE 'E2E%' OR trainer_id IN (${ph})`, e2eIds
        );
        console.log(`✅ Deleted ${delRes.rowCount} E2E resources`);

        // ─── Step 18: trainee_profiles & trainer_profiles ─────────────────────
        const delTP = await client.query(
            `DELETE FROM trainee_profiles WHERE user_id IN (${ph})`, e2eIds
        );
        console.log(`✅ Deleted ${delTP.rowCount} trainee profiles`);

        const delTRP = await client.query(
            `DELETE FROM trainer_profiles WHERE user_id IN (${ph})`, e2eIds
        );
        console.log(`✅ Deleted ${delTRP.rowCount} trainer profiles`);

        // ─── Step 19: Delete the E2E user accounts ────────────────────────────
        const delUsers = await client.query(
            `DELETE FROM users WHERE id IN (${ph}) RETURNING username, email`, e2eIds
        );
        console.log(`\n🗑️  Deleted ${delUsers.rowCount} E2E user accounts:`);
        delUsers.rows.forEach(r => console.log(`   - ${r.username} (${r.email})`));

        await client.query('COMMIT');
        console.log('\n✅ COMMIT: All E2E test data purged successfully!\n');

        // ─── Final State Summary ───────────────────────────────────────────────
        console.log('='.repeat(55));
        console.log('📊  REMAINING REAL DATA — DATABASE STATE AFTER PURGE');
        console.log('='.repeat(55));

        const remainUsers = await client.query(`SELECT username, email, user_role, status FROM users ORDER BY created_at`);
        console.log('\n👤 REAL USERS:');
        console.table(remainUsers.rows);

        const remainPosts = await client.query(`SELECT title, type, created_at FROM homepage_posts ORDER BY created_at`);
        console.log('\n📢 HOMEPAGE POSTS:');
        console.table(remainPosts.rows);

        const remainRes = await client.query(`SELECT title, type, status FROM resources ORDER BY created_at`);
        console.log('\n📚 RESOURCES:');
        console.table(remainRes.rows);

        const remainQuests = await client.query(`SELECT title, status FROM questionnaires ORDER BY created_at`);
        console.log('\n📝 QUESTIONNAIRES:');
        console.table(remainQuests.rows);

        // Non-zero row counts
        const tables = await client.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`);
        console.log('\n📈 NON-EMPTY TABLE COUNTS:');
        for (const t of tables.rows) {
            const cnt = await client.query('SELECT COUNT(*) FROM ' + t.tablename);
            const n = parseInt(cnt.rows[0].count);
            if (n > 0) console.log(`  ${t.tablename}: ${n} rows`);
        }

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('\n❌ ERROR — ROLLBACK executed. No data was changed.');
        console.error(e.message);
    } finally {
        client.release();
        await pool.end();
    }
}

purgeE2EData();
