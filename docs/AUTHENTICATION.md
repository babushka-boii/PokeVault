# Google authentication — Iteration 5A

Implemented on 2026-10-24. Real Google credentials are intentionally absent.
Mocked authentication tests do not certify live Google consent or login.

## Architecture and API

React calls FastAPI; FastAPI alone exchanges authorization codes with Google.
Authlib handles OAuth/PKCE and OIDC claim validation, with joserfc for JWT
signature verification. Only `openid email profile` are requested. Google access
and ID tokens exist only while verifying a callback; refresh tokens are neither
requested nor persisted. No session credential enters localStorage.

| Endpoint | Behavior |
| --- | --- |
| `GET /api/v1/auth/google/login` | Creates a server-side login transaction and browser cookie, then redirects to Google. `Accept: application/json` returns `authorization_url` for the React login button. |
| `GET /api/v1/auth/google/callback` | Consumes the bound transaction, exchanges code, validates identity, persists user/session, redirects to configured frontend `/profile`. Failures go to `/login?error=<sanitized code>`. |
| `GET /api/v1/auth/me` | Returns `{user: {id, display_name, email, email_verified, picture_url}, csrf_token}`; missing/expired sessions return 401. |
| `POST /api/v1/auth/logout` | Requires the session, trusted Origin and `X-CSRF-Token`; invalidates the DB session and clears cookie; returns 204. |

Redirect destinations come from validated backend configuration. Request Host,
client-supplied `next`, and user IDs never select a redirect or account. Private
responses use `Cache-Control: no-store`; error details contain stable codes only.

## Login and session lifecycle

Each attempt generates independent high-entropy state, nonce, PKCE verifier and
browser binding. PostgreSQL stores the state/binding digests and short-lived
nonce/verifier. The browser gets a host-only HttpOnly transaction cookie. The
callback atomically consumes the matching transaction before contacting Google,
including cancellation and failed exchanges. Transactions expire after 600 seconds
by default. Replaying a callback or moving its URL to another browser fails.

The ID token must have a valid Google RS256 signature and matching issuer,
audience, expiration and nonce; relevant OIDC authorized-party/hash checks also
apply. A user is found by unique Google `sub`, never by email. Profile metadata can
change without changing the internal UUID. User creation/settings/session writes
are transactional; uniqueness protects concurrent first sign-ins.

Successful authentication creates a fresh opaque session and invalidates the
browser's previous session. Only its SHA-256 digest is stored. Absolute lifetime
defaults to seven days and is enforced by the server. Logout deletes the session;
clearing browser state alone is insufficient. Session cookies use HttpOnly,
SameSite=Lax, Path=/api/v1, no Domain and Secure in HTTPS deployments. The short-lived
flow cookie uses Path=/api/v1/auth. Lax permits
Google's top-level callback. CSRF protection combines a session-bound token in a
custom header with exact Origin validation. The CSRF token stays in React memory.

## Google Cloud Console setup

