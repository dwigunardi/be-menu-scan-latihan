import {
  BranchDateQuerySchema,
  parseBranchDateBoundary,
  startOfBranchDay,
  toBranchDateRange,
} from './branch-time';

describe('branch-time', () => {
  it('expands date-only values to the whole WIB day', () => {
    expect(parseBranchDateBoundary('2026-11-20', 'start').toISOString()).toBe(
      '2026-11-19T17:00:00.000Z',
    );
    expect(parseBranchDateBoundary('2026-11-20', 'end').toISOString()).toBe(
      '2026-11-20T16:59:59.999Z',
    );
  });

  it('keeps full ISO datetimes as-is', () => {
    expect(
      parseBranchDateBoundary('2026-11-20T05:00:00.000Z', 'end').toISOString(),
    ).toBe('2026-11-20T05:00:00.000Z');
  });

  it('computes the start of the WIB day regardless of server timezone', () => {
    // 23:30 UTC on 20 Nov is already 06:30 WIB on 21 Nov
    expect(
      startOfBranchDay(new Date('2026-11-20T23:30:00.000Z')).toISOString(),
    ).toBe('2026-11-20T17:00:00.000Z');
    // 16:59 UTC on 20 Nov is still 23:59 WIB on 20 Nov
    expect(
      startOfBranchDay(new Date('2026-11-20T16:59:00.000Z')).toISOString(),
    ).toBe('2026-11-19T17:00:00.000Z');
  });

  it('builds an optional range', () => {
    expect(toBranchDateRange()).toEqual({ from: undefined, to: undefined });
    expect(toBranchDateRange(undefined, '2026-11-20').to?.toISOString()).toBe(
      '2026-11-20T16:59:59.999Z',
    );
  });

  it('accepts date-only and ISO datetimes, rejects garbage', () => {
    expect(BranchDateQuerySchema.safeParse('2026-11-20').success).toBe(true);
    expect(
      BranchDateQuerySchema.safeParse('2026-11-20T05:00:00.000Z').success,
    ).toBe(true);
    expect(
      BranchDateQuerySchema.safeParse('2026-11-20T12:00:00+07:00').success,
    ).toBe(true);
    expect(BranchDateQuerySchema.safeParse('kemarin').success).toBe(false);
  });
});
