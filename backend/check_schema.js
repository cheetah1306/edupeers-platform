const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgres://postgres:cheetah@1306@localhost:5432/edupeers' });
async function check() {
  const r = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_name IN ('admin_profiles','trainer_profiles','trainee_profiles') ORDER BY table_name");
  console.log('Profile tables:', r.rows.map(x => x.table_name));
  
  const cols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='admin_profiles' ORDER BY ordinal_position");
  console.log('admin_profiles columns:', cols.rows.map(x => x.column_name));
  
  const tcols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='trainer_profiles' ORDER BY ordinal_position");
  console.log('trainer_profiles columns:', tcols.rows.map(x => x.column_name));
  
  const trcols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='trainee_profiles' ORDER BY ordinal_position");
  console.log('trainee_profiles columns:', trcols.rows.map(x => x.column_name));
  
  await pool.end();
}
check().catch(console.error);
