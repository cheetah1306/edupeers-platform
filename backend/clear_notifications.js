const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgres://postgres:cheetah@1306@localhost:5432/edupeers' });

async function clearOldNotifications() {
    try {
        const delRes = await pool.query('DELETE FROM notifications');
        console.log(`🧹 Cleared ${delRes.rowCount} old/unwanted notifications.`);
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await pool.end();
    }
}

clearOldNotifications();
