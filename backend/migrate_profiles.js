const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://postgres:cheetah@1306@localhost:5432/edupeers'
});

async function run() {
    console.log('Running Profile Schema Updates...');
    await pool.query(`
        CREATE TABLE IF NOT EXISTS admin_profiles (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            qualifications JSONB DEFAULT '[]',
            work_experience JSONB DEFAULT '[]',
            skills JSONB DEFAULT '[]',
            certifications JSONB DEFAULT '[]',
            bio TEXT,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        ALTER TABLE trainer_profiles ADD COLUMN IF NOT EXISTS skills JSONB DEFAULT '[]';
        ALTER TABLE trainer_profiles ADD COLUMN IF NOT EXISTS work_experience JSONB DEFAULT '[]';
    `);
    console.log('✅ admin_profiles and trainer_profiles schema updated successfully.');
    await pool.end();
}

run().catch(e => {
    console.error('Migration error:', e.message);
    pool.end();
});
