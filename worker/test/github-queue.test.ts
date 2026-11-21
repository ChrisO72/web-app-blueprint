import { beforeEach, describe, expect, it, vi } from "vitest";
import { enqueueGithubSync } from "../jobs/sync-github";
import { CONNECTION_ID, SYNC_ID, DELIVERY_ID } from "~/integrations/github/test/fixtures";

const queue = vi.hoisted(() => ({
  enqueue: vi.fn(),
  getState: vi.fn(),
  retry: vi.fn(),
}));
vi.mock("../enqueue", () => ({ enqueueJob: queue.enqueue }));
vi.mock("~/control/github-sync.server", () => ({ syncGithub: vi.fn() }));
const data = {
  kind: "record" as const,
  connectionId: CONNECTION_ID,
  recordKind: "issue" as const,
  githubId: 10,
  number: 1,
  deleted: false,
};
beforeEach(() => {
  vi.resetAllMocks();
  queue.getState.mockResolvedValue("completed");
  queue.enqueue.mockResolvedValue({ getState: queue.getState, retry: queue.retry });
});
describe("GitHub queue delivery", () => {
  it("deduplicates repeated delivery IDs while retaining completed jobs", async () => {
    await enqueueGithubSync(data, DELIVERY_ID);
    await enqueueGithubSync(data, DELIVERY_ID);
    const options = queue.enqueue.mock.calls.map((call) => call[2] as { jobId: string });
    expect(options[0].jobId).toBe(options[1].jobId);
    expect(queue.enqueue).toHaveBeenCalledWith(
      "syncGithub",
      data,
      expect.objectContaining({
        attempts: 5,
        removeOnComplete: { age: 604800 },
        removeOnFail: { age: 604800 },
      }),
    );
    expect(queue.retry).not.toHaveBeenCalled();
  });
  it("keeps separate deliveries separate and allows failed redelivery to retry", async () => {
    queue.getState.mockResolvedValueOnce("failed");
    await enqueueGithubSync(data, DELIVERY_ID);
    await enqueueGithubSync(data, "another-delivery");
    expect(queue.enqueue.mock.calls[0][2].jobId).not.toBe(queue.enqueue.mock.calls[1][2].jobId);
    expect(queue.retry).toHaveBeenCalledOnce();
  });
  it("identifies manual imports by their sync generation", async () => {
    await enqueueGithubSync({ kind: "full", connectionId: CONNECTION_ID, syncId: SYNC_ID });
    expect(queue.enqueue.mock.calls[0][2].jobId).toBe(`github-full-${SYNC_ID}`);
    expect(queue.getState).not.toHaveBeenCalled();
  });
  it("requires a delivery ID and propagates enqueue failures", async () => {
    await expect(enqueueGithubSync(data)).rejects.toThrow("delivery ID");
    expect(queue.enqueue).not.toHaveBeenCalled();
    queue.enqueue.mockRejectedValueOnce(new Error("Redis unavailable"));
    await expect(enqueueGithubSync(data, DELIVERY_ID)).rejects.toThrow("Redis unavailable");
  });
});
