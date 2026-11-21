import { describe, expect, it, vi } from "vitest";
import { GitHubClient } from "../client.server";
import { GitHubDocsClient } from "../docs.server";

const snapshot = {
  id: 123,
  branch: "main",
  head: "base",
  tree: "base-tree",
  url: "https://github.com/org/repo",
};
const entry = { path: ".agents/skills/build/SKILL.md", mode: "100644", sha: "original" };
const json = (body: unknown, status = 200) => Response.json(body, { status });

describe("GitHub documentation", () => {
  it("walks a truncated tree and indexes only regular Markdown blobs", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ truncated: true, tree: [] }))
      .mockResolvedValueOnce(
        json({
          truncated: false,
          tree: [
            { type: "tree", path: ".agents", sha: "subtree", mode: "040000" },
            { type: "blob", path: "link.md", sha: "symlink", mode: "120000" },
            { type: "blob", path: "source.ts", sha: "code", mode: "100644" },
          ],
        }),
      )
      .mockResolvedValueOnce(
        json({
          truncated: false,
          tree: [{ type: "blob", path: "Guide.MD", sha: "guide", mode: "100755" }],
        }),
      );
    const api = new GitHubDocsClient(new GitHubClient("test", transport), "org", "repo");
    await expect(api.documents("tree")).resolves.toEqual([
      { path: ".agents/Guide.MD", sha: "guide", mode: "100755" },
    ]);
  });

  it("recovers an existing proposal ref only when its one-file change matches", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ sha: "tree" }))
      .mockResolvedValueOnce(json({ sha: "commit" }))
      .mockResolvedValueOnce(json({}, 422))
      .mockResolvedValueOnce(
        json({ ahead_by: 1, files: [{ filename: entry.path, sha: "draft", status: "modified" }] }),
      )
      .mockResolvedValueOnce(
        json({ encoding: "base64", content: Buffer.from("# Draft").toString("base64") }),
      )
      .mockResolvedValueOnce(json({ html_url: "https://github.com/org/repo/pull/3" }));
    const api = new GitHubDocsClient(new GitHubClient("test", transport), "org", "repo");
    await expect(
      api.publish(snapshot, entry, "# Draft", "Edit", "control/docs-example"),
    ).resolves.toMatch(/pull\/3$/);
    expect(JSON.parse(String(transport.mock.calls[0][1]?.body))).toEqual({
      base_tree: "base-tree",
      tree: [{ path: entry.path, type: "blob", mode: "100644", content: "# Draft" }],
    });
    expect(JSON.parse(String(transport.mock.calls[5][1]?.body))).toEqual({
      title: "Edit",
      base: "main",
      head: "control/docs-example",
    });
  });
});
