const url = process.env.TEST_DATABASE_URL;
const redisUrl = process.env.TEST_REDIS_URL;

if (process.env.NODE_ENV === 'production') {
  throw new Error('Economy tests refused: NODE_ENV=production');
}
if (!/^postgres(?:ql)?:\/\/[^@]+@127\.0\.0\.1:5433\/[^/?]+(?:\?.*)?$/.test(url ?? '') &&
    !/^postgres(?:ql)?:\/\/[^@]+@localhost:5433\/[^/?]+(?:\?.*)?$/.test(url ?? '')) {
  throw new Error('Economy tests refused: TEST_DATABASE_URL must point to 127.0.0.1:5433');
}
if (!/^redis:\/\/(?:127\.0\.0\.1|localhost):6380(?:\/\d+)?$/.test(redisUrl ?? '')) {
  throw new Error('Economy tests refused: TEST_REDIS_URL must point to 127.0.0.1:6380');
}
