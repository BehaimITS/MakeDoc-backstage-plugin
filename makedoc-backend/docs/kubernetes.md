# Kubernetes Installation

The MakeDoc plugin uses Kubernetes to execute documentation-generation jobs.

The Backstage backend communicates with the Kubernetes API using the `makedoc-controller` ServiceAccount. For each documentation-generation request, the backend creates a Kubernetes `Job`. The Job runs the MakeDoc container together with the containers required to clone the repository and push the generated documentation.

All MakeDoc Kubernetes resources are currently created in the `default` namespace.

The Kubernetes setup consists of two ServiceAccounts:

* `makedoc-controller` — used by the Backstage backend to communicate with the Kubernetes API.
* `makedoc-runner` — used by the Job Pod.

The two ServiceAccounts have separate RBAC permissions.

---

# RBAC

Create `makedoc-rbac.yaml`:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: makedoc-controller
  namespace: default

---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: makedoc-runner
  namespace: default

---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: makedoc-controller-role
  namespace: default
rules:
  - apiGroups:
      - batch
    resources:
      - jobs
    verbs:
      - create
      - get
      - list
      - watch
      - delete

  - apiGroups:
      - ""
    resources:
      - secrets
    verbs:
      - create
      - get
      - patch
      - delete

  - apiGroups:
      - ""
    resources:
      - pods
      - pods/log
    verbs:
      - get
      - list
      - watch

---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: makedoc-controller-binding
  namespace: default
subjects:
  - kind: ServiceAccount
    name: makedoc-controller
    namespace: default
roleRef:
  kind: Role
  name: makedoc-controller-role
  apiGroup: rbac.authorization.k8s.io

---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: makedoc-runner-role
  namespace: default
rules:
  - apiGroups:
      - ""
    resources:
      - pods
    verbs:
      - get
      - list

---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: makedoc-runner-binding
  namespace: default
subjects:
  - kind: ServiceAccount
    name: makedoc-runner
    namespace: default
roleRef:
  kind: Role
  name: makedoc-runner-role
  apiGroup: rbac.authorization.k8s.io
```

Apply the RBAC configuration:

```bash
kubectl apply -f makedoc-rbac.yaml
```

The `makedoc-controller` Role gives the Backstage backend permission to:

* create, read, watch, and delete Jobs;
* create, read, patch, and delete Secrets;
* read Pods and Pod logs.

The `makedoc-runner` Role is intentionally much more restricted. The Job Pod can only read Pods and does not receive the permissions of the controller.

No `ClusterRole`, `ClusterRoleBinding`, or `cluster-admin` permissions are required.

---

# Kubernetes Kubeconfig

The Backstage backend authenticates to Kubernetes using the `makedoc-controller` ServiceAccount.

The installation script:

1. applies the RBAC configuration;
2. creates a token for `makedoc-controller`;
3. reads the Kubernetes API server and CA certificate from the selected Kubernetes context;
4. generates a dedicated kubeconfig;
5. restricts the generated kubeconfig to the current user.

Run:

```bash
chmod +x install-makedoc.sh

./install-makedoc.sh
```

The script uses the current Kubernetes context by default.

A different context can be supplied explicitly:

```bash
./install-makedoc.sh <context-name>
```

The generated file is:

```text
makedoc-controller-kubeconfig.yaml
```

The generated kubeconfig contains:

* the Kubernetes API server address;
* the cluster CA certificate;
* the `makedoc-controller` ServiceAccount token;
* a dedicated Kubernetes context named `makedoc-controller`.

## Installation script

```bash
#!/usr/bin/env bash

set -euo pipefail

CONTEXT="${1:-$(kubectl config current-context)}"

NAMESPACE="default"

SERVICE_ACCOUNT="makedoc-controller"

OUTPUT="makedoc-controller-kubeconfig.yaml"

echo "================================="
echo "Installing MakeDoc Kubernetes RBAC"
echo "================================="
echo ""

echo "Using context:"
echo "${CONTEXT}"
echo ""

echo "Applying RBAC..."

kubectl apply -f makedoc-rbac.yaml

echo ""
echo "Creating controller token..."

TOKEN=$(kubectl create token \
  "${SERVICE_ACCOUNT}" \
  -n "${NAMESPACE}" \
  --duration=8760h)

echo "Reading cluster information..."

CLUSTER_NAME=$(kubectl config view \
  --raw \
  --context "${CONTEXT}" \
  -o jsonpath='{.contexts[?(@.name=="'"${CONTEXT}"'")].context.cluster}')

if [ -z "${CLUSTER_NAME}" ]; then
  echo ""
  echo "ERROR: Could not find cluster for context ${CONTEXT}"
  exit 1
