// reads the current state of MakeDoc Kubernetes Jobs and converts it into application job statuses
// job status is determined from the states of the repository clone, MakeDoc, and finalizer containers
// the file also provides a way to find the currently running MakeDoc Job

import * as k8s from '@kubernetes/client-node';

import {
  getCoreApi,
  KUBE_NAMESPACE,
} from './kubernetes';

import {
  JobStatus,
  JobStatusResponse,
} from './types';

// determines the current MakeDoc status from the Kubernetes Pod state
function calculateJobStatus(
  pod: k8s.V1Pod,
): JobStatus {

  const initContainers =
    pod.status?.initContainerStatuses ?? [];

  const containers =
    pod.status?.containerStatuses ?? [];

  const gitClone =
    initContainers.find(
      container =>
        container.name === 'step1-git-clone',
    );

  const makedoc =
    containers.find(
      container =>
        container.name === 'step2-makedoc-engine',
    );

  const finalizer =
    containers.find(
      container =>
        container.name === 'step3-git-push-finalizer',
    );

  // marks the job as failed when repository cloning exits with an error
  if (
    gitClone?.state?.terminated &&
    gitClone.state.terminated.exitCode !== 0
  ) {

    return 'FAILED';

  }

  // reports that the repository is currently being cloned
  if (
    gitClone?.state?.running
  ) {

    return 'CLONING_REPOSITORY';

  }

  const gitCloneFinished =
    gitClone?.state?.terminated?.exitCode === 0;

  // keeps the job in the cloning state while the next container has not started yet
  if (
    gitCloneFinished &&
    !makedoc?.state?.running &&
    !makedoc?.state?.terminated
  ) {

    return 'CLONING_REPOSITORY';

  }

  // reports that the MakeDoc engine is currently running
  if (
    makedoc?.state?.running
  ) {

    return 'MAKEDOC_RUNNING';

  }

  // marks the job as failed when the MakeDoc engine exits with an error
  if (
    makedoc?.state?.terminated &&
    makedoc.state.terminated.exitCode !== 0
  ) {

    return 'FAILED';

  }

  // reports that the finalizer is currently committing the generated documentation
  if (
    finalizer?.state?.running
  ) {

    return 'COMMITTING_DOCUMENTATION';

  }

  // reports that the job completed successfully when the finalizer exits successfully
  if (
    finalizer?.state?.terminated &&
    finalizer.state.terminated.exitCode === 0
  ) {

    return 'COMPLETED';

  }

  // marks the job as failed when Kubernetes reports a failed Pod
  if (
    pod.status?.phase === 'Failed'
  ) {

    return 'FAILED';

  }

  return 'STARTED';
}

// retrieves the current status and Pod name for a specific MakeDoc Job
export async function getJobStatus(
  jobName: string,
): Promise<JobStatusResponse> {

  const coreApi =
    getCoreApi();

  const pods =
    await coreApi.listNamespacedPod({

      namespace:
        KUBE_NAMESPACE,

      labelSelector:
        `job-name=${jobName}`,

    });

  // returns the initial job state while Kubernetes has not created a Pod yet
  if (
    pods.items.length === 0
  ) {

    return {

      status:
        'STARTED',

    };

  }

  const pod =
    pods.items[0];

  return {

    status:
      calculateJobStatus(pod),

    podName:
      pod.metadata?.name,

  };

}

// finds the currently active MakeDoc Job
export async function getActiveJob() {

  const coreApi =
    getCoreApi();

  const pods =
    await coreApi.listNamespacedPod({

      namespace:
        KUBE_NAMESPACE,

      labelSelector:
        'job-name',

    });

  const pod =
    pods.items.find(
      item =>
        item.metadata?.labels?.['job-name']
          ?.startsWith('makedoc-job-'),
    );

  // returns an inactive state when no MakeDoc Pod exists
  if (!pod) {

    return {

      active:
        false,

    };

  }

  const jobName =
    pod.metadata
      ?.labels
      ?.['job-name'];

  // returns an inactive state when the Pod does not contain a valid Job name
  if (!jobName) {

    return {

      active:
        false,

    };

  }

  const status =
    calculateJobStatus(
      pod,
    );

  return {

    active:
      status !== 'COMPLETED' &&
      status !== 'FAILED',

    jobName,

    status,

  };

}