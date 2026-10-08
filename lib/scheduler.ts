import { getSyncConfig } from './config';
import { lastRun, startJob, getJobStates, JobId } from './sync';

const g = globalThis as unknown as { __schedulerStarted?: boolean };

function due(job: JobId, hours: number): boolean {
  if (!hours) return false;
  if (getJobStates()[job].running) return false;
  const run = lastRun(job);
  if (!run) return true;
  return Date.now() - new Date(run.started_at).getTime() >= hours * 3600 * 1000;
}

function tick() {
  try {
    const config = getSyncConfig();
    if (due('asc', config.autoSyncHours)) startJob('asc', 'schedule');
    if (due('store', config.storeSyncHours)) startJob('store', 'schedule');
  } catch (err) {
    console.error('[scheduler]', err);
  }
}

/** Checks every 5 minutes whether an automatic sync is due. Safe to call more than once. */
export function startScheduler() {
  if (g.__schedulerStarted || process.env.DISABLE_SCHEDULER === '1') return;
  g.__schedulerStarted = true;
  console.log('[scheduler] started');
  setTimeout(tick, 30_000);
  setInterval(tick, 5 * 60_000);
}
