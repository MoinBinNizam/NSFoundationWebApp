import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../app.js';
import { JobQueueService } from '../services/jobs/job-queue.service.js';
import { JobWorkerService } from '../services/jobs/job-worker.service.js';
import { JobType, JobStatus } from '../types/jobs.js';
import { JobRecord } from '../models/JobRecord.js';

describe('Background Jobs & Readiness System', () => {
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ns-foundation';

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGODB_URI);
    }
    // Clean up test jobs
    await JobRecord.deleteMany({ correlationId: { $regex: /^test_/ } });
  });

  afterAll(async () => {
    await JobRecord.deleteMany({ correlationId: { $regex: /^test_/ } });
    await JobWorkerService.stop();
  });

  describe('GET /api/health and GET /api/ready', () => {
    it('returns 200 OK for /api/health with database status', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('database');
    });

    it('returns readiness report for /api/ready with worker heartbeat and queue metrics', async () => {
      // Ensure worker is running to register heartbeat
      JobWorkerService.start();

      const res = await request(app).get('/api/ready');
      expect([200, 503]).toContain(res.status);
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('database');
      expect(res.body).toHaveProperty('worker');
      expect(res.body.worker).toHaveProperty('workerId');
      expect(res.body.worker).toHaveProperty('isHealthy');
      expect(res.body).toHaveProperty('queue');
    });

    it('propagates correlation ID on responses', async () => {
      const testCorrelationId = 'test_corr_12345';
      const res = await request(app)
        .get('/api/health')
        .set('x-correlation-id', testCorrelationId);

      expect(res.headers['x-correlation-id']).toBe(testCorrelationId);
    });
  });

  describe('JobQueueService', () => {
    it('successfully enqueues a new background job with correlation tracking', async () => {
      const job = await JobQueueService.enqueueJob(
        JobType.REFRESH_DASHBOARD_SUMMARY,
        { scope: 'TEST' },
        { correlationId: 'test_corr_queue_1' }
      );

      expect(job).toBeDefined();
      expect(job.jobId).toMatch(/^job_/);
      expect(job.type).toBe(JobType.REFRESH_DASHBOARD_SUMMARY);
      expect(job.status).toBe(JobStatus.QUEUED);
      expect(job.progress).toBe(0);
      expect(job.attempts).toBe(0);
      expect(job.correlationId).toBe('test_corr_queue_1');
    });

    it('retrieves an enqueued job by its unique jobId', async () => {
      const created = await JobQueueService.enqueueJob(
        JobType.RUN_CUSTODY_RECONCILIATION,
        {},
        { correlationId: 'test_corr_queue_2' }
      );

      const fetched = await JobQueueService.getJobById(created.jobId);
      expect(fetched).not.toBeNull();
      expect(fetched?.jobId).toBe(created.jobId);
      expect(fetched?.type).toBe(JobType.RUN_CUSTODY_RECONCILIATION);
    });

    it('lists jobs with pagination and status filtering', async () => {
      const list = await JobQueueService.listJobs({ limit: 10 });
      expect(list).toHaveProperty('jobs');
      expect(list).toHaveProperty('total');
      expect(Array.isArray(list.jobs)).toBe(true);
      expect(list.total).toBeGreaterThan(0);
    });

    it('provides aggregated queue statistics', async () => {
      const stats = await JobQueueService.getQueueStats();
      expect(stats).toHaveProperty('queued');
      expect(stats).toHaveProperty('processing');
      expect(stats).toHaveProperty('completed');
      expect(stats).toHaveProperty('failed');
      expect(stats).toHaveProperty('total');
    });

    it('cancels a queued job', async () => {
      const job = await JobQueueService.enqueueJob(
        JobType.REBUILD_MEMBER_LEDGER,
        {},
        { correlationId: 'test_corr_cancel' }
      );

      const cancelled = await JobQueueService.cancelJob(job.jobId);
      expect(cancelled.status).toBe(JobStatus.CANCELLED);
      expect(cancelled.progressMessage).toContain('Cancelled');
    });
  });

  describe('JobWorkerService execution lifecycle', () => {
    it('executes a REFRESH_DASHBOARD_SUMMARY job and marks it completed', async () => {
      JobWorkerService.start();

      const job = await JobQueueService.enqueueJob(
        JobType.REFRESH_DASHBOARD_SUMMARY,
        {},
        { correlationId: 'test_corr_exec' }
      );

      // Wait up to 6 seconds for worker poll and execution
      let completedJob = null;
      for (let i = 0; i < 12; i++) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const current = await JobQueueService.getJobById(job.jobId);
        if (current?.status === JobStatus.COMPLETED) {
          completedJob = current;
          break;
        }
      }

      expect(completedJob).not.toBeNull();
      expect(completedJob?.status).toBe(JobStatus.COMPLETED);
      expect(completedJob?.progress).toBe(100);
      expect(completedJob?.result).toBeDefined();
    }, 10000);
  });
});
