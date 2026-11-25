import { currentWeekKey, localDateString } from './economy-time';

describe('economy time helpers', () => {
  it('uses the server local date in Asia/Kathmandu', () => {
    expect(localDateString('Asia/Kathmandu', new Date('2026-11-23T20:30:00Z')))
      .toBe('2026-11-24');
  });

  it('uses the most recent Sunday for the week key', () => {
    expect(currentWeekKey('Asia/Kathmandu', new Date('2026-11-23T20:30:00Z')))
      .toBe('2026-11-22');
  });
});
