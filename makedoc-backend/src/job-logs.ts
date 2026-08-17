// manages the collection and delivery of MakeDoc container logs through server-sent events
// logs are collected directly from the Kubernetes step2-makedoc-engine container and stored
//    in memory for each job so they can be replayed when a client connects or refreshes the page
// connected clients receive new log messages immediately as they are collected from Kubernetes
// clients receive log events in the following SSE format:
//    event: log
//    data: "example log message"

import {
  Log,
} from '@kubernetes/client-node';

import {
  Writable,
} from 'stream';

import {
  getKubeConfig,
  KUBE_NAMESPACE,
} from './kubernetes';

import {
  getJobStatus,
} from './job-status';

type SSEResponse = {
  write: (chunk: string) => void;
};

// stores SSE clients grouped by job name
const logClients =
  new Map<string, Set<SSEResponse>>();

// stores collected log messages for each job
const jobLogs =
  new Map<string, string[]>();

// tracks jobs that already have an active log collector
const collectingJobs =
  new Set();

// controls how long the collector waits before retrying Kubernetes operations
const logCollectionRetryDelay =
  1000;

// sends a single log message to an SSE client
function sendLogEvent(
  response: SSEResponse,
  message: string,
): void {

  const payload =
    `event: log\n` +
    `data: ${JSON.stringify(message)}\n\n`;

  try {

    response.write(
      payload,
    );

  } catch {

    // ignores disconnected clients because they will no longer receive events

  }

}

// clears any previous logs and creates an empty log collection for the job
export function initializeJobLogs(
  jobName: string,
): void {

  jobLogs.clear();

  jobLogs.set(
    jobName,
    [],
  );

}

// returns a copy of all logs currently stored for the specified job
export function getStoredJobLogs(
  jobName: string,
): string[] {

  return [
    ...(jobLogs.get(jobName) ?? []),
  ];

}

// sends stored logs to a new client before registering it for live events
export function addLogClient(
  jobName: string,
  response: SSEResponse,
): void {

  if (
    !logClients.has(jobName)
  ) {

    logClients.set(
      jobName,
      new Set<SSEResponse>(),
    );

  }

  // sends historical logs before registering the client for live events
  // this keeps the replay ordered and prevents logs from being received twice after a refresh
  const storedLogs =
    jobLogs.get(jobName) ?? [];

  for (
    const log
    of storedLogs
  ) {

    sendLogEvent(
      response,
      log,
    );

  }

  logClients
    .get(jobName)!
    .add(response);

}

// removes a client and deletes the job entry when no clients remain
export function removeLogClient(
  jobName: string,
  response: SSEResponse,
): void {

  const clients =
    logClients.get(jobName);

  if (!clients) {

    return;

  }

  clients.delete(
    response,
  );

  if (
    clients.size === 0
  ) {

    logClients.delete(
      jobName,
    );

  }

}

// stores a new log message and broadcasts it to connected clients
function publishLog(
  jobName: string,
  message: string,
): void {

  // stores the log before publishing it so logs remain available even when no clients are connected
  if (
    !jobLogs.has(jobName)
  ) {

    jobLogs.set(
      jobName,
      [],
    );

  }

  jobLogs
    .get(jobName)!
    .push(
      message,
    );

  const clients =
    logClients.get(jobName);

  if (!clients) {

    return;

  }

  const payload =
    `event: log\n` +
    `data: ${JSON.stringify(message)}\n\n`;

  for (
    const client
    of clients
  ) {

    try {

      client.write(
        payload,
      );

    } catch {

      // removes clients that can no longer receive log events
      clients.delete(
        client,
      );

    }

  }

}

// waits for the job pod to become available or for the job to finish
async function waitForPod(
  jobName: string,
): Promise<string | undefined> {

  let jobFinished =
    false;

  while (
    !jobFinished
  ) {

    try {

      const jobStatus =
        await getJobStatus(
          jobName,
        );

      if (
        jobStatus.podName
      ) {

        return jobStatus.podName;

      }

      // stops waiting if the job has finished without a pod
      // any logs collected before this point remain stored in jobLogs
      if (
        jobStatus.status === 'COMPLETED' ||
        jobStatus.status === 'FAILED'
      ) {

        jobFinished =
          true;

      }

    } catch {

      // keeps checking if Kubernetes temporarily fails to return the job status
      // temporary Kubernetes errors should not stop log collection

    }

    if (
      !jobFinished
    ) {

      await new Promise<void>(
        resolve => {

          setTimeout(
            resolve,
            logCollectionRetryDelay,
          );

        },
      );

    }

  }

  return undefined;

}

// streams logs from the MakeDoc container and stores each received message
async function streamMakeDocLogs(
  jobName: string,
  podName: string,
): Promise<void> {

  const kubeConfig =
    getKubeConfig();

  const log =
    new Log(
      kubeConfig,
    );

  const writable =
    new Writable({

      write(
        chunk,
        _encoding,
        callback,
      ) {

        const message =
          chunk.toString();

        if (
          message.length > 0
        ) {

          publishLog(
            jobName,
            message,
          );

        }

        callback();

      },

    });

  // allows Kubernetes log errors to propagate so the caller can decide whether collection should be retried

  await log.log(
    KUBE_NAMESPACE,
    podName,
    'step2-makedoc-engine',
    writable,
    {
      follow: true,
    },
  );

}

// starts a background log collector for the specified job
export function startMakeDocLogCollection(
  jobName: string,
): void {

  // prevents multiple collectors from streaming the same job simultaneously
  if (
    collectingJobs.has(jobName)
  ) {

    return;

  }

  collectingJobs.add(
    jobName,
  );

  void (
    async () => {

      let shouldRetry =
        true;

      try {

        while (
          shouldRetry
        ) {

          const podName =
            await waitForPod(
              jobName,
            );

          if (
            !podName
          ) {

            shouldRetry =
              false;

            continue;

          }

          try {

            // retries temporary startup errors because the pod can exist before the MakeDoc container is ready
            await streamMakeDocLogs(
              jobName,
              podName,
            );

            // stops normally when the Kubernetes log stream ends
            shouldRetry =
              false;

          } catch (error) {

            console.error(
              `MakeDoc log stream failed for ${jobName}:`,
              error,
            );

            // checks the job state to determine whether the stream failure happened during startup or after completion
            try {

              const jobStatus =
                await getJobStatus(
                  jobName,
                );

              if (
                jobStatus.status === 'COMPLETED' ||
                jobStatus.status === 'FAILED'
              ) {

                // stops collection because the job has reached a terminal state
                shouldRetry =
                  false;

                continue;

              }

            } catch {

              // keeps the collector alive when the status check temporarily fails

            }

            // retries the log stream while the job remains active
            await new Promise<void>(
              resolve => {

                setTimeout(
                  resolve,
                  logCollectionRetryDelay,
                );

              },
            );

          }

        }

      } catch (error) {

        // logs unexpected collector errors while preserving all previously collected logs
        console.error(
          `MakeDoc log collection failed for ${jobName}:`,
          error,
        );

      } finally {

        // allows a new collector to be started if this collector terminates
        collectingJobs.delete(
          jobName,
        );

      }

    }
  )();

}