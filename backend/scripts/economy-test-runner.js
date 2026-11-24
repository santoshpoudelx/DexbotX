/* eslint-disable @typescript-eslint/no-require-imports, no-useless-assignment */
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const compose = path.join(__dirname, '..', '..', 'docker-compose.test.yml');
const cwd = path.join(__dirname, '..');

function run(args, env = process.env) {
  const result = spawnSync(args[0], args.slice(1), { cwd, env, stdio: 'inherit' });
  if (result.error) {
    console.error(`Could not start ${args[0]}: ${result.error.message}`);
  }
  return result;
}

function docker(args) {
  return run(['docker', 'compose', '-f', compose, ...args]);
}

const start = docker(['up', '-d', '--wait']);
if (start.status !== 0) process.exit(start.status ?? 1);

const env = {
  ...process.env,
  TEST_DATABASE_URL: 'postgresql://dexbotx_test:dexbotx_test_password@127.0.0.1:5433/dexbotx_economy_test',
  TEST_REDIS_URL: 'redis://127.0.0.1:6380',
  NODE_ENV: 'test',
};

let exitCode = 0;
try {
  const migrate = run(['node', 'scripts/economy-test-migrate.js'], env);
  if (migrate.status !== 0) {
    exitCode = migrate.status ?? 1;
  } else {
    const tests = run([
      process.execPath,
      path.join(cwd, 'node_modules', 'jest', 'bin', 'jest.js'),
      '--config', 'jest.e2e.config.js',
      '--runInBand',
      '--forceExit',
      'test/economy.e2e-spec.ts',
    ], env);
    exitCode = tests.status ?? 1;
  }
} finally {
  docker(['down', '-v', '--remove-orphans']);
}

process.exit(exitCode);
