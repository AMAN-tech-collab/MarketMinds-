import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { MarketDataError } from '../services/marketDataService.ts';

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  if (err instanceof MarketDataError) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
    });
  }

  const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500;
  const message =
    statusCode < 500 && err?.message
      ? err.message
      : 'An unexpected server error occurred. Please try again.';

  console.error('[API Error]', statusCode, err?.message || err);
  res.status(statusCode).json({ error: message });
}
