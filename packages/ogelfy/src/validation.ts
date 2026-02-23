import { z } from 'zod';

export function validate<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  return schema.parse(data);
}
