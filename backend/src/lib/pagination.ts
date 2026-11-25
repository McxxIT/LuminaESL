import { z } from "zod";

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type Pagination = z.infer<typeof paginationSchema>;

export function parsePagination(query: unknown): Pagination {
  const result = paginationSchema.safeParse(query ?? {});
  return result.success ? result.data : { limit: 50, offset: 0 };
}
