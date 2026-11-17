import { describe, expect, it, vi } from "vitest";
import { GitHubClient, GitHubApiError, API_VERSION } from "../client.server";
import { REPOSITORY, TOKEN } from "./fixtures";

function response(data: unknown, headers: HeadersInit = {}, status = 200) {
  return new Response(JSON.stringify(data), { status, headers });
}
describe("GitHub client", () => {
  it("follows every repository page and pins the authenticated API version", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response([REPOSITORY], { link: '<https://api.github.com/user/repos?page=2>; rel="next"' }),
      )
      .mockResolvedValueOnce(response([{ ...REPOSITORY, id: 124, name: "other" }]));
    const rows = await new GitHubClient(TOKEN, transport).repositories();
    expect(rows.map((row) => row.id)).toEqual([123, 124]);
    expect(String(transport.mock.calls[1][0])).toBe("https://api.github.com/user/repos?page=2");
    const headers = new Headers(transport.mock.calls[0][1]?.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
    expect(headers.get("x-github-api-version")).toBe(API_VERSION);
    expect(transport.mock.calls[0][1]?.redirect).toBe("error");
  });
  it("will not forward the token to an external pagination URL", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response([], { link: '<https://attacker.example/page>; rel="next"' }));
    await expect(new GitHubClient(TOKEN, transport).repositories()).rejects.toThrow(
      "Invalid GitHub API URL",
    );
    expect(transport).toHaveBeenCalledOnce();
  });
  it.each([401, 403])(
    "reports %s without exposing GitHub response bodies or the token",
    async (status) => {
      const transport = vi
        .fn<typeof fetch>()
        .mockResolvedValue(response({ message: `private response ${TOKEN}` }, {}, status));
      const result = await new GitHubClient(TOKEN, transport)
        .request("/user")
        .catch((error: unknown) => error);
      expect(result).toBeInstanceOf(GitHubApiError);
      expect(String(result)).not.toContain(TOKEN);
      expect(String(result)).not.toContain("private response");
    },
  );
  it("honors Retry-After and recognizes secondary rate limits", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({}, { "retry-after": "120" }, 429))
      .mockResolvedValueOnce(
        response({ message: "You have exceeded a secondary rate limit" }, {}, 403),
      );
    const client = new GitHubClient(TOKEN, transport);
    await expect(client.request("/user")).rejects.toMatchObject({ retryAfterMs: 120_000 });
    await expect(client.request("/user")).rejects.toMatchObject({ retryAfterMs: 60_000 });
  });
  it("honors the primary rate-limit reset time", async () => {
    const reset = Math.ceil(Date.now() / 1000) + 120;
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        response({}, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset) }, 403),
      );
    const error = await new GitHubClient(TOKEN, transport)
      .request("/user")
      .catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(GitHubApiError);
    if (!(error instanceof GitHubApiError)) throw new Error("Expected rate limit error");
    expect(error.retryAfterMs).toBeGreaterThanOrEqual(120_000);
  });
});
