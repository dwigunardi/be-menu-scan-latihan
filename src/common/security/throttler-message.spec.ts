import { ExecutionContext } from '@nestjs/common';
import { ThrottlerLimitDetail } from '@nestjs/throttler';
import { throttlerErrorMessage } from './throttler-message';

describe('throttlerErrorMessage', () => {
  const detail = (timeToBlockExpire: number) =>
    ({
      ttl: 60000,
      limit: 100,
      key: 'k',
      tracker: '127.0.0.1',
      totalHits: 101,
      timeToExpire: timeToBlockExpire,
      isBlocked: true,
      timeToBlockExpire,
    }) as ThrottlerLimitDetail;
  const context = {} as ExecutionContext;

  it('tells the user in Indonesian how many seconds to wait', () => {
    expect(throttlerErrorMessage(context, detail(42))).toBe(
      'Terlalu banyak permintaan. Coba lagi dalam 42 detik.',
    );
  });

  it('never says 0 seconds', () => {
    expect(throttlerErrorMessage(context, detail(0))).toContain('1 detik');
  });
});
