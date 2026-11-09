const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.query(`
    SELECT table_name, column_name 
    FROM information_schema.columns 
    WHERE table_schema='public' 
      AND table_name IN ('submissions','audit_logs','ai_sessions','resource_views','messages','homepage_notifications','questionnaires','resources','trainee_profiles','trainer_profiles')
    ORDER BY table_name, ordinal_position
`).then(r => {
    console.table(r.rows);
    pool.end();
}).catch(e => {
    console.error(e);
    pool.end();
});
