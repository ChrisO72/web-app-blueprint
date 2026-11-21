import { z } from "zod";

const ORIGIN = "https://api.github.com";
export const API_VERSION = "2026-03-10";
const repositorySchema = z.object({
  id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  name: z.string().min(1),
  full_name: z.string(),
  html_url: z.url(),
  owner: z.object({ login: z.string().min(1) }),
});
export type GitHubRepository = z.infer<typeof repositorySchema>;
export type GitHubPage = { items: unknown[]; next: string | null };
export type GitHubHook = { id: number; config: { url?: string } };
const hookSchema = z.object({
  id: z.number().int().positive(),
  config: z.object({ url: z.string().optional() }),
});

export class GitHubApiError extends Error {
  constructor(
    public status: number,
    public retryAfterMs = 0,
  ) {
    super(
      retryAfterMs
        ? "GitHub rate limit reached. Sync will retry after the limit resets."
        : status === 401
          ? "GitHub rejected the token. Replace it with a valid token."
          : status === 403
            ? "GitHub denied access. Check token permissions, repository access, and organization approval."
            : status === 404
              ? "The GitHub repository or record is unavailable."
              : "GitHub request failed. Please try again.",
    );
  }
}

function retryDelay(response: Response) {
  const retry = response.headers.get("retry-after");
  if (retry) {
    const seconds = Number(retry);
    const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retry) - Date.now();
    return Number.isFinite(delay) ? Math.max(1000, delay) : 60_000;
  }
  if (response.headers.get("x-ratelimit-remaining") === "0") {
    const reset = Number(response.headers.get("x-ratelimit-reset"));
    return reset > 0 ? Math.max(1000, reset * 1000 - Date.now() + 1000) : 60_000;
  }
  return response.status === 429 ? 60_000 : 0;
}

export class GitHubClient {
  constructor(
    private token: string,
    private transport: typeof fetch = fetch,
  ) {}

  private url(path: string) {
    const url = new URL(path, ORIGIN);
    if (url.origin !== ORIGIN || url.username || url.password || url.hash)
      throw new Error("Invalid GitHub API URL.");
    return url;
  }

  async request(
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<{ data: unknown; response: Response }> {
    let response: Response;
    try {
      response = await this.transport(this.url(path), {
        method,
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${this.token}`,
          "X-GitHub-Api-Version": API_VERSION,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new GitHubApiError(0);
    }
    if (!response.ok) {
      let delay = retryDelay(response);
      if (response.status === 403 && !delay) {
        const message = await response.text();
        if (/secondary rate limit|abuse detection/i.test(message)) delay = 60_000;
      }
      throw new GitHubApiError(response.status, delay);
    }
    if (response.status === 204) return { data: null, response };
    try {
      const data: unknown = await response.json();
      return { data, response };
    } catch {
      throw new Error("GitHub returned an invalid response.");
    }
  }

  async page(path: string, key?: string): Promise<GitHubPage> {
    const { data, response } = await this.request(path);
    const items =
      key && data && typeof data === "object" && key in data
        ? (Reflect.get(data, key) as unknown)
        : data;
    if (!Array.isArray(items)) throw new Error("GitHub returned an invalid list.");
    const link = response.headers.get("link") ?? "";
    const next = /<([^>]+)>;\s*rel="next"/.exec(link)?.[1] ?? null;
    if (next) this.url(next);
    return { items, next };
  }

  async repositories() {
    const repositories: GitHubRepository[] = [];
    let path: string | null = "/user/repos?per_page=100&sort=full_name";
    while (path) {
      const page = await this.page(path);
      for (const value of page.items) {
        const result = repositorySchema.safeParse(value);
        if (!result.success) throw new Error("GitHub returned an invalid repository.");
        repositories.push(result.data);
      }
      path = page.next;
    }
    return repositories;
  }

  async identity() {
    const { data } = await this.request("/user");
    const result = z.object({ login: z.string() }).safeParse(data);
    if (!result.success) throw new Error("GitHub returned an invalid user.");
    return result.data.login;
  }

  async repository(owner: string, name: string) {
    const { data } = await this.request(repoPath(owner, name));
    const result = repositorySchema.safeParse(data);
    if (!result.success) throw new Error("GitHub returned an invalid repository.");
    return result.data;
  }

  async checkReadPermissions(owner: string, name: string) {
    const base = repoPath(owner, name);
    for (const path of ["/issues?per_page=1", "/pulls?per_page=1", "/actions/runs?per_page=1"])
      await this.request(base + path);
  }

  async hooks(owner: string, name: string) {
    const hooks: GitHubHook[] = [];
    let path: string | null = `${repoPath(owner, name)}/hooks?per_page=100`;
    while (path) {
      const page = await this.page(path);
      for (const value of page.items) {
        const result = hookSchema.safeParse(value);
        if (!result.success) throw new Error("GitHub returned an invalid webhook.");
        hooks.push(result.data);
      }
      path = page.next;
    }
    return hooks;
  }

  async saveHook(owner: string, name: string, url: string, secret: string, hookId?: number) {
    const { data } = await this.request(
      `${repoPath(owner, name)}/hooks${hookId ? `/${hookId}` : ""}`,
      hookId ? "PATCH" : "POST",
      {
        name: "web",
        active: true,
        events: ["issues", "pull_request", "workflow_run"],
        config: { url, content_type: "json", insecure_ssl: "0", secret },
      },
    );
    const result = hookSchema.safeParse(data);
    if (!result.success) throw new Error("GitHub returned an invalid webhook.");
    return result.data;
  }

  async deleteHook(owner: string, name: string, id: number) {
    try {
      await this.request(`${repoPath(owner, name)}/hooks/${id}`, "DELETE");
    } catch (error) {
      if (!(error instanceof GitHubApiError) || error.status !== 404) throw error;
    }
  }
}

export function repoPath(owner: string, name: string) {
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
}
