// monitors the active MakeDoc job and tracks changes to its status
// the monitor checks Kubernetes every three seconds and only updates the stored state when the job or status changes
// completed and failed jobs remain tracked for one hour before the stored job state is cleared
// the monitor starts automatically when startJobMonitor is called

import {
  getActiveJob,
  getJobStatus,
} from './job-status';

import {
  publishJobEvent,
} from './job-events';

import {
  JobStatus,
} from './types';

let lastJobName: string | undefined;

let lastStatus: JobStatus | undefined;

const MONITOR_INTERVAL_MS = 3000;

// checks the active job and updates the stored state when it changes
async function checkJobs(): Promise<void> {

  try {

    const activeJob =
      await getActiveJob();

    if (
      !activeJob.jobName
    ) {

      return;

    }

    const jobName =
      activeJob.jobName;

    const statusResponse =
      await getJobStatus(
        jobName,
      );

    const status =
      statusResponse.status;

    const changed =
      jobName !== lastJobName ||
      status !== lastStatus;

    if (!changed) {

      return;

    }

    lastJobName =
      jobName;

    lastStatus =
      status;

    publishJobEvent({
      jobName,
      status,
    });

    if (
      status === 'COMPLETED' ||
      status === 'FAILED'
    ) {

      setTimeout(() => {

        if (
          lastJobName === jobName &&
          lastStatus === status
        ) {

          lastJobName =
            undefined;

          lastStatus =
            undefined;

        }

      }, 3600000);

    }

  } catch (error) {

    console.error(
      'Failed monitoring MakeDoc jobs',
      // error,
    );

  }

}

// starts the job monitor and continues checking for status changes
export function startJobMonitor(): void {

  checkJobs();

  setInterval(
    checkJobs,
    MONITOR_INTERVAL_MS,
  );

}