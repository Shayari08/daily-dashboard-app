const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const sqlFiles = [
  'setup-onboarding.sql',
  'recurring-goals.sql',
  'migration-complete.sql',
  'merge-habits-goals.sql',
  'setup-recommendations.sql'
];

const runMigrations = async () => {
  const client = await pool.connect();
  try {
    console.log('Running database migrations...');
    for (const file of sqlFiles) {
      const filePath = path.join(__dirname, '../database', file);
      const sql = fs.readFileSync(filePath, 'utf8');
      await client.query(sql);
      console.log(`✓ ${file}`);
    }
    console.log('✅ Migrations complete');
  } catch (error) {
    console.error('Migration error:', error.message);
    // Don't crash — tables may already exist
  } finally {
    client.release();
    await pool.end();
  }
};

runMigrations();