fi

SERVER=$(kubectl config view \
  --raw \
  --context "${CONTEXT}" \
  -o jsonpath='{.clusters[?(@.name=="'"${CLUSTER_NAME}"'")].cluster.server}')

CA_DATA=$(kubectl config view \
  --raw \
  --context "${CONTEXT}" \
  -o jsonpath='{.clusters[?(@.name=="'"${CLUSTER_NAME}"'")].cluster.certificate-authority-data}')

if [ -z "${CA_DATA}" ]; then

  CA_PATH=$(kubectl config view \
    --raw \
    --context "${CONTEXT}" \
    -o jsonpath='{.clusters[?(@.name=="'"${CLUSTER_NAME}"'")].cluster.certificate-authority}')

  if [ -z "${CA_PATH}" ]; then
    echo ""
    echo "ERROR: Could not find Kubernetes CA certificate"
    exit 1
  fi

  CA_DATA=$(base64 -w 0 "${CA_PATH}")

fi

echo ""
echo "Generating kubeconfig..."

cat > "${OUTPUT}" <<EOF
apiVersion: v1
kind: Config

clusters:

- name: makedoc-cluster
  cluster:
    server: ${SERVER}
    certificate-authority-data: ${CA_DATA}

contexts:

- name: makedoc-controller
  context:
    cluster: makedoc-cluster
    user: makedoc-controller

current-context: makedoc-controller

users:

- name: makedoc-controller
  user:
    token: ${TOKEN}
EOF

chmod 600 "${OUTPUT}"

echo ""
echo "================================="
echo "MakeDoc installation complete"
echo "================================="
echo ""

echo "Generated kubeconfig:"
echo "${OUTPUT}"
```

The token duration is requested as `8760h`, approximately one year. The actual lifetime is ultimately controlled by the Kubernetes cluster's ServiceAccount token configuration.

The generated kubeconfig is a credential and must not be committed to the repository.

---

# Backend Kubeconfig Configuration

The generated kubeconfig must be supplied to the Backstage/Developer Hub backend through the `MAKEDOC_KUBECONFIG` environment variable.

For example:

```bash
export MAKEDOC_KUBECONFIG=/path/to/makedoc-controller-kubeconfig.yaml
```

For persistent Bash configuration:

```bash
echo 'export MAKEDOC_KUBECONFIG=/path/to/makedoc-controller-kubeconfig.yaml' >> ~/.bashrc

source ~/.bashrc
```

The variable must be available to the actual Developer Hub/Backstage backend process.

The backend reads the path from:

```text
MAKEDOC_KUBECONFIG
```

and uses the kubeconfig to authenticate as:

```text
makedoc-controller
```

The generated kubeconfig should therefore be stored outside the repository and protected with appropriate filesystem permissions.

---

# Jobs and Pods

Each documentation-generation request creates a Kubernetes `Job`.

The backend generates a unique Job name in the form:

```text
makedoc-job-<random-id>
```

The Job uses:

```yaml
serviceAccountName: makedoc-runner
```

Kubernetes creates a Pod for the Job.

The current Job configuration includes:

```yaml
apiVersion: batch/v1
kind: Job
```

and uses:

```yaml
backoffLimit: 0
restartPolicy: Never
ttlSecondsAfterFinished: 60
```

`backoffLimit: 0` means the Job is not configured to retry a failed Pod.

`ttlSecondsAfterFinished: 60` allows Kubernetes to automatically clean up the finished Job after 60 seconds.

## Pod structure

The Pod contains three execution stages:

```text
step1-git-clone
step2-makedoc-engine
step3-git-push-finalizer
```

The first stage is an `initContainer`:

```text
step1-git-clone
```

It uses:

```text
alpine/git:latest
```

Because it is an `initContainer`, Kubernetes waits for it to complete successfully before starting the normal containers.

The main MakeDoc execution container is:

```text
step2-makedoc-engine
```

It uses:

```text
behaimits/makedoc:latest
```

with:

```yaml
imagePullPolicy: Always
```

The finalizer container is:

```text
step3-git-push-finalizer
```

It uses the pinned image:

```text
bitnami/kubectl@sha256:95de17e6eb92da83a58c90a9df0c4cede634f898d2e6b92ea04f4a6ee6ace08d
```

The finalizer uses `kubectl` to wait for the MakeDoc container to terminate before preparing and pushing the generated documentation.

The three containers share an `emptyDir` volume:

```text
shared-workspace
```

This provides temporary storage shared between the containers during the lifetime of the Pod.

The storage is not persistent and disappears when the Pod is removed.

The shared workspace is used for the repository checkout, MakeDoc processing, and generated documentation.

---

# Job Execution Flow

The Kubernetes execution flow is:

```text
Backstage backend
      |
      | makedoc-controller
      v
