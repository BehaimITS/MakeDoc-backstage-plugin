// // creates and starts a MakeDoc Kubernetes Job from the validated request
// // the job receives the selected MakeDoc options, repository credentials, and workspace configuration
// // the file also initializes job log collection and reports the job start status
// // the repository token is stored in a Kubernetes Secret that is owned by the created Job

// import * as k8s from '@kubernetes/client-node';
// import crypto from 'crypto';

// import {
//   getBatchApi,
//   getCoreApi,
//   KUBE_NAMESPACE,
// } from './kubernetes';

// import {
//   getJobTemplate,
// } from './templates/job-template';

// import {
//   validateRequest,
// } from './validation';

// import {
//   publishJobEvent,
// } from './job-events';

// import {
//   getActiveJob,
// } from './job-status';

// import {
//   initializeJobLogs,
//   startMakeDocLogCollection,
// } from './job-logs';

// // generates a unique name for a new MakeDoc Job
// function generateJobName(): string {

//   const id =
//     crypto
//       .randomBytes(6)
//       .toString('hex');

//   return `makedoc-job-${id}`;

// }

// // converts the selected MakeDoc options into container environment variables
// function buildContainerEnv(
//   selections: any,
//   workspace?: string,
//   profile?: string,
//   filter?: string,
// ): k8s.V1EnvVar[] {

//   const env:
//     k8s.V1EnvVar[] = [];

//   // provides the MakeDoc container with the path of the selected workspace
//   if (
//     workspace
//   ) {

//     env.push({

//       name:
//         'workspace',

//       value:
//         `/home/makedoc/server/scripts/srv/${workspace}`,

//     });

//   }

//   if (
//     profile
//   ) {

//     env.push({

//       name:
//         'profile',

//       value:
//         profile,

//     });

//   }

//   if (
//     filter
//   ) {

//     env.push({

//       name:
//         'filter',

//       value:
//         filter,

//     });

//   }

//   if (
//     !selections
//   ) {

//     return env;

//   }

//   // adds the selected product formats to the container environment
//   (
//     [
//       'bw5',
//       'bw6',
//       'ems',
//     ] as const
//   ).forEach(
//     productKey => {

//       const productFormats =
//         selections[productKey];

//       if (
//         !productFormats
//       ) {

//         return;

//       }

//       const activeFormats =
//         Object.keys(
//           productFormats,
//         )
//           .filter(
//             format =>
//               productFormats[format],
//           );

//       if (
//         activeFormats.length > 0
//       ) {

//         env.push({

//           name:
//             productKey,

//           value:
//             activeFormats.join(';'),

//         });

//       }

//     },
//   );

//   return env;

// }

// // validates the request and creates the requested MakeDoc Job
// export async function runJob(
//   body: any,
// ) {

//   validateRequest(
//     body,
//   );

//   const activeJob =
//     await getActiveJob();

//   // prevents a second MakeDoc Job from starting while another one is active
//   if (
//     activeJob.active &&
//     activeJob.jobName
//   ) {

//     throw new Error(
//       `A MakeDoc job is already running: ${activeJob.jobName}`,
//     );

//   }

//   const {
//     repoUrl,
//     accessToken,
//     inputDir,
//     outputDir,
//     workspace,
//     profile,
//     filter,
//     selections,
//   } = body;

//   const jobName =
//     generateJobName();

//   const secretName =
//     `${jobName}-git-token`;

//   // removes the protocol from the repository URL before passing it to the Job
//   const cleanRepoUrl =
//     repoUrl.replace(
//       /^https?:\/\//,
//       '',
//     );

//   const containerEnv =
//     buildContainerEnv(
//       selections,
//       workspace,
//       profile,
//       filter,
//     );

//   // passes the repository workspace to the Job template for volume configuration
//   const jobManifest =
//     getJobTemplate(
//       jobName,
//       KUBE_NAMESPACE,
//       cleanRepoUrl,
//       inputDir,
//       outputDir,
//       secretName,
//       workspace,
//     );

//   const makedocContainer =
//     jobManifest
//       .spec
//       ?.template
//       ?.spec
//       ?.containers
//       ?.find(
//         container =>
//           container.name ===
//           'step2-makedoc-engine',
//       );

//   if (
//     !makedocContainer
//   ) {

//     throw new Error(
//       'Generated Kubernetes Job is missing MakeDoc container',
//     );

