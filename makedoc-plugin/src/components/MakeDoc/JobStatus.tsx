import {
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  Box,
  Typography,
  Button,
  Stepper,
  Step,
  StepLabel,
  CircularProgress,
} from '@material-ui/core';

import {
  useApi,
  identityApiRef,
  configApiRef,
} from '@backstage/core-plugin-api';



export type JobStatus =
  | 'STARTED'
  | 'CLONING_REPOSITORY'
  | 'MAKEDOC_RUNNING'
  | 'COMMITTING_DOCUMENTATION'
  | 'COMPLETED'
  | 'FAILED';



export interface JobStatusProps {

  jobName: string;

  status: JobStatus;

  onNewExecution: () => void;

}



const steps: {
  status: JobStatus;
  label: string;
  description: string;
}[] = [

  {
    status: 'STARTED',
    label: 'Starting job',
    description: 'Preparing MakeDoc execution.',
  },

  {
    status: 'CLONING_REPOSITORY',
    label: 'Cloning repository',
    description: 'Downloading source repository.',
  },

  {
    status: 'MAKEDOC_RUNNING',
    label: 'Generating documentation',
    description: 'MakeDoc is generating documentation.',
  },

  {
    status: 'COMMITTING_DOCUMENTATION',
    label: 'Committing documentation',
    description: 'Publishing generated documentation.',
  },

  {
    status: 'COMPLETED',
    label: 'Finished',
    description: 'Documentation generation completed.',
  },

];



const LoadingStepIcon = () => (

  <CircularProgress
    size={24}
  />

);



