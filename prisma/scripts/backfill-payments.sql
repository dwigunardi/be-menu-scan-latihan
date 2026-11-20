-- Backfills the payments ledger for orders paid before the ledger existed.
--
-- Idempotent: orders that already have a payment are skipped, so it is safe to run more than once.
-- Orders paid before orders.payment_method existed (NULL) are skipped: there is no method to record,
-- and they were never counted in any cashier shift.
-- Shift: the shift whose [opened_at, closed_at] window contains paid_at (the old attribution rule).
-- Source: unknown for legacy rows; CASH is assumed CASHIER and QRIS is assumed GATEWAY.
--
-- Run after `prisma db push`:
--   npx prisma db execute --file prisma/scripts/backfill-payments.sql

INSERT INTO payments (id, order_id, shift_id, method, source, amount, provider_ref, received_by_id, paid_at, created_at)
SELECT
  gen_random_uuid()::text,
  o.id,
  (
    SELECT s.id
    FROM cashier_shifts s
    WHERE o.paid_at >= s.opened_at
      AND (s.closed_at IS NULL OR o.paid_at <= s.closed_at)
    ORDER BY s.opened_at DESC
    LIMIT 1
  ),
  o.payment_method,
  CASE WHEN o.payment_method = 'CASH' THEN 'CASHIER'::"PaymentSource" ELSE 'GATEWAY'::"PaymentSource" END,
  o.total_amount,
  NULL,
  NULL,
  o.paid_at,
  now() AT TIME ZONE 'UTC'
FROM orders o
WHERE o.paid_at IS NOT NULL
  AND o.payment_method IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id);
