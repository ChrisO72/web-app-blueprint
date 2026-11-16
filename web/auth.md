# Authentication and authorization

Read this when changing sessions, protected routes, permissions, or public authentication actions.

## Protected routes

The [protected layout middleware](routes/layout.tsx) calls `requireAuth(request)` once per request,
stores the user in `authenticatedUserContext`, and appends rotated cookies to the final response.
This covers loaders and actions without racing parallel matched loaders. A first GET without a session creates a guest user, organization, and seeded Site. Unauthenticated
mutations redirect to `/login`; deleted-user sessions also clear cookies. Signup converts the guest
in place. Guests can explore and simulate the issue workflow; account settings and additional Site
creation use `requireRegistered(context)`. Session tokens identify users by ID; permissions come
from the current database record. The first registered account becomes an administrator, whether
created directly or converted from a guest. Guest visits do not count as registrations. Later
registrations receive the user role; deleted registrations still count to prevent reopening
administrator signup.

Refresh rotation is serialized in PostgreSQL. Parallel requests may reuse the previous token for
10 seconds and receive the same replacement; logout revokes either token's session.

Protected loaders and actions read the cached user with `getAuthenticatedUser(context)`.
User queries return an explicit public field projection; only `getUserCredentialsByEmail`
includes the password hash for server-side authentication.
The protected `/account` page lets users update their name and profile photo and change their
password. Email is read-only. Password changes require the current password, revoke all refresh
sessions and outstanding password-reset links, and sign out the current browser. Existing access
tokens on other devices expire within 15 minutes.
For admin-only routes, use `requireAdmin(context)`; non-admins redirect to `/`:

```ts
import type { Route } from "./+types/index";
import { requireAdmin } from "~/web/lib/session.server";

export async function loader({ context }: Route.LoaderArgs) {
  const { user } = requireAdmin(context);
  return { user };
}
```

Apply the same permission check in actions that perform admin-only writes.

## Server modules

Server-only code lives in `*.server.ts` and is never imported from client components.

- [lib/session.server.ts](lib/session.server.ts) — auth cookies, protected-route context, and authorization helpers.
- `lib/auth/` — password validation, registration, session tokens, and email-confirmation tokens in focused server modules.
- [`../integrations/mail/`](../integrations/mail/) — shared outbound mail transport and one server module per email type, delivered through worker jobs.
- [`../integrations/storage/`](../integrations/storage/) — shared S3 client and object operations used by web and worker code.

## Rate limiting

Public auth actions use Redis-backed fixed windows shared by every web instance:

- Login: 10 requests per submitted email every 15 minutes.
- Signup: 5 requests per submitted email per hour.
- Password-reset requests and confirmation resend: 3 requests per submitted email per hour.
- Password-reset completion: 5 attempts per account every 15 minutes, after token validation.
- Password changes: 5 attempts per authenticated account every 15 minutes.

Counters use HMAC-pseudonymized account identifiers, expire with their window, return `429` with `Retry-After` when exceeded, and fail open if Redis is unavailable.

Use the [route template](routes.md#route-module-template) for loaders and actions. Read the
[mail setup](../integrations/mail/README.md) when enabling account confirmation or password resets.
