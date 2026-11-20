import { z } from "zod";
import type { RecordKind } from "~/integrations/github/records";

export const recordPageSizeOptions = [5, 10, 25, 50];
export const recordFilterTextLimit = 160;

export const recordStatuses = {
  issue: {
    open: "Open",
    closed: "Closed",
  },
  pull: {
    open: "Open",
    draft: "Draft",
    merged: "Merged",
    closed: "Closed",
  },
  run: {
    success: "Succeeded",
    failure: "Failed",
    in_progress: "In progress",
    queued: "Queued",
    requested: "Requested",
    waiting: "Waiting",
    pending: "Pending",
    action_required: "Action required",
    cancelled: "Cancelled",
    timed_out: "Timed out",
    skipped: "Skipped",
    neutral: "Neutral",
    stale: "Stale",
    startup_failure: "Startup failure",
    completed: "Completed",
  },
} satisfies Record<RecordKind, Record<string, string>>;

const filterText = z
  .string()
  .trim()
  .max(recordFilterTextLimit)
  .refine((value) => !value.includes("\0"))
  .catch("");

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).catch(1),
  pageSize: z.coerce
    .number()
    .refine((size) => recordPageSizeOptions.includes(size))
    .catch(10),
  q: filterText,
  status: z.string().catch(""),
  scope: filterText,
});

export type RecordQuery = z.output<typeof querySchema>;

const pageQuerySchema = querySchema.pick({ page: true, pageSize: true });

export function parseControlPage(searchParams: URLSearchParams) {
  return pageQuerySchema.parse({
    page: searchParams.get("page"),
    pageSize: searchParams.get("pageSize"),
  });
}

export function parseRecordQuery(kind: RecordKind, searchParams: URLSearchParams): RecordQuery {
  const query = querySchema.parse({
    page: searchParams.get("page"),
    pageSize: searchParams.get("pageSize"),
    q: searchParams.get("q"),
    status: searchParams.get("status"),
    scope: searchParams.get("scope"),
  });
  if (!Object.hasOwn(recordStatuses[kind], query.status)) query.status = "";
  return query;
}
