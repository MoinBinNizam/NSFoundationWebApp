import crypto from 'crypto';
import { JobRecord, JobRecordDocument } from '../../models/JobRecord.js';
import { JobType, JobStatus } from '../../types/jobs.js';
import { logger } from '../../utils/logger.js';

export interface EnqueueOptions {
  requestedBy?: string;
  correlationId?: string;
  maxAttempts?: number;
}

export class JobQueueService {
  /**
   * Enqueues a new background job with a unique identifier and correlation ID.
   */
  static async enqueueJob(
    type: JobType,
    payload: Record<string, any> = {},
    options: EnqueueOptions = {}
  ): Promise<JobRecordDocument> {
    const jobId = `job_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const correlationId = options.correlationId || `corr_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

    const job = await JobRecord.create({
      jobId,
      type,
      status: JobStatus.QUEUED,
      payload,
      progress: 0,
      attempts: 0,
      maxAttempts: options.maxAttempts ?? 3,
      correlationId,
      requestedBy: options.requestedBy,
      queuedAt: new Date(),
      nextRunAt: new Date(),
    });

    logger.info(`Background job queued: ${type} [${jobId}]`, {
      correlationId,
      component: 'JobQueue',
      jobId,
      jobType: type,
    });

    return job;
  }

  /**
   * Retrieves a job by its unique jobId string.
   */
  static async getJobById(jobId: string): Promise<JobRecordDocument | null> {
    return JobRecord.findOne({ jobId }).populate('requestedBy', 'name email role');
  }

  /**
   * Lists jobs with optional filtering, sorting by most recent first.
   */
  static async listJobs(filter: {
    status?: JobStatus;
    type?: JobType;
    limit?: number;
    skip?: number;
  } = {}): Promise<{ jobs: JobRecordDocument[]; total: number }> {
    const query: Record<string, any> = {};
    if (filter.status) query.status = filter.status;
    if (filter.type) query.type = filter.type;

    const limit = Math.min(filter.limit ?? 20, 100);
    const skip = filter.skip ?? 0;

    const [jobs, total] = await Promise.all([
      JobRecord.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('requestedBy', 'name email role'),
      JobRecord.countDocuments(query),
    ]);

    return { jobs, total };
  }

  /**
   * Returns aggregated queue counts by status.
   */
  static async getQueueStats(): Promise<{
    queued: number;
    processing: number;
    completed: number;
    failed: number;
    total: number;
  }> {
    const [queued, processing, completed, failed, total] = await Promise.all([
      JobRecord.countDocuments({ status: JobStatus.QUEUED }),
      JobRecord.countDocuments({ status: JobStatus.PROCESSING }),
      JobRecord.countDocuments({ status: JobStatus.COMPLETED }),
      JobRecord.countDocuments({ status: JobStatus.FAILED }),
      JobRecord.countDocuments(),
    ]);

    return { queued, processing, completed, failed, total };
  }

  /**
   * Resets a failed job back to QUEUED for another processing attempt.
   */
  static async retryJob(jobId: string): Promise<JobRecordDocument> {
    const job = await JobRecord.findOne({ jobId });
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    if (job.status !== JobStatus.FAILED) {
      throw new Error(`Only failed jobs can be retried. Current status: ${job.status}`);
    }

    job.status = JobStatus.QUEUED;
    job.progress = 0;
    job.progressMessage = 'Queued for retry';
    job.error = undefined;
    job.nextRunAt = new Date();
    await job.save();

    logger.info(`Job queued for retry: ${jobId}`, {
      correlationId: job.correlationId,
      component: 'JobQueue',
      jobId,
    });

    return job;
  }

  /**
   * Cancels a currently queued job.
   */
  static async cancelJob(jobId: string): Promise<JobRecordDocument> {
    const job = await JobRecord.findOne({ jobId });
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    if (job.status !== JobStatus.QUEUED) {
      throw new Error(`Only queued jobs can be cancelled. Current status: ${job.status}`);
    }

    job.status = JobStatus.CANCELLED;
    job.progressMessage = 'Cancelled by administrator';
    await job.save();

    logger.info(`Job cancelled: ${jobId}`, {
      correlationId: job.correlationId,
      component: 'JobQueue',
      jobId,
    });

    return job;
  }
}
