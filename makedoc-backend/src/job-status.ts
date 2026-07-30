import * as k8s from '@kubernetes/client-node';

import {
  getCoreApi,
  KUBE_NAMESPACE,
} from './kubernetes';

import {
  JobStatus,
  JobStatusResponse,
} from './types';

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


  if (
    gitClone?.state?.terminated &&
    gitClone.state.terminated.exitCode !== 0
  ) {
    return 'FAILED';
  }

  if (
    gitClone?.state?.running
  ) {
    return 'CLONING_REPOSITORY';
  }

  const gitCloneFinished =
    gitClone?.state?.terminated?.exitCode === 0;

  if (
    gitCloneFinished &&
    !makedoc?.state?.running &&
    !makedoc?.state?.terminated
  ) {
    return 'CLONING_REPOSITORY';
  }

  if (
    makedoc?.state?.running
  ) {
    return 'MAKEDOC_RUNNING';
  }

  if (
    makedoc?.state?.terminated &&
    makedoc.state.terminated.exitCode !== 0
  ) {
    return 'FAILED';
  }

  if (
    finalizer?.state?.running
  ) {
    return 'COMMITTING_DOCUMENTATION';
  }

  if (
    finalizer?.state?.terminated &&
    finalizer.state.terminated.exitCode === 0
  ) {
    return 'COMPLETED';
  }

  if (
    pod.status?.phase === 'Failed'
  ) {
    return 'FAILED';
  }

  return 'STARTED';
}


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