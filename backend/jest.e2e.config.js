/** Integration tests: embedded Postgres plus Redis from DEXBOTX_E2E_REDIS_URL or PATH. */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: 'test/.*\\.e2e-spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.spec.json' }] },
  testTimeout: 120000,
};
