import * as k8s from '@kubernetes/client-node';

// disables TLS certificate verification for the Kubernetes API connection
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// defines the Kubernetes namespace used by the backend
export const KUBE_NAMESPACE = 'default';

// caches the Kubernetes configuration after the first load
let kubeConfig: k8s.KubeConfig | undefined;

// caches the Kubernetes Core API client after the first creation
let coreApiClient: k8s.CoreV1Api | undefined;

// caches the Kubernetes Batch API client after the first creation
let batchApiClient: k8s.BatchV1Api | undefined;

// loads and returns the Kubernetes configuration
export function getKubeConfig(): k8s.KubeConfig {

  if (kubeConfig) {

    return kubeConfig;

  }

  if (!process.env.MAKEDOC_KUBECONFIG) {

    throw new Error(
      'MAKEDOC_KUBECONFIG is not configured',
    );

  }

  console.log(
    'Loading kubeconfig:',
    process.env.MAKEDOC_KUBECONFIG,
  );

  const kc =
    new k8s.KubeConfig();

  kc.loadFromFile(
    process.env.MAKEDOC_KUBECONFIG,
  );

  console.log(
    'Current context:',
    kc.getCurrentContext(),
  );

  console.log(
    'Current user:',
    kc.getCurrentUser(),
  );

  kubeConfig =
    kc;

  return kc;

}

// creates and returns the Kubernetes Core API client
export function getCoreApi(): k8s.CoreV1Api {

  if (coreApiClient) {

    return coreApiClient;

  }

  coreApiClient =
    getKubeConfig()
      .makeApiClient(
        k8s.CoreV1Api,
      );

  return coreApiClient;

}

// creates and returns the Kubernetes Batch API client
export function getBatchApi(): k8s.BatchV1Api {

  if (batchApiClient) {

    return batchApiClient;

  }

  batchApiClient =
    getKubeConfig()
      .makeApiClient(
        k8s.BatchV1Api,
      );

  return batchApiClient;

}