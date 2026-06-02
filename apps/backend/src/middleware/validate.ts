import type { Request, Response, NextFunction } from 'express';
import type { z } from 'zod';

export function validate(schema: z.ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: 'Validation failed',
        issues: result.error.issues.map((i: z.ZodIssue) => ({
          field: i.path.join('.') || 'unknown',
          message: i.message,
        })),
      });
      return;
    }
    req.body = result.data as unknown;
    next();
  };
}
