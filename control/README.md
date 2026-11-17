# Control

If the whole site—the complete system—were a ship, Control would be its bridge:
the place from which we oversee, manage, and improve everything.

Admins open `/control` using their normal account. [../system.config.ts](../system.config.ts)
defines the site map. GitHub records live in separate PostgreSQL at `127.0.0.1:55433`.

## Logs and errors

Click any system in the overview to open its panel. Web includes server and browser telemetry;
Worker includes worker telemetry. Other systems currently show empty Logs and Errors tabs.
Search and filter recorded logs or grouped errors, expand rows for context, and open issues in Sentry.

Set `SENTRY_ORG`, `SENTRY_PROJECT`, and `SENTRY_READ_TOKEN` in root `.env` or on the web server.
The read token needs `org:read`, `project:read`, and `event:read` access to that project. Keep it
separate from `SENTRY_AGENT_TOKEN` and `SENTRY_UPLOAD_TOKEN`. `SENTRY_URL` optionally selects a
regional or self-hosted API endpoint; it defaults to `https://sentry.io`. These read settings do
not change the SDK's `SENTRY_DSN` ingestion target.

Compose passes read settings only to Web. On Render, set them on the web service, not in the
shared environment group. Without complete read settings, the panel displays setup guidance.
The initial environment matches `SENTRY_ENVIRONMENT` (or `NODE_ENV`); use the environment filter
to view another environment. Errors show occurrence counts and dates matching the selected filters.

## GitHub

Set these in root `.env` before connecting:

- `CONTROL_ENCRYPTION_KEY`: a stable base64-encoded 32-byte key. Generate it with
  `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
- `APP_URL`: the public HTTPS address of the app. The webhook uses `/webhooks/github` on
  this address. Local development requires HTTPS forwarding to the web service.

In Settings, validate a fine-grained token, select a repository, and connect. The token needs
Metadata, Issues, Pull requests, and Actions read permissions, plus Webhooks write. Its owner
must be able to manage the repository's webhooks; organization approval may also be required.

The shared worker imports all available issue, PR, and workflow run records. GitHub stays the
source of truth; `raw` stores the latest record JSON. Comments, reviews, jobs, logs, and artifact
files are not imported. Webhooks update the mirror; use Sync now after downtime. Disconnect
removes Control's webhook and clears its cached records. Replace token renews access.

[Render](../render.yaml) provisions a separate Control database and generates one encryption
key shared by Web and Worker. Both services apply Control migrations before starting.

`make dev` runs both databases' migrations before web and worker. Host commands:

```bash
npm run db:generate:control   # Generate migrations after Control schema changes
npm run db:migrate:control    # Apply Control migrations
make check-control
make check-github
```
