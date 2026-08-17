// displays the status and live logs of a MakeDoc Kubernetes Job
// the component subscribes to two backend Server-Sent Event streams:
// one for job status updates and one for collected Kubernetes logs
// logs are provided by the backend so they remain available after a browser refresh
// completed or failed executions allow the user to start a new execution

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
  IconButton,
  Tooltip,
} from '@material-ui/core';

import GetAppIcon from '@material-ui/icons/GetApp';

import {
  useApi,
  identityApiRef,
  configApiRef,
} from '@backstage/core-plugin-api';


// represents the execution states reported by the MakeDoc backend
export type JobStatus =
  | 'STARTED'
  | 'CLONING_REPOSITORY'
  | 'MAKEDOC_RUNNING'
  | 'COMMITTING_DOCUMENTATION'
  | 'COMPLETED'
  | 'FAILED';


// properties supplied by the parent component
export interface JobStatusProps {
  jobName: string;
  status: JobStatus;
  onNewExecution: () => void;
}


// defines the visible execution steps and their descriptions
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


// replaces the active step icon with a loading indicator while execution is running
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
    useApi(
      configApiRef,
    );

  const identityApi =
    useApi(
      identityApiRef,
    );

  const backendUrl =
    config.getString(
      'backend.baseUrl',
    );


  // stores the current execution status received from the backend
  const [status, setStatus] =
    useState<JobStatus>(
      'STARTED',
    );


  // stores all log entries received from the backend
  const [logs, setLogs] =
    useState<string[]>([]);


  // references the native scroll container used for automatic log scrolling
  const logsContainerRef =
    useRef<HTMLDivElement | null>(
      null,
    );


  // subscribes to the backend job-status SSE stream
  // only events belonging to the current Job are applied to the component
  useEffect(() => {
    let cancelled =
      false;

    let controller:
      AbortController | undefined;


    const connectToEvents =
      async () => {

        try {

          const credentials =
            await identityApi.getCredentials();


          if (
            cancelled
          ) {
            return;
          }


          controller =
            new AbortController();


          const headers:
            Record<string, string> = {
            Accept:
              'text/event-stream',
          };


          // forwards the Backstage identity token to the backend
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
                method:
                  'GET',

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

          let buffer =
            '';


          // continuously reads and parses incoming SSE messages
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


            // SSE messages are separated by a blank line
            const messages =
              buffer.split(
                '\n\n',
              );


            // keeps an incomplete message for the next network chunk
            buffer =
              messages.pop() || '';


            for (
              const message
              of messages
            ) {

              if (
                cancelled
              ) {
                return;
              }


              // extracts only SSE data lines
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


              if (
                !data
              ) {
                continue;
              }


              try {

                const parsed =
                  JSON.parse(
                    data,
                  );


                // ignores status events belonging to another MakeDoc Job
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


    // closes the SSE connection when the component is unmounted or the Job changes
    return () => {

      cancelled =
        true;


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


  // subscribes to the backend-owned log SSE stream
  // the backend first replays previously collected logs and then sends new entries
  // this allows the complete log to be reconstructed after a browser refresh
  useEffect(() => {
    let cancelled =
      false;

    let controller:
      AbortController | undefined;


    const connectToLogs =
      async () => {

        try {

          const credentials =
            await identityApi.getCredentials();


          if (
            cancelled
          ) {
            return;
          }


          controller =
            new AbortController();


          const headers:
            Record<string, string> = {
            Accept:
              'text/event-stream',
          };


          // forwards the Backstage identity token to the backend
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
                method:
                  'GET',

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

          let buffer =
            '';


          // continuously reads and parses incoming log events
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


            // SSE messages are separated by a blank line
            const messages =
              buffer.split(
                '\n\n',
              );


            // keeps an incomplete message for the next network chunk
            buffer =
              messages.pop() || '';


            for (
              const message
              of messages
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


              if (
                !data
              ) {
                continue;
              }


              try {

                const parsed =
                  JSON.parse(
                    data,
                  );


                // historical and newly generated log entries are appended in arrival order
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


    // closes the log stream when the component is unmounted or the Job changes
    return () => {

      cancelled =
        true;


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


  // keeps the log view pinned to the newest entry as logs arrive
  useEffect(() => {

    const container =
      logsContainerRef.current;


    if (
      !container
    ) {
      return;
    }


    container.scrollTop =
      container.scrollHeight;

  }, [
    logs,
  ]);


  // creates a local text file containing the currently displayed logs
  const downloadLogs =
    () => {

      const content =
        logs.join('\n');


      const blob =
        new Blob(
          [content],
          {
            type:
              'text/plain',
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


  // determines whether the execution ended unsuccessfully
  const failed =
    status === 'FAILED';


  // determines whether the execution has reached a terminal state
  const finished =
    status === 'COMPLETED' ||
    status === 'FAILED';


  // determines which step should currently be highlighted
  const activeStep =
    failed
      ? -1
      : steps.findIndex(
          step =>
            step.status === status,
        );


  // finds the description for the current execution state
  const currentStep =
    steps.find(
      step =>
        step.status === status,
    );


  // the loading indicator is shown for all non-terminal successful states
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
          style={{
            backgroundColor:
              'transparent',
          }}
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


      <Box mt={3}>

        <Box
          style={{
            display:
              'flex',

            alignItems:
              'center',
          }}
        >

          <Typography variant="h1">
            MakeDoc logs
          </Typography>


          <Tooltip title="Download logs">

            <IconButton
              onClick={downloadLogs}
              size="small"
              aria-label="Download logs"
              style={{
                marginLeft: 8,
                padding: 4,
              }}
            >

              <GetAppIcon />

            </IconButton>

          </Tooltip>

        </Box>


        <Box
          mt={2}
          style={{
            height: 700,
            border:
              '1px solid rgba(128, 128, 128, 0.4)',
            borderRadius: 8,
            padding: 5,
            boxSizing: 'border-box',
            overflow: 'hidden',
          }}
        >

          {}
          <div
            ref={logsContainerRef}
            style={{
              height: '100%',
              overflowY: 'auto',
              boxSizing: 'border-box',
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

          </div>

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
              >
                Start new job
              </Button>

            </Box>

          </Box>

        )
      }

    </Box>
  );
};