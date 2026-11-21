import { beforeEach, describe, expect, it, vi } from "vitest";
import { proposeDocument } from "../docs.server";

const api = vi.hoisted(() => ({
  snapshot: vi.fn(),
  documents: vi.fn(),
  source: vi.fn(),
  findPull: vi.fn(),
  publish: vi.fn(),
}));
vi.mock("~/integrations/github/docs.server", () => ({
  GitHubDocsClient: class {
    constructor() {
      return api;
    }
  },
}));
vi.mock("~/integrations/github/secrets.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/integrations/github/secrets.server")>()),
  decryptSecret: () => "test",
}));
vi.mock("../db/repositories/github.server", () => ({
  getConnection: () => ({
    id: "connection",
    owner: "org",
    name: "repo",
    webhookId: 1,
    repositoryId: 123,
    status: "connected",
  }),
}));

const input = {
  connectionId: "connection",
  repositoryId: 123,
  branch: "main",
  path: "web/README.md",
  sha: "original",
  operation: "one-edit",
  source: "# Draft",
  title: "Update web docs",
};
beforeEach(() => {
  vi.resetAllMocks();
  api.snapshot.mockResolvedValue({ id: 123, branch: "main", head: "latest", tree: "tree" });
  api.documents.mockResolvedValue([{ path: input.path, sha: input.sha, mode: "100644" }]);
  api.source.mockResolvedValue("# Published");
});
describe("document proposal", () => {
  it("rejects a stale file or changed repository before creating a branch", async () => {
    await expect(proposeDocument({ ...input, sha: "outdated" })).rejects.toThrow("file changed");
    await expect(proposeDocument({ ...input, repositoryId: 321 })).rejects.toThrow(
      "repository or default branch changed",
    );
    expect(api.publish).not.toHaveBeenCalled();
  });
  it("recovers the same PR after its response is lost", async () => {
    api.publish.mockRejectedValueOnce(new Error("response lost"));
    await expect(proposeDocument(input)).rejects.toThrow("response lost");
    const branch = api.publish.mock.calls[0][4];
    api.findPull.mockResolvedValueOnce("https://github.com/org/repo/pull/1");
    await expect(proposeDocument(input)).resolves.toBe("https://github.com/org/repo/pull/1");
    expect(api.findPull).toHaveBeenLastCalledWith(branch, "main");
    expect(api.publish).toHaveBeenCalledTimes(1);
  });
});
