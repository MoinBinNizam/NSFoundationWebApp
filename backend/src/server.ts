import 'dotenv/config';
import http from 'http';
import app from './app.js';
import { connectDatabase } from './config/db.js';

const PORT = parseInt(process.env.PORT ?? '5000', 10);

async function startServer(): Promise<void> {
  try {
    if (process.env.NODE_ENV === 'production') {
      const secret = process.env.JWT_SECRET || '';
      if (secret.length < 32 || secret.includes('dev_secret') || secret.includes('change_in_production')) {
        throw new Error('Production requires a unique JWT_SECRET of at least 32 characters.');
      }
      if (!process.env.CORS_ORIGIN?.startsWith('https://')) {
        throw new Error('Production requires an HTTPS CORS_ORIGIN.');
      }
    }
    // Step 1: Connect to MongoDB before accepting HTTP traffic
    console.log('[server] Connecting to MongoDB...');
    await connectDatabase();
    console.log('[server] MongoDB connected successfully.');

    // Step 2: Start HTTP server
    const server = http.createServer(app);
    let isShuttingDown = false;

    // `listen()` reports port-binding failures asynchronously through the server
    // instance, so a surrounding try/catch cannot handle EADDRINUSE on its own.
    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        console.error(
          `[server] Port ${PORT} is already in use. The API may already be running in another terminal. ` +
            `Stop that process or set a different PORT in backend/.env before starting another instance.`
        );
      } else {
        console.error('[server] HTTP server failed to start:', error.message);
      }
      process.exit(1);
    });

    server.listen(PORT, () => {
      console.log(`[server] NS Foundation API is running.`);
      console.log(`[server] Environment : ${process.env.NODE_ENV ?? 'development'}`);
      console.log(`[server] Port        : ${PORT}`);
      console.log(`[server] Health      : http://localhost:${PORT}/api/health`);
    });

    // Graceful shutdown handlers
    const shutdown = (signal: string) => {
      if (isShuttingDown) return;
      isShuttingDown = true;
      console.log(`\n[server] Received ${signal}. Shutting down gracefully...`);
      server.close(() => {
        console.log('[server] HTTP server closed.');
        process.exit(0);
      });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[server] Failed to start:', message);
    if (message.includes('ECONNREFUSED')) {
      console.error('\n[server] TIP: MongoDB is unreachable. Please ensure MongoDB is running on port 27017.');
      console.error('[server] You can start the Windows MongoDB service ("net start MongoDB" in Administrator terminal) or run mongod.\n');
    }
    process.exit(1);
  }
}

startServer();
