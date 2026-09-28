import 'dotenv/config';
import { connectDatabase } from './config/db.js';
import { JobWorkerService } from './services/jobs/job-worker.service.js';
import { logger } from './utils/logger.js';

async function startStandaloneWorker(): Promise<void> {
  try {
    logger.info('Starting standalone background worker process...', { component: 'WorkerProcess' });
    await connectDatabase();
    logger.info('MongoDB connected for background worker.', { component: 'WorkerProcess' });

    JobWorkerService.start();

    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}. Shutting down worker...`, { component: 'WorkerProcess' });
      await JobWorkerService.stop();
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (error) {
    logger.error('Failed to start standalone worker process', error, { component: 'WorkerProcess' });
    process.exit(1);
  }
}

startStandaloneWorker();
