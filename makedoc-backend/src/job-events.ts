// manages the server-sent events used to report job progress to connected clients
// clients receive events whenever the job status changes
// the latest event is also sent immediately when a new client connects
// events contain the job name when available and the current job status, for example:
//    { "jobName": "makedoc-job-123", "status": "STARTED" }
// the file also keeps track of the latest job so it can be returned through the latest-job endpoint
//    even when no SSE clients are currently connected


import {
  JobStatus,
} from './types';

// describes a job status event sent to connected SSE clients.
export interface JobEvent {

  jobName?: string;

  status: JobStatus;

}

// describes the latest job status.
export interface LatestJobResponse {

  exists: boolean;

  jobName?: string;

  status?: JobStatus;

}

// represents an HTTP response that can receive SSE messages.
type SSEResponse = {
  write: (chunk: string) => void;
};

// stores all currently connected SSE clients.
const clients =
  new Set<SSEResponse>();

// stores the most recently published job event.
let latestEvent:
  JobEvent | undefined;

// stores the name of the most recently tracked job.
let latestJobName:
  string | undefined;

// stores the current status of the most recently tracked job.
let latestJobStatus:
  JobStatus | undefined;

// registers a new SSE client and sends it the latest event.
export function addClient(
  response: SSEResponse,
): void {

  clients.add(
    response,
  );

  // sends the latest event immediately when one already exists.
  if (latestEvent) {

    response.write(
      `data: ${JSON.stringify(latestEvent)}\n\n`,
    );

  }

}

// removes an SSE client from the active client list.
export function removeClient(
  response: SSEResponse,
): void {

  clients.delete(
    response,
  );

}

// updates the latest job state and broadcasts the event to all clients.
export function publishJobEvent(
  event: JobEvent,
): void {

  latestEvent =
    event;

  // updates the tracked job name when the event contains one.
  if (
    event.jobName
  ) {

    latestJobName =
      event.jobName;
  }

  // updates the tracked job status from the latest event.
  latestJobStatus =
    event.status;

  // formats the event according to the Server-Sent Events protocol.
  const payload =
    `data: ${JSON.stringify(event)}\n\n`;

  // sends the event to every currently connected client.
  for (
    const client
    of clients
  ) {

    try {

      client.write(
        payload,
      );

    } catch {

      // removes clients that can no longer receive events.
      clients.delete(
        client,
      );

    }

  }

}

// returns the latest tracked job or indicates that no job exists.
export function getLatestJob(): LatestJobResponse {

  // reports no job when a job name has not been recorded yet.
  if (
    !latestJobName
  ) {

    return {
      exists:
        false,
    };

  }

  return {

    exists:
      true,

    jobName:
      latestJobName,

    status:
      latestJobStatus,

  };

}