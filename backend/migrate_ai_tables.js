const { Pool } = require('pg');
require('dotenv').config({ path: __dirname + '/.env' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://postgres:cheetah@1306@localhost:5432/edupeers'
});

async function migrateAiTables() {
    try {
        console.log('--- Migrating AI Sessions & AI Messages Tables ---');
        
        await pool.query(`
            CREATE EXTENSION IF NOT EXISTS pgcrypto;

            CREATE TABLE IF NOT EXISTS ai_sessions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                title VARCHAR(255) NOT NULL DEFAULT 'New Conversation',
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS ai_messages (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                session_id UUID NOT NULL REFERENCES ai_sessions(id) ON DELETE CASCADE,
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'ai')),
                content TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_ai_sessions_user ON ai_sessions(user_id);
            CREATE INDEX IF NOT EXISTS idx_ai_messages_session ON ai_messages(session_id);
        `);

        console.log('✅ AI Tables created/verified in PostgreSQL database successfully!');
    } catch (err) {
        console.error('❌ AI Tables Migration failed:', err);
    } finally {
        await pool.end();
    }
}

migrateAiTables();