//   }

//   // applies the request-specific environment variables to the MakeDoc container
//   makedocContainer.env =
//     containerEnv;

//   const coreApi =
//     getCoreApi();

//   const batchApi =
//     getBatchApi();

//   let secretCreated =
//     false;

//   let jobCreated =
//     false;

//   try {

//     // creates the temporary Secret containing the repository access token
//     await coreApi.createNamespacedSecret({

//       namespace:
//         KUBE_NAMESPACE,

//       body: {

//         metadata: {
//           name:
//             secretName,
//         },

//         type:
//           'Opaque',

//         stringData: {

//           GIT_TOKEN:
//             accessToken,

//         },

//       },

//     });

//     secretCreated =
//       true;

//     // creates the Kubernetes Job using the generated manifest
//     const response =
//       await batchApi.createNamespacedJob({

//         namespace:
//           KUBE_NAMESPACE,

//         body:
//           jobManifest,

//       });

//     const createdJob =
//       (response as any)?.body ??
//       (response as any);

//     if (
//       !createdJob?.metadata
//     ) {

//       throw new Error(
//         'Kubernetes created the Job but returned invalid metadata',
//       );

//     }

//     const createdJobName =
//       createdJob.metadata.name;

//     const createdJobUid =
//       createdJob.metadata.uid;

//     if (
//       !createdJobName ||
//       !createdJobUid
//     ) {

//       throw new Error(
//         'Kubernetes created the Job but returned no name or uid',
//       );

//     }

//     jobCreated =
//       true;

//     // clears previous logs
//     initializeJobLogs(
//       createdJobName,
//     );

//     publishJobEvent({

//       jobName:
//         createdJobName,

//       status:
//         'STARTED',

//     });

//     // starts log collection independently of the frontend connection
//     startMakeDocLogCollection(
//       createdJobName,
//     );

//     // makes the Secret owned by the Job so Kubernetes can clean it up with the Job
//     await coreApi.patchNamespacedSecret({

//       name:
//         secretName,

//       namespace:
//         KUBE_NAMESPACE,

//       body: [

//         {

//           op:
//             'add',

//           path:
//             '/metadata/ownerReferences',

//           value: [

//             {

//               apiVersion:
//                 'batch/v1',

//               kind:
//                 'Job',

//               name:
//                 createdJobName,

//               uid:
//                 createdJobUid,

//               controller:
//                 true,

//               blockOwnerDeletion:
//                 true,

//             },

//           ],

//         },

//       ],

//     });

//     return {

//       jobName:
//         createdJobName,

//     };

//   } catch (
//     error
//   ) {

//     // removes the Secret if Job creation failed after the Secret was created
//     if (
//       secretCreated &&
//       !jobCreated
//     ) {

//       try {

//         await coreApi.deleteNamespacedSecret({

//           name:
//             secretName,

//           namespace:
//             KUBE_NAMESPACE,

//         });

//       } catch {
//         // ignores cleanup errors
//       }

//     }

//     throw error;

//   }

// }




// import * as k8s from '@kubernetes/client-node';

// import crypto from 'crypto';

// import {
//   getBatchApi,
//   getCoreApi,
//   KUBE_NAMESPACE,
// } from './kubernetes';

// import {
//   getJobTemplate,
// } from './templates/job-template';

// import {
//   validateRequest,
// } from './validation';

// import {
//   publishJobEvent,
// } from './job-events';

// import {
//   getActiveJob,
// } from './job-status';

// import {
//   initializeJobLogs,
//   startMakeDocLogCollection,
// } from './job-logs';

// // creates a unique name for each MakeDoc Kubernetes Job
// function generateJobName(): string {

//   const id =
//     crypto
//       .randomBytes(6)
//       .toString('hex');

//   return `makedoc-job-${id}`;
// }

// // converts the requested MakeDoc options into Kubernetes environment variables
// function buildContainerEnv(
//   selections: any,
//   workspace?: string,
//   profile?: string,
//   filter?: string,
// ): k8s.V1EnvVar[] {

//   const env:
//     k8s.V1EnvVar[] = [];

//   if (workspace) {

//     env.push({
//       name:
//         'workspace',
//       value:
//         `/home/makedoc/server/scripts/srv/${workspace}`,
//     });

//   }

//   if (profile) {

//     env.push({
//       name:
//         'profile',
//       value:
//         profile,
//     });