export const JobStatusComponent = ({
  jobName,
  onNewExecution,
}: JobStatusProps) => {

  const config =
    useApi(configApiRef);

  const identityApi =
    useApi(identityApiRef);



  const backendUrl =
    config.getString(
      'backend.baseUrl',
    );



  const [status, setStatus] =
    useState<JobStatus>('STARTED');



  const [logs, setLogs] =
    useState<string[]>([]);



  const logsContainerRef =
    useRef<HTMLDivElement | null>(null);



  const logStorageKey =
    `makedoc-logs-${jobName}`;



  useEffect(() => {

    const lastJob =
      localStorage.getItem(
        'makedoc-last-job',
      );


    if (
      lastJob !== jobName
    ) {

      setLogs([]);

      localStorage.setItem(
        'makedoc-last-job',
        jobName,
      );

      return;

    }


    const saved =
      localStorage.getItem(
        logStorageKey,
      );


    if (saved) {

      try {

        setLogs(
          JSON.parse(saved),
        );

      } catch {

        setLogs([]);

      }

    }

  }, [
    jobName,
    logStorageKey,
  ]);



  useEffect(() => {

    if (
      logs.length === 0
    ) {
      return;
    }


    localStorage.setItem(
      logStorageKey,
      JSON.stringify(logs),
    );

  }, [
    logs,
    logStorageKey,
  ]);



  /*
   * Backstage authentication is passed explicitly through
   * the Authorization header.
   *
   * EventSource cannot set custom request headers, so the
   * SSE connections are implemented with fetch() instead.
   */
  useEffect(() => {

    let cancelled = false;

    let controller:
      AbortController | undefined;



    const connectToEvents = async () => {

      try {

        const credentials =
          await identityApi.getCredentials();


        if (cancelled) {
          return;
        }


        controller =
          new AbortController();


        const headers:
          Record<string, string> = {
            Accept:
              'text/event-stream',
          };


        if (
          credentials.token
        ) {

          headers.Authorization =
            `Bearer ${credentials.token}`;

        }


        const response =
          await fetch(
            `${backendUrl}/api/makedoc/events`,
            {
              method: 'GET',
              headers,
              signal:
                controller.signal,
            },
          );


        if (
          !response.ok
        ) {

          throw new Error(
            `Failed to connect to job events: ${response.status} ${response.statusText}`,
          );

        }


        if (
          !response.body
        ) {

          throw new Error(
            'Job events response has no body',
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
            buffer.split(
              '\n\n',
            );


          buffer =
            messages.pop() || '';


          for (
            const message of messages
          ) {

            if (
              cancelled
            ) {
              return;
            }


            const dataLines =
              message
                .split('\n')
                .filter(
                  line =>
                    line.startsWith(
                      'data:',
                    ),
                );


            if (
              dataLines.length === 0
            ) {
              continue;
            }


            const data =
              dataLines
                .map(
                  line =>
                    line
                      .slice(5)
                      .trim(),
                )
                .join('\n');


            if (!data) {
              continue;
            }


            try {

              const parsed =
                JSON.parse(
                  data,
                );


              if (
                parsed.jobName !==
                jobName
              ) {
                continue;
              }


              setStatus(
                parsed.status,
              );

            } catch (
              error
            ) {

              console.error(
                'Failed parsing MakeDoc event:',
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
            'MakeDoc event stream failed:',
            error,
          );

        }

      }

    };


    connectToEvents();


    return () => {

      cancelled = true;


      if (
        controller
      ) {

        controller.abort();

      }

    };

  }, [
    backendUrl,
    identityApi,
    jobName,
  ]);



  useEffect(() => {

    if (
      status !== 'MAKEDOC_RUNNING'
    ) {
      return;
    }


    let cancelled = false;

    let controller:
      AbortController | undefined;



    const connectToLogs = async () => {

      try {

        const credentials =
          await identityApi.getCredentials();


        if (cancelled) {
          return;
        }


        controller =
          new AbortController();


        const headers:
          Record<string, string> = {
            Accept:
              'text/event-stream',
          };


        if (
          credentials.token
        ) {

          headers.Authorization =
            `Bearer ${credentials.token}`;

        }


        const response =
          await fetch(
            `${backendUrl}/api/makedoc/job-logs/${jobName}`,
            {
              method: 'GET',
              headers,
              signal:
                controller.signal,
            },
          );


        if (
          !response.ok
        ) {

          throw new Error(
            `Failed to connect to MakeDoc logs: ${response.status} ${response.statusText}`,
          );

        }


        if (
          !response.body
        ) {

          throw new Error(
            'MakeDoc logs response has no body',
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
            buffer.split(
              '\n\n',
            );


          buffer =
            messages.pop() || '';


          for (
            const message of messages
          ) {

            if (
              cancelled
            ) {
              return;
            }


            const dataLines =
              message
                .split('\n')
                .filter(
                  line =>
                    line.startsWith(
                      'data:',
                    ),
                );


            if (
              dataLines.length === 0
            ) {
              continue;
            }


            const data =
              dataLines
                .map(
                  line =>
                    line
                      .slice(5)
                      .trim(),
                )
                .join('\n');


            if (!data) {
              continue;
            }


            try {

              const parsed =
                JSON.parse(
                  data,
                );


              setLogs(
                previous => [
                  ...previous,
                  parsed,
                ],
              );

            } catch (
              error
            ) {

              console.error(
                'Failed parsing MakeDoc log:',
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
            'MakeDoc log stream failed:',
            error,
          );

        }

      }

    };


    connectToLogs();


    return () => {

      cancelled = true;


      if (
        controller
      ) {

        controller.abort();

      }

    };

  }, [
    backendUrl,
    identityApi,
    jobName,
    status,
  ]);



  useEffect(() => {

    const container =
      logsContainerRef.current;


    if (!container) {
      return;
    }


    container.scrollTop =
      container.scrollHeight;

  }, [
    logs,
  ]);



  const downloadLogs = () => {

    const content =
      logs.join('\n');


    const blob =
      new Blob(
        [content],
        {
          type: 'text/plain',
        },
      );


    const url =
      URL.createObjectURL(
        blob,
      );


    const link =
      document.createElement(
        'a',
      );


    link.href =
      url;


    link.download =
      'makedoc.log';


    document.body.appendChild(
      link,
    );


    link.click();


    document.body.removeChild(
      link,
    );


    URL.revokeObjectURL(
      url,
    );

  };



  const failed =
    status === 'FAILED';



  const finished =
    status === 'COMPLETED' ||
    status === 'FAILED';



  const activeStep =
    failed
      ? -1
      : steps.findIndex(
          step =>
            step.status === status,
        );



  const currentStep =
    steps.find(
      step =>
        step.status === status,
    );



  const running =
    !failed &&
    status !== 'COMPLETED';



  return (

    <Box

      style={{

        display:
          'flex',

        flexDirection:
          'column',

      }}

    >


      <Typography variant="h1">

        MakeDoc execution status

      </Typography>



      <Typography
        variant="body1"
        color="textSecondary"
      >

        Job: {jobName}

      </Typography>





      {
        currentStep && (

          <Box mt={2}>

            <Typography variant="h6">

              {currentStep.label}

            </Typography>


            <Typography color="textSecondary">

              {currentStep.description}

            </Typography>

          </Box>

        )
      }





      <Box mt={3}>

        <Stepper
          activeStep={activeStep}
          alternativeLabel
        >

          {
            steps.map(
              (
                step,
                index,
              ) => (

                <Step
                  key={step.status}
                  completed={
                    !failed &&
                    (
                      index < activeStep ||
                      status === 'COMPLETED'
                    )
                  }
                >

                  <StepLabel

                    StepIconComponent={

                      index === activeStep &&
                      running

                        ? LoadingStepIcon

                        : undefined

                    }

                  >

                    {step.label}

                  </StepLabel>


                </Step>

              ),
            )
          }


        </Stepper>


      </Box>





      <Box mt={2}>

        <Typography variant="h1">

          MakeDoc logs

        </Typography>


        <Box
          ref={logsContainerRef}
          style={{
            maxHeight: 400,
            overflowY: 'auto',
            marginTop: 8,
          }}
        >

          {
            logs.length === 0 ? (

              <Typography
                color="textSecondary"
              >

                Waiting for MakeDoc logs...

              </Typography>


            ) : (

              logs.map(
                (
                  log,
                  index,
                ) => (

                  <div key={index}>

                    {log}

                  </div>

                ),

              )

            )

          }

        </Box>


      </Box>





      {
        finished && (

          <Box mt={3}>

            {
              status === 'COMPLETED' ? (

                <Typography
                  color="primary"
                >

                  Documentation generation completed.

                </Typography>

              ) : (

                <Typography
                  color="error"
                >

                  MakeDoc execution failed.

                </Typography>

              )
            }


            <Box mt={2}>


              <Button
                variant="contained"
                onClick={onNewExecution}
                style={{
                  marginRight: 8,
                }}
              >

                Start new job

              </Button>

              <Button
                variant="contained"
                onClick={downloadLogs}

              >

                Download logs

              </Button>




            </Box>


          </Box>

        )
      }


    </Box>

  );

};