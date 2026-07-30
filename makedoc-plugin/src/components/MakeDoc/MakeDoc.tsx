import React, {
  useEffect,
  useState,
} from 'react';


import {
  Header,
  Page,
  Content,
  ContentHeader,
  HeaderLabel,
  SupportButton,
} from '@backstage/core-components';


import {
  useApi,
  configApiRef,
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



export const MakeDocComponent = () => {


  const config =
    useApi(configApiRef);



  const [activeJob, setActiveJob] =
    useState<string | null>(null);



  const [jobStatus, setJobStatus] =
    useState<JobStatus>(
      'STARTED',
    );



  const [loading, setLoading] =
    useState(true);




  useEffect(() => {


    const backendUrl =
      config.getString(
        'backend.baseUrl',
      );



    async function loadActiveJob() {

      try {

        const response =
          await fetch(
            `${backendUrl}/api/makedoc/active-job`,
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




    const eventSource =
      new EventSource(
        `${backendUrl}/api/makedoc/events`,
      );



    eventSource.onmessage =
      event => {

        try {


          const data =
            JSON.parse(
              event.data,
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

      };



    eventSource.onerror =
      error => {

        console.error(
          'MakeDoc SSE error',
          error,
        );

      };



    return () => {

      eventSource.close();

    };


  }, [config]);





  return (

    <Page themeId="tool">



      <Content>


        <Header title="MakeDoc"
                subtitle="MakeDoc® provides automatic code review and analysis of TIBCO projects.">


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