//   }

//   if (filter) {

//     env.push({
//       name:
//         'filter',
//       value:
//         filter,
//     });

//   }

//   if (!selections) {

//     return env;

//   }

//   (
//     [
//       'bw5',
//       'bw6',
//       'ems',
//     ] as const
//   ).forEach(
//     productKey => {

//       const productFormats =
//         selections[productKey];

//       if (!productFormats) {

//         return;

//       }

//       const activeFormats =
//         Object.keys(
//           productFormats,
//         )
//           .filter(
//             format =>
//               productFormats[format],
//           );

//       if (
//         activeFormats.length > 0
//       ) {

//         env.push({
//           name:
//             productKey,
//           value:
//             activeFormats.join(';'),
//         });

//       }

//     },
//   );

//   return env;
// }

// // validates the request, creates the Kubernetes resources and starts the MakeDoc execution
// export async function runJob(
//   body: any,
// ) {

//   validateRequest(
//     body,
//   );

//   const activeJob =
//     await getActiveJob();

//   if (
//     activeJob.active &&
//     activeJob.jobName
//   ) {

//     throw new Error(
//       `A MakeDoc job is already running: ${activeJob.jobName}`,
//     );

//   }

//   const {
//     repoUrl,
//     accessToken,
//     inputDir,
//     outputDir,
//     workspace,
//     profile,
//     filter,
//     selections,
//   } = body;

//   const jobName =
//     generateJobName();

//   const secretName =
//     `${jobName}-git-token`;

//   const cleanRepoUrl =
//     repoUrl.replace(
//       /^https?:\/\//,
//       '',
//     );

//   const containerEnv =
//     buildContainerEnv(
//       selections,
//       workspace,
//       profile,
//       filter,
//     );

//   const jobManifest =
//     getJobTemplate(
//       jobName,
//       KUBE_NAMESPACE,
//       cleanRepoUrl,
//       inputDir,
//       outputDir,
//       secretName,
//       workspace,
//       containerEnv,
//     );

//   const coreApi =
//     getCoreApi();

//   const batchApi =
//     getBatchApi();

//   let secretCreated =
//     false;

//   let jobCreated =
//     false;

//   try {

//     await coreApi.createNamespacedSecret({

//       namespace:
//         KUBE_NAMESPACE,

//       body: {

//         metadata: {
//           name:
//             secretName,
//         },

//         type:
//           'Opaque',

//         stringData: {

//           GIT_TOKEN:
//             accessToken,

//         },

//       },

//     });

//     secretCreated =
//       true;

//     const response =
//       await batchApi.createNamespacedJob({

//         namespace:
//           KUBE_NAMESPACE,

//         body:
//           jobManifest,

//       });

//     const createdJob =
//       (response as any)?.body ??
//       (response as any);

//     if (
//       !createdJob?.metadata
//     ) {

//       throw new Error(
//         'Kubernetes created the Job but returned invalid metadata',
//       );

//     }

//     const createdJobName =
//       createdJob.metadata.name;

//     const createdJobUid =
//       createdJob.metadata.uid;

//     if (
//       !createdJobName ||
//       !createdJobUid
//     ) {

//       throw new Error(
//         'Kubernetes created the Job but returned no name or uid',
//       );

//     }

//     jobCreated =
//       true;

//     // starts a new log collection for this MakeDoc execution
//     initializeJobLogs(
//       createdJobName,
//     );

//     publishJobEvent({

//       jobName:
//         createdJobName,

//       status:
//         'STARTED',

//     });

//     // starts collecting logs independently of the frontend
//     startMakeDocLogCollection(
//       createdJobName,
//     );

//     await coreApi.patchNamespacedSecret({

//       name:
//         secretName,

//       namespace:
//         KUBE_NAMESPACE,

//       body: [

//         {

//           op:
//             'add',

//           path:
//             '/metadata/ownerReferences',

//           value: [

//             {

//               apiVersion:
//                 'batch/v1',

//               kind:
//                 'Job',

//               name:
//                 createdJobName,

//               uid:
//                 createdJobUid,

//               controller:
//                 true,

//               blockOwnerDeletion:
//                 true,

//             },

//           ],

//         },

//       ],

//     });

//     return {

//       jobName:
//         createdJobName,

//     };

//   } catch (
//     error
//   ) {

//     if (
//       secretCreated &&
//       !jobCreated
//     ) {

