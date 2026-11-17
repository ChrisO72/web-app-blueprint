import { z } from "zod";

export const recordPageSizeOptions = [5, 10, 25, 50];

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).catch(1),
  pageSize: z.coerce
    .number()
    .refine((size) => recordPageSizeOptions.includes(size))
    .catch(10),
});

export function parseRecordPagination(searchParams: URLSearchParams) {
  return paginationSchema.parse({
    page: searchParams.get("page"),
    pageSize: searchParams.get("pageSize"),
  });
}
