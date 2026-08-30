import 'dotenv/config';
import http from 'http';
import app from './app.js';
import { connectDatabase } from './config/db.js';

const PORT = parseInt(process.env.PORT ?? '5000', 10);

async function startServer(): Promise<void> {
  try {
    // Step 1: Connect to MongoDB before accepting HTTP traffic
    console.log('[server] Connecting to MongoDB...');
    await connectDatabase();
    console.log('[server] MongoDB connected successfully.');

    // Step 2: Start HTTP server
    const server = http.createServer(app);

    server.listen(PORT, () => {
      console.log(`[server] NS Foundation API is running.`);
      console.log(`[server] Environment : ${process.env.NODE_ENV ?? 'development'}`);
      console.log(`[server] Port        : ${PORT}`);
      console.log(`[server] Health      : http://localhost:${PORT}/api/health`);
    });

    // Graceful shutdown handlers
    const shutdown = (signal: string) => {
      console.log(`\n[server] Received ${signal}. Shutting down gracefully...`);
      server.close(() => {
        console.log('[server] HTTP server closed.');
        process.exit(0);
      });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

  } catch (error) {
    console.error('[server] Failed to start:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

startServer();
