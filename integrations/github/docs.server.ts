import { z } from "zod";
import { GitHubApiError, GitHubClient, repoPath } from "./client.server";

const objectId = z.object({ sha: z.string() });
const treeSchema = z.object({
  truncated: z.boolean(),
  tree: z.array(
    z.object({ path: z.string(), mode: z.string(), type: z.string(), sha: z.string() }),
  ),
});
export type DocumentEntry = { path: string; sha: string; mode: string };
export type RepositorySnapshot = {
  branch: string;
  head: string;
  tree: string;
  url: string;
  id: number;
};

export class GitHubDocsClient {
  private base: string;

  constructor(
    private client: GitHubClient,
    private owner: string,
    name: string,
  ) {
    this.base = repoPath(owner, name);
  }

  private async read<T>(path: string, schema: z.ZodType<T>) {
    return schema.parse((await this.client.request(this.base + path)).data);
  }

  async snapshot(): Promise<RepositorySnapshot> {
    const repo = await this.read(
      "",
      z.object({ id: z.number(), default_branch: z.string(), html_url: z.url() }),
    );
    const { commit } = await this.read(
      "/branches/" + encodeURIComponent(repo.default_branch),
      z.object({ commit: objectId.extend({ commit: z.object({ tree: objectId }) }) }),
    );
    return {
      branch: repo.default_branch,
      head: commit.sha,
      tree: commit.commit.tree.sha,
      url: repo.html_url,
      id: repo.id,
    };
  }

  async documents(tree: string): Promise<DocumentEntry[]> {
    const entries: DocumentEntry[] = [];
    const collect = (item: z.infer<typeof treeSchema>["tree"][number], path: string) => {
      if (item.type === "blob" && ["100644", "100755"].includes(item.mode) && /\.md$/i.test(path))
        entries.push({ path, sha: item.sha, mode: item.mode });
    };
    const listing = await this.read("/git/trees/" + tree + "?recursive=1", treeSchema);
    if (!listing.truncated) {
      for (const item of listing.tree) collect(item, item.path);
    } else {
      // GitHub can omit entire subtrees when a recursive response reaches its size limit.
      const visit = async (sha: string, prefix: string) => {
        const page = await this.read("/git/trees/" + sha, treeSchema);
        if (page.truncated) throw new Error("Incomplete Git tree");
        for (const item of page.tree) {
          const path = prefix + item.path;
          if (item.type === "tree") await visit(item.sha, path + "/");
          else collect(item, path);
        }
      };
      await visit(tree, "");
    }
    return entries;
  }

  async source(sha: string) {
    const blob = await this.read(
      "/git/blobs/" + sha,
      z.object({ encoding: z.literal("base64"), content: z.string() }),
    );
    return Buffer.from(blob.content, "base64").toString("utf8");
  }

  async findPull(head: string, base: string) {
    const params = new URLSearchParams({ head: this.owner + ":" + head, base, state: "all" });
    const pulls = await this.read("/pulls?" + params, z.array(z.object({ html_url: z.url() })));
    return pulls[0]?.html_url;
  }

  async publish(
    snapshot: RepositorySnapshot,
    entry: DocumentEntry,
    source: string,
    title: string,
    branch: string,
  ) {
    // Publish the ref only after its complete, one-file commit exists.
    const post = async (path: string, body: unknown) =>
      (await this.client.request(this.base + path, "POST", body)).data;
    const tree = objectId.parse(
      await post("/git/trees", {
        base_tree: snapshot.tree,
        tree: [{ path: entry.path, mode: entry.mode, type: "blob", content: source }],
      }),
    );
    const commit = objectId.parse(
      await post("/git/commits", {
        message: title,
        tree: tree.sha,
        parents: [snapshot.head],
      }),
    );
    try {
      await post("/git/refs", { ref: "refs/heads/" + branch, sha: commit.sha });
    } catch (error) {
      if (!(error instanceof GitHubApiError) || error.status !== 422) throw error;
      // A previous attempt may have created the ref before the PR request failed.
      const comparison = await this.read(
        "/compare/" + snapshot.head + "..." + encodeURIComponent(branch),
        z.object({
          ahead_by: z.number(),
          files: z.array(z.object({ filename: z.string(), status: z.string(), sha: z.string() })),
        }),
      );
      const [file] = comparison.files;
      if (
        comparison.ahead_by !== 1 ||
        comparison.files.length !== 1 ||
        file.filename !== entry.path ||
        file.status !== "modified" ||
        (await this.source(file.sha)) !== source
      )
        throw error;
    }
    try {
      const pull = z
        .object({ html_url: z.url() })
        .parse(await post("/pulls", { base: snapshot.branch, head: branch, title }));
      return pull.html_url;
    } catch (error) {
      if (!(error instanceof GitHubApiError) || error.status !== 422) throw error;
      const existing = await this.findPull(branch, snapshot.branch);
      if (!existing) throw error;
      return existing;
    }
  }
}
