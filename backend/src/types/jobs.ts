export enum JobType {
  REBUILD_MEMBER_LEDGER = 'REBUILD_MEMBER_LEDGER',
  RUN_CUSTODY_RECONCILIATION = 'RUN_CUSTODY_RECONCILIATION',
  IMPORT_MIGRATION_BATCH = 'IMPORT_MIGRATION_BATCH',
  GENERATE_ANNUAL_DOCUMENT = 'GENERATE_ANNUAL_DOCUMENT',
  REFRESH_DASHBOARD_SUMMARY = 'REFRESH_DASHBOARD_SUMMARY',
}

export enum JobStatus {
  QUEUED = 'QUEUED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export interface JobProgressUpdate {
  progress: number;
  message?: string;
}

export interface IJobRecord {
  jobId: string;
  type: JobType;
  status: JobStatus;
  payload: Record<string, any>;
  progress: number;
  progressMessage?: string;
  result?: Record<string, any>;
  error?: {
    message: string;
    code?: string;
  };
  attempts: number;
  maxAttempts: number;
  correlationId: string;
  requestedBy?: string;
  workerId?: string;
  queuedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  nextRunAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
