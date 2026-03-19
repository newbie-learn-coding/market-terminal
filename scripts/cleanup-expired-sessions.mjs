import pg from 'pg';

const { Pool } = pg;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(JSON.stringify({ ok: false, error: 'DATABASE_URL missing' }));
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: url,
    max: 1,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 5_000,
  });

  try {
    const { rowCount } = await pool.query(
      `DELETE FROM market_signal.sessions
       WHERE published IS NOT TRUE
         AND created_at < NOW() - INTERVAL '24 hours'`,
    );
    console.log(
      JSON.stringify({
        ok: true,
        deleted: rowCount ?? 0,
        ranAt: new Date().toISOString(),
      }),
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ ok: false, error: message }));
  process.exit(1);
});
