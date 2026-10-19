const fs = require('fs');
const path = require('path');

// Local mode: runs a bundled PostgreSQL (embedded-postgres) so no separate
// PostgreSQL install is needed. Data persists in backend/.pgdata.
const startLocalDatabase = async () => {
  if (process.env.EMBEDDED_POSTGRES !== 'true') return null;

  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const url = new URL(process.env.DATABASE_URL);
  const databaseDir = path.join(__dirname, '..', '.pgdata');
  const isNew = !fs.existsSync(path.join(databaseDir, 'PG_VERSION'));

  const pg = new EmbeddedPostgres({
    databaseDir,
    port: Number(url.port) || 5432,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    persistent: true,
    onLog: () => {},
    onError: (err) => console.error('[embedded-postgres]', err)
  });

  if (isNew) {
    console.log('Creating local PostgreSQL database (first run)...');
    await pg.initialise();
  }
  await pg.start();

  const dbName = url.pathname.replace(/^\//, '');
  const client = pg.getPgClient();
  await client.connect();
  try {
    const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (exists.rowCount === 0) await pg.createDatabase(dbName);
  } finally {
    await client.end();
  }

  console.log(`✓ Local PostgreSQL running on port ${url.port}`);
  return pg;
};

module.exports = startLocalDatabase;