1. Open [Google Cloud Console](https://console.cloud.google.com/), then select or
   create the project that will own PokéVault's OAuth client.
2. Open **Google Auth platform → Branding** (or **Get started**). Supply the app
   name, support email and developer contact. Under **Audience**, choose the
   appropriate audience; External is usual for an academic app with personal
   Google accounts. Complete any Console-required branding fields.
3. Under **Data Access**, use only identity scopes: `openid`, email and profile.
   No Gmail, Drive or other Google API permissions are needed.
4. Under **Audience → Test users**, add intended testers when required by the
   publishing/audience configuration. Google currently exempts apps requesting
   only these identity scopes from the External/Testing test-user restriction;
   organization administrator policies can still prevent access.
5. Open **Clients → Create client → Web application**. Add this exact authorized
   redirect URI, with no trailing slash:
   `http://localhost:8000/api/v1/auth/google/callback`.
   Authorized JavaScript origins are unnecessary for this server redirect flow.
6. Copy the Client ID and Client Secret into the ignored `backend/.env` as
   `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Never put the secret in a
   `VITE_*` variable, source file, screenshot, issue or log.
7. Keep `GOOGLE_REDIRECT_URI`, `FRONTEND_ORIGIN`, `CORS_ORIGINS` and
   `VITE_API_BASE_URL` equal to the example localhost values. Install the updated
   backend requirements and run Alembic before testing.
8. From `backend`, run
   `.venv/bin/uvicorn app.main:create_app --factory --reload --no-access-log`.
   From the repository root, run `npm run dev --prefix frontend`. Open
   `http://localhost:5173/login` and choose Continue with Google.
9. Confirm that `/profile` shows your actual Google profile, refresh restores the
   same account, logout invalidates it, and public Boxes/Pokédex/TCG still work.
   A changed email must retain the original internal account identity.

Without credentials, the login endpoint fails safely with a configuration error;
the UI explains that the backend Google configuration is missing. Public catalog
browsing remains available. A fake account is never substituted.

## Local cookies and deployment

Use `localhost` for both processes: ports 5173 and 8000 are different origins but
the same site. Auth requests need `credentials: "include"`; FastAPI permits
credentials only for configured exact origins and explicit methods/headers. Do
not switch one URL to `127.0.0.1` or use credentialed wildcard CORS. Local HTTP
development uses `AUTH_COOKIE_SECURE=false`; this is not a production setting.

For production, configure `APP_ENV=production`, `AUTH_COOKIE_SECURE=true`, the
exact HTTPS backend callback registered in Google, and the exact HTTPS frontend
origin in both frontend and backend configuration. Use the same site for frontend
and API (or a same-origin reverse proxy); unrelated sites require a separately
reviewed cookie/CSRF design. Configure the reverse proxy to omit query strings
from OAuth callback access logs. Authorization codes necessarily return in the
OIDC callback query; they are never application session tokens. Keep access logs
disabled or redacted and use `Referrer-Policy: no-referrer` on auth responses.

| Symptom | Check |
| --- | --- |
| `redirect_uri_mismatch` | Scheme, host, port, exact callback path, case and trailing slash in Google and `GOOGLE_REDIRECT_URI`; restart backend after edits. |
| `configuration` | Both credentials are present in backend `.env`; run API from `backend`; restart after changes. |
| `invalid_state` | Login restarted, expired, replayed or initiated in another browser; retry from `/login`. Check transaction cookie/hostname. |
| Login succeeds then profile is signed out | Hostnames, credentialed requests, exact CORS origin, Secure flag on HTTP, same-site deployment and blocked cookies. |
| `provider_unavailable` / `invalid_token` | Network reachability, actual client credentials, host clock and fresh attempt; never paste token responses into logs. |
| `database_unavailable` | PostgreSQL connectivity and applied `0002` migration; do not expose raw DB exception text. |
| Logout fails CSRF | Correct frontend Origin, current session's CSRF token and allowed `X-CSRF-Token` preflight header. |

## Future private inventory boundary

Future owned-copy, collection, box, wishlist, trade and transaction routes must
depend on `require_current_user`. Derive `user_id` from that authenticated User
and constrain every read/update/delete by it. A request parameter must never
choose whose private data to access. Cross-user references additionally need
database constraints. Public catalog identity remains distinct from ownership.
No inventory or trainer-avatar catalog is implemented in this slice.

## Verification and remaining work

Automated verification uses locally signed tokens and mocked Google responses;
it requires no live Google requests or real credentials. PostgreSQL tests use a
dedicated database and disposable schemas for migration/constraint checks.
The final full gate passed: 43 provider, 155 backend (including all 6 PostgreSQL
integration tests), and 232 frontend tests; Ruff, ESLint, TypeScript, production
build and whitespace checks passed. Detailed evidence is recorded in `Bitacora.md`
and `docs/DEVELOPMENT.md`.

Pending manual checks: Google Console creation/credentials, real consent and
callback, actual browser cookie behavior, desktop/mobile appearance, and HTTPS
deployment/proxy configuration. Expired server records need periodic cleanup in
an eventual deployment; authentication expiration is enforced independently.

## Primary references

- [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)
- [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Google production readiness / testing audience](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview)
- [OWASP OAuth2](https://cheatsheetseries.owasp.org/cheatsheets/OAuth2_Cheat_Sheet.html)
- [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [Authlib HTTPX integration](https://docs.authlib.org/en/latest/oauth2/client/http/httpx.html)
