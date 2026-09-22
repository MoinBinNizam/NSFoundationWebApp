import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { getDatabaseStatus } from './config/db.js';
import { errorHandler, createError } from './middlewares/error.js';
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

// ─── 404 HANDLER ─────────────────────────────────────────────────────────────
app.use((_req: Request, _res: Response, next: NextFunction) => {
  next(createError('The requested resource was not found.', 404));
});

// ─── CENTRALIZED ERROR HANDLER ────────────────────────────────────────────────
app.use(errorHandler);

export default app;
