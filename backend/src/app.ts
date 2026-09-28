import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { getDatabaseStatus } from './config/db.js';
import { errorHandler, createError } from './middlewares/error.js';
import { sanitizeRequest } from './middlewares/sanitize.js';
import { securityHeaders } from './middlewares/security.js';
import { correlationMiddleware } from './middlewares/correlation.js';
import { JobWorkerService } from './services/jobs/job-worker.service.js';
import { JobQueueService } from './services/jobs/job-queue.service.js';
import authRoutes from './routes/auth.routes.js';
import memberRoutes from './routes/member.routes.js';
import shareRoutes from './routes/share.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import custodyRoutes from './routes/custody.routes.js';
import investmentRoutes from './routes/investment.routes.js';
import reinvestmentRoutes from './routes/reinvestment.routes.js';
import expenseRoutes from './routes/expense.routes.js';
import reportingRoutes from './routes/reporting.routes.js';
import distributionRoutes from './routes/distribution.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import migrationRoutes from './routes/migration.routes.js';
import governanceRoutes from './routes/governance.routes.js';
import documentRoutes from './routes/document.routes.js';
import auditRoutes from './routes/audit.routes.js';
import jobRoutes from './routes/job.routes.js';

const app = express();
app.disable('x-powered-by');
app.use(securityHeaders);
app.use(correlationMiddleware);

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
app.use(sanitizeRequest);

// ─── HEALTH & READINESS ENDPOINTS ───────────────────────────────────────────
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

/**
 * GET /api/ready
 * Deep readiness probe checking MongoDB connection + ping latency,
 * background worker heartbeat, and queue stats.
 */
app.get('/api/ready', async (_req: Request, res: Response) => {
  const dbStatus = getDatabaseStatus();
  let dbLatencyMs: number | null = null;
  let dbPingOk = false;

  if (dbStatus === 'connected' && mongoose.connection.db) {
    try {
      const start = Date.now();
      await mongoose.connection.db.admin().ping();
      dbLatencyMs = Date.now() - start;
      dbPingOk = true;
    } catch {
      dbPingOk = false;
    }
  }

  const workerStatus = JobWorkerService.getStatus();
  const queueStats = await JobQueueService.getQueueStats().catch(() => ({
    queued: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    total: 0,
  }));

  const isReady = dbStatus === 'connected' && dbPingOk && workerStatus.isHealthy;

  res.status(isReady ? 200 : 503).json({
    status: isReady ? 'ready' : 'degraded',
    timestamp: new Date().toISOString(),
    database: {
      status: dbStatus,
      pingOk: dbPingOk,
      latencyMs: dbLatencyMs,
    },
    worker: {
      workerId: workerStatus.workerId,
      isHealthy: workerStatus.isHealthy,
      isRunning: workerStatus.isRunning,
      activeJobs: workerStatus.activeJobsCount,
      lastHeartbeat: workerStatus.lastHeartbeat,
    },
    queue: queueStats,
  });
});

// ─── DOMAIN API ROUTES ───────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/shares', shareRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/custody', custodyRoutes);
app.use('/api/investments', investmentRoutes);
app.use('/api/reinvestments', reinvestmentRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/reports', reportingRoutes);
app.use('/api/distributions', distributionRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/migrations', migrationRoutes);
app.use('/api/governance', governanceRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/jobs', jobRoutes);

// ─── 404 HANDLER ─────────────────────────────────────────────────────────────
app.use((_req: Request, _res: Response, next: NextFunction) => {
  next(createError('The requested resource was not found.', 404));
});

// ─── CENTRALIZED ERROR HANDLER ────────────────────────────────────────────────
app.use(errorHandler);

export default app;
