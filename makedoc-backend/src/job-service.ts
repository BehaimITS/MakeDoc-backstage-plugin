import * as k8s from '@kubernetes/client-node';
import crypto from 'crypto';

import {
  getBatchApi,
  getCoreApi,
  KUBE_NAMESPACE,
} from './kubernetes';

import {
  getJobTemplate,
} from './templates/job-template';

import {
  validateRequest,
} from './validation';

import {
  publishJobEvent,
} from './job-events';

import {
  getActiveJob,
} from './job-status';



function generateJobName(): string {
  const id =
    crypto
      .randomBytes(6)
      .toString('hex');

  return `makedoc-job-${id}`;
}



function buildContainerEnv(
  selections: any,
  workspace?: string,
  profile?: string,
  filter?: string,
): k8s.V1EnvVar[] {

  const env: k8s.V1EnvVar[] = [];


  if (workspace) {

    env.push({

      name:
        'workspace',

      value:
        workspace,

    });

  }


  if (profile) {

    env.push({

      name:
        'profile',

      value:
        profile,

    });

  }


  if (filter) {

    env.push({

      name:
        'filter',

      value:
        filter,

    });

  }



  if (!selections) {
    return env;
  }



  (
    [
      'bw5',
      'bw6',
      'ems',
    ] as const
  ).forEach(productKey => {

    const productFormats =
      selections[productKey];


    if (!productFormats) {
      return;
    }


    const activeFormats =
      Object.keys(productFormats)
        .filter(
          format =>
            productFormats[format],
        );


    if (activeFormats.length > 0) {

      env.push({

        name:
          productKey,

        value:
          activeFormats.join(';'),

      });

    }

  });



  return env;

}



export async function runJob(
  body: any,
) {

  validateRequest(
    body,
  );


  const activeJob =
    await getActiveJob();



  if (
    activeJob.active &&
    activeJob.jobName
  ) {

    throw new Error(
      `A MakeDoc job is already running: ${activeJob.jobName}`,
    );

  }



  const {
    repoUrl,
    accessToken,
    inputDir,
    outputDir,
    workspace,
    profile,
    filter,
    selections,
  } = body;



  const jobName =
    generateJobName();



  const secretName =
    `${jobName}-git-token`;



  const cleanRepoUrl =
    repoUrl.replace(
      /^https?:\/\//,
      '',
    );



  const containerEnv =
    buildContainerEnv(
      selections,
      workspace,
      profile,
      filter,
    );



  const jobManifest =
    getJobTemplate(
      jobName,
      KUBE_NAMESPACE,
      cleanRepoUrl,
      inputDir,
      outputDir,
      secretName,
    );



  const makedocContainer =
    jobManifest
      .spec
      ?.template
      ?.spec
      ?.containers
      ?.find(
        container =>
          container.name ===
          'step2-makedoc-engine',
      );



  if (!makedocContainer) {

    throw new Error(
      'Generated Kubernetes Job is missing MakeDoc container',
    );

  }



  makedocContainer.env =
    containerEnv;



  const coreApi =
    getCoreApi();


  const batchApi =
    getBatchApi();



  let secretCreated =
    false;


  let jobCreated =
    false;



  try {

    await coreApi.createNamespacedSecret({

      namespace:
        KUBE_NAMESPACE,

      body: {

        metadata: {
          name:
            secretName,
        },

        type:
          'Opaque',

        stringData: {

          GIT_TOKEN:
            accessToken,

        },

      },

    });


    secretCreated = true;



    const response =
      await batchApi.createNamespacedJob({

        namespace:
          KUBE_NAMESPACE,

        body:
          jobManifest,

      });



    const createdJob =
      (response as any)?.body ??
      (response as any);



    if (!createdJob?.metadata) {

      throw new Error(
        'Kubernetes created the Job but returned invalid metadata',
      );

    }



    const createdJobName =
      createdJob.metadata.name;


    const createdJobUid =
      createdJob.metadata.uid;



    if (
      !createdJobName ||
      !createdJobUid
    ) {

      throw new Error(
        'Kubernetes created the Job but returned no name or uid',
      );

    }



    jobCreated = true;



    publishJobEvent({

      jobName:
        createdJobName,

      status:
        'STARTED',

    });



    await coreApi.patchNamespacedSecret({

      name:
        secretName,

      namespace:
        KUBE_NAMESPACE,

      body: [

        {

          op:
            'add',

          path:
            '/metadata/ownerReferences',

          value: [

            {

              apiVersion:
                'batch/v1',

              kind:
                'Job',

              name:
                createdJobName,

              uid:
                createdJobUid,

              controller:
                true,

              blockOwnerDeletion:
                true,

            },

          ],

        },

      ],

    });



    return {

      jobName:
        createdJobName,

    };


  } catch (error) {


    if (
      secretCreated &&
      !jobCreated
    ) {

      try {

        await coreApi.deleteNamespacedSecret({

          name:
            secretName,

          namespace:
            KUBE_NAMESPACE,

        });


      } catch {
        // ignore cleanup errors
      }

    }


    throw error;

  }

}