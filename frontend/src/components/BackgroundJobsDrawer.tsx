import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  X,
  RotateCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Play,
  RotateCcw,
  Ban,
  Database,
  BarChart3,
  Layers,
} from 'lucide-react';
import { apiRequest } from '../services/api';
import { usePreferences } from '../context/PreferencesContext';

interface JobItem {
  _id: string;
  jobId: string;
  type: string;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  progress: number;
  progressMessage?: string;
  attempts: number;
  maxAttempts: number;
  error?: { message: string; code?: string };
  queuedAt: string;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
}

interface QueueStats {
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  total: number;
}

interface ReadinessData {
  status: string;
  database: { status: string; pingOk: boolean; latencyMs: number | null };
  worker: { workerId: string; isHealthy: boolean; isRunning: boolean; activeJobs: number };
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onActiveJobsCountChange?: (count: number) => void;
}

export const BackgroundJobsDrawer: React.FC<Props> = ({ isOpen, onClose, onActiveJobsCountChange }) => {
  const { t } = usePreferences();
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [stats, setStats] = useState<QueueStats>({ queued: 0, processing: 0, completed: 0, failed: 0, total: 0 });
  const [readiness, setReadiness] = useState<ReadinessData | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchJobsAndStats = useCallback(async () => {
    try {
      const [jobsRes, statsRes, readyRes] = await Promise.all([
        apiRequest<JobItem[]>('/api/jobs?limit=10'),
        apiRequest<QueueStats>('/api/jobs/stats'),
        apiRequest<ReadinessData>('/api/ready').catch(() => null),
      ]);

      if (jobsRes?.data && Array.isArray(jobsRes.data)) {
        setJobs(jobsRes.data);
      }
      if (statsRes?.data) {
        setStats(statsRes.data);
        const active = (statsRes.data.queued || 0) + (statsRes.data.processing || 0);
        onActiveJobsCountChange?.(active);
      }
      if (readyRes?.data) {
        setReadiness(readyRes.data);
      }
    } catch {
      // Background poll failure handled gracefully
    }
  }, [onActiveJobsCountChange]);

  useEffect(() => {
    fetchJobsAndStats();
    // Poll every 3 seconds when open, or every 10 seconds when closed to keep badge updated
    const interval = setInterval(fetchJobsAndStats, isOpen ? 3000 : 10000);
    return () => clearInterval(interval);
  }, [fetchJobsAndStats, isOpen]);

  const handleTrigger = async (taskType: string) => {
    try {
      setActionLoading(taskType);
      await apiRequest('/api/jobs/trigger', {
        method: 'POST',
        body: JSON.stringify({ taskType }),
      });
      await fetchJobsAndStats();
    } catch (err: any) {
      alert(err.message || 'Failed to trigger task');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRetry = async (jobId: string) => {
    try {
      setActionLoading(jobId);
      await apiRequest(`/api/jobs/${jobId}/retry`, { method: 'POST' });
      await fetchJobsAndStats();
    } catch (err: any) {
      alert(err.message || 'Failed to retry job');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async (jobId: string) => {
    try {
      setActionLoading(jobId);
      await apiRequest(`/api/jobs/${jobId}/cancel`, { method: 'POST' });
      await fetchJobsAndStats();
    } catch (err: any) {
      alert(err.message || 'Failed to cancel job');
    } finally {
      setActionLoading(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose} />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-[#111827] border-l border-white/10 text-gray-100 flex flex-col shadow-2xl">
          {/* Header */}
          <div className="p-5 border-b border-white/10 flex items-center justify-between bg-black/20">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-blue-500/15 text-blue-400 border border-blue-500/30">
                <Activity size={18} />
              </div>
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  {t('Background Tasks & Queue')}
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                    #21
                  </span>
                </h2>
                <p className="text-xs text-gray-400">
                  {t('Asynchronous ledger & report worker')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setLoading(true);
                  fetchJobsAndStats().finally(() => setLoading(false));
                }}
                disabled={loading}
                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                title={t('Refresh')}
              >
                <RotateCw size={16} className={loading ? 'animate-spin' : ''} />
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Operational Readiness Banner */}
          {readiness && (
            <div className="px-5 py-3 bg-white/[0.02] border-b border-white/5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${readiness.status === 'ready' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                <span className="text-gray-300 font-medium">
                  {readiness.status === 'ready' ? t('Worker Active & Healthy') : t('Worker Degraded')}
                </span>
              </div>
              <div className="flex items-center gap-3 text-gray-400 text-[11px]">
                <span>DB: {readiness.database.latencyMs !== null ? `${readiness.database.latencyMs}ms` : 'ok'}</span>
                <span>Active: {readiness.worker.activeJobs}</span>
              </div>
            </div>
          )}

          {/* Queue Statistics Badges */}
          <div className="grid grid-cols-4 gap-2 p-4 border-b border-white/5 bg-black/10">
            <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-center">
              <div className="text-[10px] font-semibold text-blue-300 uppercase">{t('Queued')}</div>
              <div className="text-lg font-bold text-white mt-0.5">{stats.queued}</div>
            </div>
            <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-center">
              <div className="text-[10px] font-semibold text-amber-300 uppercase">{t('Processing')}</div>
              <div className="text-lg font-bold text-white mt-0.5">{stats.processing}</div>
            </div>
            <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-center">
              <div className="text-[10px] font-semibold text-emerald-300 uppercase">{t('Completed')}</div>
              <div className="text-lg font-bold text-white mt-0.5">{stats.completed}</div>
            </div>
            <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-center">
              <div className="text-[10px] font-semibold text-red-300 uppercase">{t('Failed')}</div>
              <div className="text-lg font-bold text-white mt-0.5">{stats.failed}</div>
            </div>
          </div>

          {/* Manual Task Actions */}
          <div className="p-4 border-b border-white/5 space-y-2">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              {t('Trigger Manual Task')}
            </p>
            <div className="grid grid-cols-1 gap-1.5">
              <button
                onClick={() => handleTrigger('REFRESH_DASHBOARD_SUMMARY')}
                disabled={actionLoading !== null}
                className="btn btn-secondary btn-sm justify-between text-xs py-2"
              >
                <span className="flex items-center gap-2">
                  <BarChart3 size={14} className="text-blue-400" />
                  {t('Refresh Dashboard Summary')}
                </span>
                <Play size={12} className="text-gray-400" />
              </button>
              <button
                onClick={() => handleTrigger('RUN_CUSTODY_RECONCILIATION')}
                disabled={actionLoading !== null}
                className="btn btn-secondary btn-sm justify-between text-xs py-2"
              >
                <span className="flex items-center gap-2">
                  <Database size={14} className="text-emerald-400" />
                  {t('Run Custody Integrity Scan')}
                </span>
                <Play size={12} className="text-gray-400" />
              </button>
              <button
                onClick={() => handleTrigger('REBUILD_MEMBER_LEDGER')}
                disabled={actionLoading !== null}
                className="btn btn-secondary btn-sm justify-between text-xs py-2"
              >
                <span className="flex items-center gap-2">
                  <Layers size={14} className="text-purple-400" />
                  {t('Rebuild Member Ledgers')}
                </span>
                <Play size={12} className="text-gray-400" />
              </button>
            </div>
          </div>

          {/* Job List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              {t('Recent Background Jobs')}
            </p>

            {jobs.length === 0 ? (
              <div className="text-center py-12 text-gray-500 text-xs">
                <Clock size={28} className="mx-auto mb-2 opacity-40" />
                {t('No recent background jobs found')}
              </div>
            ) : (
              jobs.map((job) => (
                <div
                  key={job._id}
                  className="p-3.5 rounded-lg border border-white/10 bg-white/[0.02] hover:border-white/20 transition-colors space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        {t(job.type.replace(/_/g, ' '))}
                      </div>
                      <div className="text-[10px] text-gray-400 font-mono mt-0.5">
                        {job.jobId}
                      </div>
                    </div>
                    <div>
                      {job.status === 'COMPLETED' && (
                        <span className="badge badge-active text-[10px] py-0.5 flex items-center gap-1">
                          <CheckCircle2 size={10} /> {t('Completed')}
                        </span>
                      )}
                      {job.status === 'PROCESSING' && (
                        <span className="badge bg-amber-500/20 text-amber-300 border-amber-500/30 text-[10px] py-0.5 flex items-center gap-1">
                          <RotateCw size={10} className="animate-spin" /> {t('Processing')}
                        </span>
                      )}
                      {job.status === 'QUEUED' && (
                        <span className="badge bg-blue-500/20 text-blue-300 border-blue-500/30 text-[10px] py-0.5 flex items-center gap-1">
                          <Clock size={10} /> {t('Queued')}
                        </span>
                      )}
                      {job.status === 'FAILED' && (
                        <span className="badge badge-inactive text-[10px] py-0.5 flex items-center gap-1">
                          <AlertTriangle size={10} /> {t('Failed')}
                        </span>
                      )}
                      {job.status === 'CANCELLED' && (
                        <span className="badge bg-gray-500/20 text-gray-400 border-gray-500/30 text-[10px] py-0.5 flex items-center gap-1">
                          <Ban size={10} /> {t('Cancelled')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Progress Bar */}
                  {job.status === 'PROCESSING' && (
                    <div className="space-y-1">
                      <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 transition-all duration-300"
                          style={{ width: `${job.progress}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-gray-400">
                        <span className="truncate">{job.progressMessage || t('Processing...')}</span>
                        <span>{job.progress}%</span>
                      </div>
                    </div>
                  )}

                  {/* Completion or Error Message */}
                  {job.status === 'FAILED' && job.error && (
                    <div className="p-2 rounded bg-red-500/10 border border-red-500/20 text-[11px] text-red-300 break-words">
                      {job.error.message}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1 text-[10px] text-gray-500 border-t border-white/5">
                    <span>
                      {t('Queued')}: {new Date(job.queuedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    <div className="flex items-center gap-2">
                      {job.status === 'FAILED' && (
                        <button
                          onClick={() => handleRetry(job.jobId)}
                          disabled={actionLoading === job.jobId}
                          className="text-blue-400 hover:text-blue-300 flex items-center gap-1 font-semibold"
                        >
                          <RotateCcw size={11} /> {t('Retry')}
                        </button>
                      )}
                      {job.status === 'QUEUED' && (
                        <button
                          onClick={() => handleCancel(job.jobId)}
                          disabled={actionLoading === job.jobId}
                          className="text-gray-400 hover:text-red-400 flex items-center gap-1 font-semibold"
                        >
                          <Ban size={11} /> {t('Cancel')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
