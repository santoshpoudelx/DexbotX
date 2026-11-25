/* eslint-disable @typescript-eslint/no-require-imports */
require('dotenv').config({ path: '../.env.test', override: true });
require('./economy-test-guard');

const postgres = require('postgres');
const { drizzle } = require('drizzle-orm/postgres-js');
const { migrate } = require('drizzle-orm/postgres-js/migrator');
const path = require('node:path');

async function main() {
  const sql = postgres(process.env.TEST_DATABASE_URL, { max: 1, ssl: false, prepare: false });
  try {
    await migrate(drizzle(sql), { migrationsFolder: path.join(__dirname, '..', 'drizzle') });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
