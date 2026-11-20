import { z } from 'zod';

/**
 * Branch local time helpers (single branch, Asia/Jakarta / WIB, no DST).
 * All business "days" (today's revenue, date-only filters) are WIB days, independent of server TZ.
 */
export const BRANCH_UTC_OFFSET = '+07:00';
const BRANCH_OFFSET_MS = 7 * 60 * 60 * 1000;
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Query param accepting `YYYY-MM-DD` (a WIB day) or a full ISO datetime with Z/offset. */
export const BranchDateQuerySchema = z.union([
  z.iso.date(),
  z.iso.datetime({ offset: true }),
]);

/**
 * Converts a filter value into an instant. Date-only values expand to the start or end of that WIB day;
 * full datetimes are taken as-is.
 */
export function parseBranchDateBoundary(
  value: string,
  edge: 'start' | 'end',
): Date {
  if (DATE_ONLY_REGEX.test(value)) {
    const time = edge === 'start' ? '00:00:00.000' : '23:59:59.999';
    return new Date(`${value}T${time}${BRANCH_UTC_OFFSET}`);
  }
  return new Date(value);
}

/** Start of the current WIB day as a UTC instant. */
export function startOfBranchDay(now: Date = new Date()): Date {
  const wibDate = new Date(now.getTime() + BRANCH_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
  return parseBranchDateBoundary(wibDate, 'start');
}

/** Builds a Prisma-style `{ gte, lte }` range from optional filter values. */
export function toBranchDateRange(
  startDate?: string,
  endDate?: string,
): { from?: Date; to?: Date } {
  return {
    from: startDate ? parseBranchDateBoundary(startDate, 'start') : undefined,
    to: endDate ? parseBranchDateBoundary(endDate, 'end') : undefined,
  };
}
