import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth.js';
import { JobQueueService } from '../services/jobs/job-queue.service.js';
import { JobType, JobStatus } from '../types/jobs.js';
import { createError } from '../middlewares/error.js';

export class JobController {
  /**
   * GET /api/jobs
   */
  static async list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { status, type, limit, skip } = req.query;
      const result = await JobQueueService.listJobs({
        status: status as JobStatus,
        type: type as JobType,
        limit: limit ? parseInt(String(limit), 10) : undefined,
        skip: skip ? parseInt(String(skip), 10) : undefined,
      });

      res.status(200).json({
        success: true,
        data: result.jobs,
        total: result.total,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/jobs/stats
   */
  static async stats(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const stats = await JobQueueService.getQueueStats();
      res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/jobs/:id
   */
  static async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const job = await JobQueueService.getJobById(id);
      if (!job) {
        return next(createError(`Job not found: ${id}`, 404));
      }

      res.status(200).json({
        success: true,
        data: job,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/jobs/:id/retry
   */
  static async retry(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const job = await JobQueueService.retryJob(id);
      res.status(200).json({
        success: true,
        message: 'Job queued for retry',
        data: job,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/jobs/:id/cancel
   */
  static async cancel(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const job = await JobQueueService.cancelJob(id);
      res.status(200).json({
        success: true,
        message: 'Job cancelled successfully',
        data: job,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/jobs/trigger
   * Allows authorized administrators to trigger manual background tasks.
   */
  static async trigger(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { taskType, payload } = req.body;
      if (!taskType || !Object.values(JobType).includes(taskType)) {
        return next(createError(`Invalid taskType. Supported types: ${Object.values(JobType).join(', ')}`, 400));
      }

      const job = await JobQueueService.enqueueJob(taskType, payload || {}, {
        requestedBy: (req.user as any)?._id,
        correlationId: req.correlationId,
      });

      res.status(202).json({
        success: true,
        message: `Task ${taskType} has been enqueued`,
        data: {
          jobId: job.jobId,
          type: job.type,
          status: job.status,
          queuedAt: job.queuedAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
