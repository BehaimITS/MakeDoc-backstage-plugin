import * as k8s from '@kubernetes/client-node';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';


export const KUBE_NAMESPACE = 'default';


let kubeConfig: k8s.KubeConfig | undefined;

let coreApiClient: k8s.CoreV1Api | undefined;

let batchApiClient: k8s.BatchV1Api | undefined;



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


  kubeConfig = kc;


  return kc;
}



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