Kubernetes API
      |
      +-- create temporary Secret
      |
      +-- create Job
              |
              | makedoc-runner
              v
          Kubernetes Pod
              |
              +-- initContainer
              |     step1-git-clone
              |
              +-- step2-makedoc-engine
              |     behaimits/makedoc
              |
              +-- step3-git-push-finalizer
                    bitnami/kubectl
              |
              +-- shared emptyDir
```

The execution sequence is:

```text
1. Backend creates Git credential Secret
2. Backend creates Kubernetes Job
3. Job creates Pod
4. Git clone initContainer clones the repository
5. MakeDoc container processes the repository
6. Finalizer waits for MakeDoc to finish
7. Finalizer prepares the generated documentation
8. Finalizer pushes the result to the repository
9. Kubernetes marks the Job as completed
10. Kubernetes cleans up the finished Job after the TTL
```

The Git credential and Kubernetes ServiceAccount token are separate credentials:

* **GitHub credential** — used by the Job to clone and push the repository.
* **Kubernetes ServiceAccount token** — used by the Backstage backend to communicate with the Kubernetes API.

The backend creates the Git credential as a temporary Kubernetes Secret. After the Job is created, the Secret is patched with an owner reference pointing to the Job. This allows Kubernetes to associate the Secret with the Job lifecycle.

If Job creation fails after the Secret has been created, the backend explicitly deletes the Secret.

---

# Kubernetes Connection in the Backend

The backend uses the `@kubernetes/client-node` library to communicate with Kubernetes.

The Kubernetes configuration and API clients are cached after their first creation.

The connection has the following structure:

```text
MAKEDOC_KUBECONFIG
        |
        v
    KubeConfig
        |
        +------------------+
        |                  |
        v                  v
  CoreV1Api          BatchV1Api
        |                  |
        |                  |
   Pods/Secrets           Jobs
```

The Kubernetes namespace is defined centrally in `kubernetes.ts`:

```typescript
export const KUBE_NAMESPACE = 'default';
```

## KubeConfig loading

`getKubeConfig()` first checks whether a configuration has already been loaded.

If it has, the cached configuration is returned.

Otherwise, the function requires `MAKEDOC_KUBECONFIG` to be defined and attempts to load the kubeconfig from that file.

If the file cannot be loaded, the backend falls back to:

```typescript
kc.loadFromCluster();
```

This allows the backend to use Kubernetes in-cluster configuration when it is itself running inside Kubernetes.

The configuration is then cached for subsequent requests.

The relevant implementation is:

```typescript
import * as k8s from '@kubernetes/client-node';

// Disables TLS certificate verification for the Kubernetes API connection.
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

  const kc = new k8s.KubeConfig();

  try {

    if (!process.env.MAKEDOC_KUBECONFIG) {
      throw new Error('MAKEDOC_KUBECONFIG is not set');
    }

    kc.loadFromFile(
      process.env.MAKEDOC_KUBECONFIG,
    );

  } catch (error) {

    console.log(
      `Failed to load Kubernetes config from file, falling back to in-cluster configuration: ${error}`,
    );

    kc.loadFromCluster();
  }

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
```

The two API clients are used for different Kubernetes resource types:

| Client       | Resources used by the plugin |
| ------------ | ---------------------------- |
| `CoreV1Api`  | Pods, Pod logs, Secrets      |
| `BatchV1Api` | Jobs                         |

The backend therefore uses the controller ServiceAccount permissions from the RBAC configuration when performing these operations.

---

# TLS Configuration

The current backend explicitly sets:

```typescript
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
```

This disables TLS certificate verification for Node.js HTTPS connections.

The generated kubeconfig still contains the Kubernetes CA certificate, but this environment setting means Node.js does not enforce normal TLS certificate validation.

This setting is therefore an important part of the current Kubernetes connection configuration and should be reviewed before using the plugin in a production environment.

---

# Kubernetes Resource Overview

The complete Kubernetes setup can be summarized as:

```text
Namespace: default

ServiceAccounts:
  makedoc-controller
  makedoc-runner

RBAC:
  makedoc-controller-role
  makedoc-controller-binding
  makedoc-runner-role
  makedoc-runner-binding

Runtime resources:
  Job
    |
    +-- Pod
         |
         +-- step1-git-clone
         +-- step2-makedoc-engine
         +-- step3-git-push-finalizer
         |
         +-- shared emptyDir

Temporary resource:
  Git credential Secret
```

The backend controls the lifecycle of the Jobs and temporary Secrets, while the Job itself executes the documentation-generation workflow inside Kubernetes.
