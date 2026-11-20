import { env } from "~/web/env.server";

export function requireControlPost(request: Request) {
  if (request.method !== "POST") throw new Response("Method not allowed", { status: 405 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(env.APP_URL).origin)
    throw new Response("Forbidden", { status: 403 });
}
