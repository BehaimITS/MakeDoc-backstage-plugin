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

import {
  ExecutionForm,
} from './ExecutionForm';

import {
  JobStatusComponent,
  JobStatus,
} from './JobStatus';

// represents a live MakeDoc status event received from the backend
interface JobEvent {

  jobName?: string;

  status: JobStatus;

}

// represents the latest MakeDoc execution returned by the backend
interface LatestJobResponse {

  exists: boolean;

  jobName?: string;

  status?: JobStatus;

}

// controls the main MakeDoc page and switches between execution and status views
export const MakeDocPage = () => {

  const config =
    useApi(
      configApiRef,
    );

  const identityApi =
    useApi(
      identityApiRef,
    );

  const [activeJob, setActiveJob] =
    useState<string | null>(
      null,
    );

  const [jobStatus, setJobStatus] =
    useState<JobStatus>(
      'STARTED',
    );

  const [loading, setLoading] =
    useState(true);

  // loads the latest MakeDoc execution and subscribes to live status updates
  useEffect(() => {

    const backendUrl =
      config.getString(
        'backend.baseUrl',
      );

    let cancelled =
      false;

    // loads the most recently created MakeDoc Job
    //
    // /latest-job is used instead of /active-job because the page
    // must also restore completed or failed executions after refresh
    //
    // the backend keeps the latest Job information in memory even
    // after the Kubernetes Job and Pod have finished
    async function loadLatestJob() {

      try {

        const credentials =
          await identityApi.getCredentials();

        if (
          cancelled
        ) {

          return;

        }

        const response =
          await fetch(
            `${backendUrl}/api/makedoc/latest-job`,
            {
              headers:
                credentials.token
                  ? {
                      Authorization:
                        `Bearer ${credentials.token}`,
                    }
                  : {},
            },
          );

        if (
          !response.ok
        ) {

          throw new Error(
            `Failed loading latest MakeDoc job: ${response.status} ${response.statusText}`,
          );

        }

        const data:
          LatestJobResponse =
            await response.json();

        if (
          !cancelled &&
          data.exists &&
          data.jobName
        ) {

          setActiveJob(
            data.jobName,
          );

          setJobStatus(
            data.status ?? 'STARTED',
          );

        }

      } catch (
        error
      ) {

        if (
          !cancelled
        ) {

          console.error(
            'Failed loading latest MakeDoc job',
            error,
          );

        }

      }

      if (
        !cancelled
      ) {

        setLoading(
          false,
        );

      }

    }

    loadLatestJob();

    // subscribes to the backend MakeDoc event stream
    //
    // the stream keeps the page status synchronized while a Job is running
    //
    // the backend also sends the latest known event when the connection
    // is established, allowing a refreshed page to recover the status
    let abortController:
      AbortController | undefined;

    async function connectToEvents() {

      try {

        const credentials =
          await identityApi.getCredentials();

        if (
          cancelled
        ) {

          return;

        }

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

        if (
          !response.ok
        ) {

          throw new Error(
            `SSE connection failed: ${response.status} ${response.statusText}`,
          );

        }

        if (
          !response.body
        ) {

          throw new Error(
            'SSE response has no body',
          );

        }

        const reader =
          response.body.getReader();

        const decoder =
          new TextDecoder();

        let buffer =
          '';

        while (
          !cancelled
        ) {

          const {
            value,
            done,
          } =
            await reader.read();

          if (
            done
          ) {

            break;

          }

          buffer +=
            decoder.decode(
              value,
              {
                stream:
                  true,
              },
            );

          const messages =
            buffer.split(
              '\n\n',
            );

          buffer =
            messages.pop() ?? '';

          for (
            const message
            of messages
          ) {

            if (
              cancelled
            ) {

              return;

            }

            const dataLine =
              message
                .split('\n')
                .find(
                  line =>
                    line.startsWith(
                      'data:',
                    ),
                );

            if (
              !dataLine
            ) {

              continue;

            }

            const eventData =
              dataLine
                .substring(5)
                .trim();

            if (
              !eventData
            ) {

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

              // only update the Job currently displayed by the page
              //
              // a newly created Job is selected by the /run-job response
              // through the ExecutionForm callback
              if (
                data.jobName
              ) {

                setActiveJob(
                  currentJob => {

                    if (
                      currentJob ===
                      data.jobName
                    ) {

                      setJobStatus(
                        data.status,
                      );

                    }

                    return currentJob;

                  },
                );

              }

            } catch (
              error
            ) {

              console.error(
                'Failed parsing MakeDoc event',
                error,
              );

            }

          }

        }

      } catch (
        error
      ) {

        if (
          !cancelled
        ) {

          if (
            error instanceof DOMException &&
            error.name === 'AbortError'
          ) {

            return;

          }

          console.error(
            'MakeDoc SSE error',
            error,
          );

        }

      }

    }

    connectToEvents();

    // stops the SSE connection when the page is unmounted
    //
    // prevents the component from receiving events after leaving
    // the MakeDoc page
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
          // displays the current Job and its logs when an execution exists
          !loading &&
          activeJob && (

            <JobStatusComponent

              jobName={
                activeJob
              }

              status={
                jobStatus
              }

              onNewExecution={() => {

                // switches the frontend back to the execution form
                //
                // the backend keeps the previous Job and its collected logs
                // until another Job is started
                setActiveJob(
                  null,
                );

                setJobStatus(
                  'STARTED',
                );

              }}

            />

          )
        }

        {
          // displays the execution form when no Job is selected
          !loading &&
          !activeJob && (

            <ExecutionForm

              onJobStarted={(
                jobName: string,
              ) => {

                // selects the newly created Job returned by /run-job
                //
                // this mounts JobStatusComponent, which connects to the
                // backend event and log streams for this specific Job
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