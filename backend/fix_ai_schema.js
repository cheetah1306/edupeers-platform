const { Pool } = require('pg');
require('dotenv').config({ path: __dirname + '/.env' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://postgres:cheetah@1306@localhost:5432/edupeers'
});

async function fixAiTables() {
    try {
        console.log('Fixing AI tables columns...');
        await pool.query(`
            ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
            ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user';
            ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS content TEXT;
            ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
        `);

        const res = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'ai_messages'");
        console.log('Columns in ai_messages:', res.rows.map(r => r.column_name));
    } catch (e) {
        console.error('Error fixing AI tables:', e);
    } finally {
        await pool.end();
    }
}

fixAiTables();
