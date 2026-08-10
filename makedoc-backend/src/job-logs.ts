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



type SSEResponse = {
  write: (chunk: string) => void;
};



const logClients =
  new Map<string, Set<SSEResponse>>();




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


  logClients
    .get(jobName)!
    .add(response);

}



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



function publishLog(
  jobName: string,
  message: string,
): void {

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

      clients.delete(
        client,
      );

    }

  }

}



export async function streamMakeDocLogs(
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

        publishLog(
          jobName,
          chunk.toString(),
        );


        callback();

      },

    });



  await log.log(

    KUBE_NAMESPACE,

    podName,

    'step2-makedoc-engine',

    writable,

    {
      follow: true,
      tailLines: 100,
    },

  );

}