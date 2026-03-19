import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';

const { Pool } = pg;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(JSON.stringify({ ok: false, error: 'DATABASE_URL missing' }));
    process.exit(1);
  }

  const schemaPath = process.env.SCHEMA_PATH || resolve(process.cwd(), 'schema.sql');
  const sql = await readFile(schemaPath, 'utf8');

  const pool = new Pool({
    connectionString: url,
    max: 1,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 5_000,
  });

  try {
    await pool.query(sql);
    console.log(JSON.stringify({ ok: true, schemaPath, appliedAt: new Date().toISOString() }));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ ok: false, error: message }));
  process.exit(1);
});
