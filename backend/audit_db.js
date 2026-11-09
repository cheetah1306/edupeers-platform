const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function audit() {
  const client = await pool.connect();
  try {
    // Get all tables
    const tables = await client.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`);
    console.log('=== ALL TABLES ===');
    tables.rows.forEach(r => console.log(r.tablename));

    // Show e2e/test users
    console.log('\n=== E2E/TEST USERS ===');
    const testUsers = await client.query(`SELECT id, username, email, user_role, status, created_at FROM users WHERE email LIKE 'e2e.%' OR email LIKE 'test.%' OR (email LIKE '%@edupeers.com' AND email != 'admin@edupeers.com') ORDER BY created_at`);
    console.table(testUsers.rows);

    // Show all homepage_posts
    console.log('\n=== ALL HOMEPAGE POSTS (checking for E2E) ===');
    const posts = await client.query(`SELECT id, title, type, created_at FROM homepage_posts ORDER BY created_at`);
    console.table(posts.rows);

    // Show all resources (checking for E2E)
    console.log('\n=== ALL RESOURCES (checking for e2e) ===');
    const res = await client.query(`SELECT id, title, created_at FROM resources WHERE title ILIKE 'E2E%' ORDER BY created_at`);
    console.table(res.rows);

    // Show all questionnaires (checking for E2E)
    console.log('\n=== QUESTIONNAIRES (checking for E2E) ===');
    const q = await client.query(`SELECT id, title, created_at FROM questionnaires WHERE title ILIKE 'E2E%' ORDER BY created_at`);
    console.table(q.rows);

    // Count all table rows
    console.log('\n=== ROW COUNTS (all tables) ===');
    for (const t of tables.rows) {
      const cnt = await client.query('SELECT COUNT(*) FROM ' + t.tablename);
      console.log(t.tablename + ': ' + cnt.rows[0].count + ' rows');
    }

    // Show ALL users
    console.log('\n=== ALL USERS ===');
    const allUsers = await client.query(`SELECT username, email, user_role, status, created_at FROM users ORDER BY created_at`);
    console.table(allUsers.rows);

  } finally {
    client.release();
    await pool.end();
  }
}
audit().catch(console.error);
