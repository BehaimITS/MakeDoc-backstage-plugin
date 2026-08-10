import {
  JobStatus,
} from './types';


export interface JobEvent {

  jobName?: string;

  status: JobStatus;

}



type SSEResponse = {
  write: (chunk: string) => void;
};



const clients =
  new Set<SSEResponse>();



let latestEvent:
  JobEvent | undefined;



export function addClient(
  response: SSEResponse,
): void {

  clients.add(
    response,
  );


  if (latestEvent) {

    response.write(
      `data: ${JSON.stringify(latestEvent)}\n\n`,
    );

  }

}



export function removeClient(
  response: SSEResponse,
): void {

  clients.delete(
    response,
  );

}



export function publishJobEvent(
  event: JobEvent,
): void {

  latestEvent =
    event;


  const payload =
    `data: ${JSON.stringify(event)}\n\n`;



  for (
    const client
    of clients
  ) {

    try {

      client.write(
        payload,
      );


    } catch {

      clients.delete(
        client,
      );

    }

  }

}