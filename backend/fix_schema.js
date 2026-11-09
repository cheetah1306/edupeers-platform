const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgres://postgres:cheetah@1306@localhost:5432/edupeers' });

async function fixSchema() {
    const client = await pool.connect();
    try {
        // Ensure admin_profiles has updated_at with default
        await client.query(`
            ALTER TABLE admin_profiles 
            ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;
        `).catch(() => console.log('admin_profiles updated_at default already set or col missing'));

        // Ensure trainee_profiles has certificates column (not just experience)
        await client.query(`
            ALTER TABLE trainee_profiles ADD COLUMN IF NOT EXISTS certificates JSONB DEFAULT '[]'::jsonb;
        `).catch(e => console.log('trainee_profiles certificates:', e.message));

        // Make sure users table has profession column
        await client.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS profession TEXT;
        `).catch(() => console.log('profession col already exists'));

        // Make sure users table has designation column  
        await client.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS designation TEXT;
        `).catch(() => console.log('designation col already exists'));

        // Make sure users table has updated_at
        await client.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        `).catch(() => console.log('users.updated_at already exists'));

        console.log('✅ Schema fixes applied');

        // Check existing trainer data
        const trainers = await client.query(`
            SELECT u.id, u.username, u.user_role, u.status, u.department, u.profession, 
                   tp.expertise_tags, tp.skills
            FROM users u
            LEFT JOIN trainer_profiles tp ON tp.user_id = u.id
            WHERE u.user_role = 'trainer'
        `);
        console.log('Trainers:');
        trainers.rows.forEach(t => {
            console.log(`  - ${t.username} | dept:${t.department} | prof:${t.profession} | tags:${JSON.stringify(t.expertise_tags)} | skills:${JSON.stringify(t.skills)}`);
        });

    } finally {
        client.release();
        await pool.end();
    }
}

fixSchema().catch(console.error);
