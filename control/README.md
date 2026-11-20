# Control

If the whole site—the complete system—were a ship, Control would be its bridge:
the place from which we oversee, manage, and improve everything.

Admins open `/control` using their normal account. [../system.config.ts](../system.config.ts)
defines the site map. GitHub records live in separate PostgreSQL at `127.0.0.1:55433`.

## Render metrics

Site-map cards show one current Render reading per monitored system. PostgreSQL, Control DB,
and storage prioritize disk usage and capacity. Web prioritizes response time, Worker CPU,
and Redis memory. Card badges summarize observed utilization. Warning starts at 80% and
Critical at 95%. Partial or stale readings can also show Warning. Systems without recent
capacity readings show No data when there is no warning.

The overview fetches the card readings and their fallbacks. Opening a system loads its additional
Render metrics above the logs and errors. The section includes CPU,
memory, disk, connections, and HTTP metrics where available. Outbound bandwidth covers the
last 24 hours and arrives in delayed hourly buckets. Other metrics use the last hour. The
panel identifies old samples and unavailable data.

Set `RENDER_API_KEY` and `RENDER_BLUEPRINT_ID` on the web server or in root `.env`.
Find the Blueprint ID (`exs-…`) in its Render Dashboard URL. With scoped API keys, grant
Blueprint and Monitoring read permissions for that workspace. Classic API keys inherit
your account permissions. Never put the key in the shared environment group or browser settings.
Compose passes these settings only to Web.

Resource names in [../system.config.ts](../system.config.ts) match [../render.yaml](../render.yaml).
Update `renderResource` if your deployed resources have different names. The selected Blueprint
identifies the deployment; Sentry environment filters do not change these metrics. Reads are
cached on the server for one minute and refresh every minute while the Overview is visible.
This view requires no metrics database or OpenTelemetry collector. HTTP latency requires a
Pro workspace or higher. See [Render metrics](https://render.com/docs/service-metrics).

## Logs and errors

Click any system in the overview to open its panel. Web and Worker open on Logs, with Errors
and Details tabs alongside. Web includes both server and browser telemetry. Other system panels
show their source and connections. Module panels also list data types. Expand a type to see its
source and fields. Repositories and Control show PostgreSQL field types from their Drizzle
schemas. Integration modules show the request, response, and payload shapes used by the app.

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
  this address by default.

For local development, keep `APP_URL=http://localhost:5173`. With `cloudflared` installed,
run `make github-tunnel` in a separate terminal and leave it running. Set
`GITHUB_WEBHOOK_ORIGIN` in root `.env` to the HTTPS origin it prints. Start the app with
`make dev`, or run `make reload` if it is already running. Open
[Control Settings](http://localhost:5173/control/settings) locally. The tunnel forwards only
`/webhooks/github`, and Control registers the full delivery URL when you connect.
Each new Quick Tunnel gets a different hostname. For an existing connection, update the origin
in both `.env` and the GitHub webhook's Payload URL, preserving its path and query string.
Use a named Cloudflare Tunnel for a stable hostname.

In Settings, validate a fine-grained token, select a repository, and connect. The token needs
Metadata, Issues, Pull requests, and Actions read permissions, plus Webhooks write. Its owner
must be able to manage the repository's webhooks; organization approval may also be required.

In the Docs tab, browse Markdown from the connected repository’s default branch, including
agent skills under `.agents/skills/`. Select **Edit** to change a file, **Preview** to read the
draft, and **Open pull request** to propose it. Merged edits appear on the next load.
Browsing needs Contents read permission. Proposing edits needs Contents and Pull requests write
permissions. Use **Replace token** in Settings when updating credentials.

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