//       try {

//         await coreApi.deleteNamespacedSecret({

//           name:
//             secretName,

//           namespace:
//             KUBE_NAMESPACE,

//         });

//       } catch {

//         // ignores cleanup errors when the Job could not be created

//       }

//     }

//     throw error;

//   }

// }








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

import {
  initializeJobLogs,
  startMakeDocLogCollection,
} from './job-logs';

// creates a unique name for each MakeDoc Kubernetes Job
function generateJobName(): string {

  const id =
    crypto
      .randomBytes(6)
      .toString('hex');

  return `makedoc-job-${id}`;
}

// converts the requested MakeDoc options into Kubernetes environment variables
function buildContainerEnv(
  selections: any,
  workspace?: string,
  profile?: string,
  filter?: string,
): k8s.V1EnvVar[] {

  const env:
    k8s.V1EnvVar[] = [];

  if (workspace) {

    env.push({
      name:
        'workspace',
      value:
        `/home/makedoc/server/scripts/srv/${workspace}`,
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
  ).forEach(
    productKey => {

      const productFormats =
        selections[productKey];

      if (!productFormats) {

        return;

      }

      const activeFormats =
        Object.keys(
          productFormats,
        )
          .filter(
            format =>
              productFormats[format],
          );

      if (
        activeFormats.length > 0
      ) {

        env.push({
          name:
            productKey,
          value:
            activeFormats.join(';'),
        });

      }

    },
  );

  return env;
}

// prevents a new MakeDoc Job from starting while another Job is active
async function ensureNoActiveJob(): Promise<void> {

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

}

// creates the Kubernetes Secret containing the repository access token
async function createGitSecret(
  secretName: string,
  accessToken: string,
): Promise<void> {

  const coreApi =
    getCoreApi();

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

}

// creates the Kubernetes Job and returns its name and UID
async function createKubernetesJob(
  jobManifest: k8s.V1Job,
): Promise<{
  jobName: string;
  jobUid: string;
}> {

  const batchApi =
    getBatchApi();

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

  if (
    !createdJob?.metadata
  ) {

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

  return {
    jobName:
      createdJobName,
    jobUid:
      createdJobUid,
  };

}

// initializes logs and status reporting for a newly created Job
function initializeJobExecution(
  jobName: string,
): void {

  initializeJobLogs(
    jobName,
  );

  publishJobEvent({

    jobName,

    status:
      'STARTED',

  });

  startMakeDocLogCollection(
    jobName,
  );

}

// makes the repository Secret owned by the created Job
async function attachSecretToJob(
  secretName: string,
  jobName: string,
  jobUid: string,
): Promise<void> {

  const coreApi =
    getCoreApi();

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
              jobName,

            uid:
              jobUid,

            controller:
              true,

            blockOwnerDeletion:
              true,

          },

        ],

      },

    ],

  });

}

// removes the repository Secret when Job creation fails
async function cleanupFailedJobCreation(
  secretName: string,
  secretCreated: boolean,
  jobCreated: boolean,
): Promise<void> {

  if (
    !secretCreated ||
    jobCreated
  ) {

    return;

  }

  try {

    const coreApi =
      getCoreApi();

    await coreApi.deleteNamespacedSecret({

      name:
        secretName,

      namespace:
        KUBE_NAMESPACE,

    });

  } catch {

    // ignores cleanup errors when the Job could not be created

  }

}

// validates the request, creates the Kubernetes resources and starts the MakeDoc execution
export async function runJob(
  body: any,
) {

  validateRequest(
    body,
  );

  await ensureNoActiveJob();

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
      workspace,
      containerEnv,
    );

  let secretCreated =
    false;

  let jobCreated =
    false;

  try {

    await createGitSecret(
      secretName,
      accessToken,
    );

    secretCreated =
      true;

    const {
      jobName:
        createdJobName,
      jobUid:
        createdJobUid,
    } =
      await createKubernetesJob(
        jobManifest,
      );

    jobCreated =
      true;

    initializeJobExecution(
      createdJobName,
    );

    await attachSecretToJob(
      secretName,
      createdJobName,
      createdJobUid,
    );

    return {

      jobName:
        createdJobName,

    };

  } catch (
    error
  ) {

    await cleanupFailedJobCreation(
      secretName,
      secretCreated,
      jobCreated,
    );

    throw error;

  }

}