import { HttpException } from '@nestjs/common';
import { HealthController } from './health.controller';

describe('HealthController client IP rate limiting', () => {
  it('trusts the forwarded client IP only when the proxy secret is valid', async () => {
    const secret = 'proxy-secret'.padEnd(32, 'x');
    const redis = {
      client: {
        ping: jest.fn(async () => 'PONG'),
        get: jest.fn(async (key: string) => key === 'discord:blocked_until' ? '0' : '1'),
      },
    };
    const controller = new HealthController(
      { ping: jest.fn(async () => undefined) } as never,
      redis as never,
      { isProd: true, backendProxySecret: secret } as never,
    );
    const response = { setHeader: jest.fn(), status: jest.fn() } as never;
    const forwardedRequest = {
      ip: '10.0.0.1',
      get: (name: string) => ({
        'x-dexbotx-proxy-secret': secret,
        'x-dexbotx-client-ip': '203.0.113.1',
      }[name.toLowerCase()]),
    } as never;

    for (let index = 0; index < 30; index++) {
      await controller.getStatus(forwardedRequest, response);
    }

    const forgedRequest = {
      ip: '198.51.100.2',
      get: (name: string) => name.toLowerCase() === 'x-dexbotx-client-ip' ? '203.0.113.1' : undefined,
    } as never;

    await expect(controller.getStatus(forgedRequest, response)).resolves.toMatchObject({ ok: true });

    await expect(controller.getStatus(forwardedRequest, response)).rejects.toBeInstanceOf(HttpException);
  });
});
