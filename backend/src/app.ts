import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { getDatabaseStatus } from './config/db.js';
import { errorHandler, createError } from './middlewares/error.js';

const app = express();

// ─── CORS ────────────────────────────────────────────────────────────────────
const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:5173';
app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
  })
);

// ─── BODY PARSING ────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── HEALTH ENDPOINT ─────────────────────────────────────────────────────────
/**
 * GET /api/health
 * Returns actual database connection status.
 * Does NOT expose secrets, URIs, or credentials.
 */
app.get('/api/health', (_req: Request, res: Response) => {
  const dbStatus = getDatabaseStatus();
  const healthy = dbStatus === 'connected';

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    environment: process.env.NODE_ENV ?? 'unknown',
    database: dbStatus,
    timestamp: new Date().toISOString(),
  });
});

// ─── FUTURE ROUTES ───────────────────────────────────────────────────────────
// Domain-specific API routes will be mounted here in future phases.
// Example: app.use('/api/members', memberRouter);

// ─── 404 HANDLER ─────────────────────────────────────────────────────────────
app.use((_req: Request, _res: Response, next: NextFunction) => {
  next(createError('The requested resource was not found.', 404));
});

// ─── CENTRALIZED ERROR HANDLER ────────────────────────────────────────────────
app.use(errorHandler);

export default app;
