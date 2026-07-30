import React, {
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



export type JobStatus =
  | 'STARTED'
  | 'CLONING_REPOSITORY'
  | 'MAKEDOC_RUNNING'
  | 'COMMITTING_DOCUMENTATION'
  | 'COMPLETED'
  | 'FAILED';



interface JobStatusProps {

  jobName: string;

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
    size={32}
  />
);



export const JobStatusComponent = ({
  jobName,
  onNewExecution,
}: JobStatusProps) => {


  const backendUrl =
    'http://localhost:7007';



  const [status, setStatus] =
    useState<JobStatus>('STARTED');



  const [logs, setLogs] =
    useState<string[]>([]);



  const logsContainerRef =
    useRef<HTMLDivElement>(null);



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




  useEffect(() => {

    const events =
      new EventSource(
        `${backendUrl}/api/makedoc/events`,
      );


    events.onmessage =
      event => {

        const data =
          JSON.parse(
            event.data,
          );


        if (
          data.jobName !== jobName
        ) {
          return;
        }


        setStatus(
          data.status,
        );

      };


    return () => {

      events.close();

    };


  }, [
    jobName,
  ]);




  useEffect(() => {

    if (
      status !== 'MAKEDOC_RUNNING'
    ) {
      return;
    }


    const stream =
      new EventSource(
        `${backendUrl}/api/makedoc/job-logs/${jobName}`,
      );


    stream.addEventListener(
      'log',
      event => {

        const message =
          JSON.parse(
            event.data,
          );


        setLogs(
          previous => [
            ...previous,
            message,
          ],
        );

      },
    );


    return () => {

      stream.close();

    };


  }, [
    status,
    jobName,
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

    const failed =
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

          mt={1}

          style={{

            height:
              800,

            overflowY:
              'auto',

            border:
              '1px solid #ddd',

            borderRadius:
              4,

            padding:
              12,

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
        status === 'COMPLETED' && (

          <Box mt={3}>

            <Typography
              color="primary"
            >

              Documentation generation completed.

            </Typography>


            <Button
              variant="contained"
              onClick={onNewExecution}
            >

              Start new job

            </Button>


          </Box>

        )
      }






      {
        failed && (

          <Box mt={3}>

            <Typography
              color="error"
            >

              MakeDoc execution failed.

            </Typography>


            <Button
              variant="contained"
              onClick={onNewExecution}
            >

              Start new job

            </Button>


          </Box>

        )
      }


    </Box>

  );

};