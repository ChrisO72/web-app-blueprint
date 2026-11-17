# Control

If the whole site—the complete system—were a ship, Control would be its bridge:
the place from which we oversee, manage, and improve everything.

Admins open `/control` in the existing web app using their normal account.
[../system.config.ts](../system.config.ts) defines the site map.

`db/` keeps a separate PostgreSQL connection for future Control workflow data.
`make dev` starts it at `127.0.0.1:55433`; host connections use `CONTROL_DATABASE_URL`
from root `.env`. Control has no schemas or migrations yet; add them with the first
workflow that needs stored data.
