import { z } from "zod";

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),

  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid ID");
