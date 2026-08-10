import {
  useEffect,
  useState,
} from 'react';

import {
  Header,
  Page,
  Content,
  SupportButton,
} from '@backstage/core-components';

import {
  useApi,
  configApiRef,
  identityApiRef,
} from '@backstage/core-plugin-api';

import { ExecutionForm } from './ExecutionForm';

import {
  JobStatusComponent,
  JobStatus,
} from './JobStatus';



interface JobEvent {

  jobName?: string;

  status: JobStatus;

}



interface ActiveJobResponse {

  active: boolean;

  jobName?: string;

  status?: JobStatus;

}



export const MakeDocPage = () => {

  const config =
    useApi(configApiRef);

  const identityApi =
    useApi(identityApiRef);



  const [activeJob, setActiveJob] =
    useState<string | null>(null);



  const [jobStatus, setJobStatus] =
    useState(
      'STARTED',
    );



  const [loading, setLoading] =
    useState(true);



  useEffect(() => {

    const backendUrl =
      config.getString(
        'backend.baseUrl',
      );



    let cancelled = false;



    async function loadActiveJob() {

      try {

        const credentials =
          await identityApi.getCredentials();



        const response =
          await fetch(
            `${backendUrl}/api/makedoc/active-job`,
            {
              headers: credentials.token
                ? {
                    Authorization:
                      `Bearer ${credentials.token}`,
                  }
                : {},
            },
          );



        const data: ActiveJobResponse =
          await response.json();



        if (
          data.active &&
          data.jobName
        ) {

          setActiveJob(
            data.jobName,
          );


          setJobStatus(
            data.status ?? 'STARTED',
          );

        }


      } catch(error) {

        console.error(
          'Failed loading active job',
          error,
        );

      }


      setLoading(false);

    }



    loadActiveJob();



    let abortController:
      AbortController | undefined;



    async function connectToEvents() {

      try {

        const credentials =
          await identityApi.getCredentials();



        abortController =
          new AbortController();



        const response =
          await fetch(
            `${backendUrl}/api/makedoc/events`,
            {
              headers: {
                Accept:
                  'text/event-stream',

                ...(credentials.token
                  ? {
                      Authorization:
                        `Bearer ${credentials.token}`,
                    }
                  : {}),
              },

              signal:
                abortController.signal,
            },
          );



        if (!response.ok) {

          throw new Error(
            `SSE connection failed: ${response.status} ${response.statusText}`,
          );

        }



        if (!response.body) {

          throw new Error(
            'SSE response has no body',
          );

        }



        const reader =
          response.body.getReader();



        const decoder =
          new TextDecoder();



        let buffer = '';



        while (!cancelled) {

          const {
            value,
            done,
          } =
            await reader.read();



          if (done) {
            break;
          }



          buffer +=
            decoder.decode(
              value,
              {
                stream: true,
              },
            );



          const messages =
            buffer.split('\n\n');



          buffer =
            messages.pop() ?? '';



          for (
            const message
            of messages
          ) {

            const dataLine =
              message
                .split('\n')
                .find(
                  line =>
                    line.startsWith(
                      'data:',
                    ),
                );



            if (!dataLine) {
              continue;
            }



            const eventData =
              dataLine
                .substring(5)
                .trim();



            if (!eventData) {
              continue;
            }



            try {

              const data =
                JSON.parse(
                  eventData,
                ) as JobEvent;



              console.log(
                'MakeDoc SSE event:',
                data,
              );



              if (
                data.jobName
              ) {

                setActiveJob(
                  data.jobName,
                );


                setJobStatus(
                  data.status,
                );

              }



            } catch(error) {

              console.error(
                'Failed parsing MakeDoc event',
                error,
              );

            }

          }

        }



      } catch(error) {

        if (
          !cancelled
        ) {

          console.error(
            'MakeDoc SSE error',
            error,
          );

        }

      }

    }



    connectToEvents();



    return () => {

      cancelled =
        true;



      if (
        abortController
      ) {

        abortController.abort();

      }

    };

  }, [
    config,
    identityApi,
  ]);



  return (

    <Page themeId="tool">



      <Content>


        <Header
          title="MakeDoc"
          subtitle="MakeDoc® provides automatic code review and analysis of TIBCO projects."
        >


          <SupportButton>

            MakeDoc® provides automatic code review and analysis of TIBCO projects.

          </SupportButton>


        </Header>





        {
          loading && (

            <div>

              Checking MakeDoc status...

            </div>

          )
        }





        {
          !loading &&
          activeJob && (

            <JobStatusComponent

              jobName={activeJob}

              status={jobStatus}

              onNewExecution={() => {

                setActiveJob(null);

                setJobStatus(
                  'STARTED',
                );

              }}

            />

          )
        }






        {
          !loading &&
          !activeJob && (

            <ExecutionForm

              onJobStarted={(jobName: string) => {

                setActiveJob(
                  jobName,
                );

                setJobStatus(
                  'STARTED',
                );

              }}

            />

          )
        }

      </Content>


    </Page>

  );

};