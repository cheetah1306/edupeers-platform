const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgres://postgres:cheetah@1306@localhost:5432/edupeers' });

async function migrate() {
    try {
        console.log('Running migration: ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;');
        await pool.query('ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;');
        console.log('✅ Migration successful!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    }
}

migrate();
