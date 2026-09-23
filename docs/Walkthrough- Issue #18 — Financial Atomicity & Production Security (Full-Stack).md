# Walkthrough — Issue #18: Financial Atomicity & Production Security

## Delivered

Issue #18 introduces the shared application safeguards used by sensitive financial APIs.

## Idempotency protection

1. Financial write routes now require an `Idempotency-Key` header.
2. The frontend automatically creates that key for POST, PUT, PATCH, and DELETE API calls.
3. The backend associates the key with the authenticated actor and operation type.
4. A completed identical request returns the original response rather than creating a second financial event.
5. A concurrent identical request is rejected while the first is still processing.
6. Failed requests do not reserve the key, so a corrected request can be submitted safely.

Protected operations include payment collection, expenses, custody transfers/reconciliation, investment funding/returns/reinvestment, and wallet reinvestment/liquidation.

## Security baseline

- Every response receives a correlation `X-Request-Id` header.
- The API disables `X-Powered-By`, blocks framing, prevents MIME sniffing, sets a no-referrer policy, and disables unused browser permissions.
- Production responses additionally use a restrictive base Content Security Policy.
- Sign-in attempts are rate-limited per client/email combination.
- Production startup rejects weak/default JWT secrets and non-HTTPS CORS origins.
- Password reset continues to expire after 15 minutes and revokes existing sessions after successful reset.

## Production transaction requirement

MongoDB transactions require a replica set. Production deployment must use a replica-set/managed MongoDB URI before financial posting can be certified as fully atomic. A standalone local MongoDB instance is suitable only for development and cannot provide database rollback guarantees.

## Verification performed

- Backend TypeScript production build passed.
- Frontend TypeScript/Vite production build passed.
- Health endpoint returned correlation and security headers.
- Financial API calls without an idempotency key were rejected with HTTP 400.
- Existing RBAC checks remained active.
