# AGENTS.md

## Project overview

This repository contains a Backstage plugin for running MakeDoc documentation generation from TIBCO Developer Hub.

The project has two packages:

* `makedoc-plugin/` — frontend UI.
* `makedoc-backend/` — backend API and Kubernetes Job execution.

The frontend and backend are intended to be integrated into a TIBCO Developer Hub workspace.

The normal execution flow is:

```text
Developer Hub
    |
    v
MakeDoc frontend
    |
    | POST /api/makedoc/run-job
    v
MakeDoc backend
    |
    +--> validate request
    |
    +--> create temporary Git Secret
    |
    +--> create Kubernetes Job
             |
             +--> step1-git-clone
             |       |
             |       v
             |   clone repository
             |
             +--> step2-makedoc-engine
             |       |
             |       v
             |   run MakeDoc
             |
             +--> step3-git-push-finalizer
                     |
                     v
                 push generated docs
                     |
                     v
                 Git repository
                     |
                     v
                   TechDocs
```

MakeDoc itself runs inside Kubernetes. It is not executed directly inside the Backstage backend process.

---

# Repository structure

```text
MakeDoc-backstage-plugin/
├── makedoc-plugin/
│   ├── docs/
│   └── src/
└── makedoc-backend/
    ├── docs/
    └── src/
        ├── index.ts
        ├── plugin.ts
        ├── router.ts
        ├── job-service.ts
        ├── job-status.ts
        ├── job-monitor.ts
        ├── job-events.ts
        ├── job-logs.ts
        ├── kubernetes.ts
        ├── validation.ts
        ├── types.ts
        └── templates/
            └── job-template.ts
```

Before modifying a file, inspect its current implementation and the files that consume it.

Do not rely only on filenames or assumptions about the architecture.

---

# Frontend

The frontend is responsible for:

* displaying the MakeDoc page;
* collecting execution parameters;
* starting an execution;
* displaying Job status;
* displaying MakeDoc logs;
* maintaining the live SSE connections to the backend.

The frontend must not directly communicate with Kubernetes.

## `MakeDoc.tsx`

Main page/orchestration component.

Responsibilities include:

* displaying the execution form;
* displaying the Job status/monitoring view;
* retrieving the latest tracked Job;
* connecting to backend SSE events;
* switching between the form and active Job state.

The frontend uses the configured Backstage backend URL when communicating with the backend.

## `ExecutionForm.tsx`

Collects the parameters required to execute MakeDoc.

When changing the form, remember that the form payload must remain compatible with:

```text
types.ts
validation.ts
job-service.ts
job-template.ts
```

If a new MakeDoc option is introduced, update both frontend and backend handling.

Do not add a frontend-only option and assume that MakeDoc will receive it automatically.

The Git access token must not be persisted in browser `localStorage`.

Non-secret form configuration may be persisted according to the existing implementation.

## `JobStatus.tsx`

Displays the current Job state and MakeDoc logs.

It receives live information from the backend using Server-Sent Events (SSE).

When modifying SSE parsing, remember that a network chunk is not necessarily a complete SSE event.

Do not assume that one `message`/network chunk corresponds to one complete application event.

## `plugin.ts`

Defines the frontend Backstage plugin.

## `routes.ts`

Defines the frontend route reference.

The MakeDoc page is exposed through the `/makedoc-plugin` route when integrated into Developer Hub.

---

# Backend

The backend contains the HTTP API, Kubernetes integration, Job orchestration, monitoring, status handling, and log collection.

## `router.ts`

HTTP API layer.

It exposes functionality for:

* starting a MakeDoc Job;
* retrieving the latest/active Job;
* streaming Job status;
* streaming Job logs.

The frontend depends on these API contracts.

When changing an endpoint, update every frontend caller.

When changing an API response, update all consumers.

---

## `job-service.ts`

Main orchestration layer for starting MakeDoc.

The service coordinates:

1. request validation;
2. active Job detection;
3. Job name generation;
4. Secret name generation;
5. Kubernetes Secret creation;
6. Kubernetes Job creation;
7. event initialization;
8. log collection.

Keep Kubernetes manifest construction in `job-template.ts`.

Do not duplicate the Job manifest inside `job-service.ts`.

Never log the Git token.

---

## `job-template.ts`

One of the most important files in the backend.

It constructs the Kubernetes Job manifest.

The Job consists of three execution stages:

```text
step1-git-clone
step2-makedoc-engine
step3-git-push-finalizer
```

These container names are used elsewhere by the backend.

**Do not rename them casually.**

If a container name changes, check at minimum:

```text
job-template.ts
job-status.ts
job-logs.ts
```

The containers share the Job workspace through Kubernetes volumes.

Changes to any of the following can break the execution pipeline:

* container names;
* volume names;
* mount paths;
* environment variables;
* ServiceAccounts;
* repository paths.

The Job uses the Kubernetes configuration defined by the current implementation, including its ServiceAccount, restart policy, backoff behavior, and cleanup settings.

Do not change these values without considering the impact on monitoring and cleanup.

---

## `job-status.ts`

Converts Kubernetes Pod/container state into MakeDoc application status.

Status handling is coupled to the container names and Pod state defined in `job-template.ts`.

If the Job template changes, verify the status logic.

A Kubernetes Job reaching a terminal state does not automatically mean that the intended MakeDoc operation succeeded. Status logic must reflect the actual pipeline.

---

## `job-monitor.ts`

Runs the background monitoring loop for MakeDoc Jobs.

It periodically checks Kubernetes and publishes changes in Job status.

The monitor is separate from the HTTP request that creates the Job.

The frontend should not be responsible for querying Kubernetes directly.

---

## `job-events.ts`

Manages Job status events delivered through SSE.

The current implementation stores event information in backend process memory.

Therefore:

* events are not durable;
* a backend restart loses the in-memory state;
* latest-job state should not be treated as a persistent database.

Do not introduce functionality that assumes this state survives a backend restart.

---

## `job-logs.ts`

Collects and streams logs from the MakeDoc execution container:

```text
step2-makedoc-engine
```

Logs are collected by the backend rather than directly by the browser.

The frontend receives logs through SSE.

When debugging missing logs, check:

1. Pod existence;
2. container name;
3. Kubernetes Pod-log permissions;
4. backend log collection;
5. SSE connection;
6. frontend SSE parsing.

The log collector must tolerate normal Kubernetes startup timing. A Pod may exist before the MakeDoc container is ready to produce logs.

Do not remove retry/wait behavior without testing this case.

---

## `kubernetes.ts`

Creates the Kubernetes API clients used by the backend.

The implementation supports:

* local development using a kubeconfig;
* in-cluster execution.

The configured kubeconfig is attempted first and the implementation can fall back to in-cluster configuration when appropriate.

Before debugging Job creation, verify Kubernetes connectivity and RBAC.

The Kubernetes configuration is a deployment concern, not merely an application-code concern.

---

## `validation.ts`

Validates incoming execution requests before Kubernetes resources are created.

Do not rely only on frontend validation.

The backend is the authoritative validation boundary.

When adding a request parameter, update:

```text
types.ts
validation.ts
job-service.ts
```

and also the frontend and Job template if necessary.

---

## `types.ts`

Contains shared backend TypeScript types.

Keep request and status types synchronized with:

* the router;
* the Job service;
* status handling;
* the frontend.

---

# Developer Hub application configuration

This is an important setup requirement.

The MakeDoc plugin requires configuration in the **Developer Hub application**, not only inside this repository.

When setting up the plugin in a new Developer Hub installation, check the Developer Hub application's:

```text
app-config.yaml
```

and any environment-specific configuration files.

The required MakeDoc/GitHub token configuration must be present in the Developer Hub application configuration used by the running backend.

**Do not assume that supplying a token through the MakeDoc execution form is sufficient for the complete Developer Hub setup.**

The token/configuration required by the Developer Hub integration must be configured in the Developer Hub application before troubleshooting plugin authentication/configuration problems.

When working on a new installation, verify:

```text
Developer Hub app-config.yaml
Developer Hub environment variables/secrets
MakeDoc backend configuration
MakeDoc frontend configuration
```

Use the existing Developer Hub configuration and repository documentation to determine the exact configuration key/name used by the current installation. Do not invent a new configuration key when one already exists.

## Secret handling

Never commit a real token to:

```text
app-config.yaml
```

if that file is stored in source control.

For production deployments, provide credentials through the deployment's secret/environment-variable mechanism and reference them from the Developer Hub configuration as appropriate.

Never:

* hard-code tokens in TypeScript;
* commit tokens to Git;
* expose tokens to the browser unnecessarily;
* put tokens in normal application logs;
* include tokens in SSE events;
* store execution tokens in browser `localStorage`.

---

# Kubernetes requirements

The backend and Kubernetes Job use different ServiceAccounts.

The controller ServiceAccount is used by the Backstage backend.

The runner ServiceAccount is used by the MakeDoc Job.

The current project uses:

```text
makedoc-controller
makedoc-runner
```

The controller needs permissions for the Kubernetes resources used by the backend, including:

* Jobs;
* Secrets;
* Pods;
* Pod logs.

The runner needs the Pod permissions required by the finalizer.

The exact RBAC definitions are documented in the repository's backend documentation.

Before changing RBAC, determine which component needs the permission.

Do not grant cluster-wide permissions when namespace-scoped permissions are sufficient.

The current setup uses the `default` namespace.

When changing namespace behavior, check all of:

```text
kubernetes.ts
job-template.ts
RBAC configuration
Developer Hub configuration
documentation
```

---

# GitHub authentication

The MakeDoc Job needs a GitHub Personal Access Token to access repositories and push generated documentation.

The token permissions documented by this project include:

```text
Contents: Read and write
Metadata: Read-only
Commit statuses: Read-only
```

Use the smallest repository scope and permissions necessary.

A token that can clone a repository but cannot write to it can produce a partially successful-looking execution:

```text
clone succeeds
    |
MakeDoc succeeds
    |
git push fails
```

Therefore, when the finalizer fails, check GitHub token permissions before changing Kubernetes or MakeDoc code.

---

# Kubernetes Job execution

The Job consists of:

## Stage 1 — Git clone

Container:

```text
step1-git-clone
```

Responsibilities include:

* authenticating to the repository;
* cloning the repository;
* preparing the shared workspace;
* copying/preparing the configured input;
* making the workspace available to MakeDoc.

If this stage fails, inspect the init-container logs and GitHub access.

## Stage 2 — MakeDoc

Container:

```text
step2-makedoc-engine
```

This is where MakeDoc actually executes.

It receives the configured MakeDoc parameters and uses the shared workspace.

When debugging MakeDoc execution, check:

* MakeDoc image;
* environment variables;
* input path;
* output path;
* workspace;
* profile;
* filter;
* selected products/formats.

## Stage 3 — Git finalizer

Container:

```text
step3-git-push-finalizer
```

Responsible for the final repository update.

If MakeDoc succeeds but the overall Job fails, inspect this stage.

Possible causes include:

* generated files are not where expected;
* Git permissions;
* Git authentication;
* repository state;
* Kubernetes API access required by the finalizer.

---

# TechDocs

MakeDoc generates documentation that is ultimately consumed by Developer Hub/TechDocs.

A successful MakeDoc Job does **not** guarantee a successful TechDocs build.

When modifying generated documentation, verify:

* Markdown file locations;
* `mkdocs.yml` / `mkdocs.yaml`;
* YAML indentation;
* navigation paths;
* generated navigation;
* `catalog-info.yaml`;
* Developer Hub entity configuration.

In particular, malformed MkDocs YAML or incorrect `nav` paths can cause TechDocs to fail after MakeDoc has completed successfully.

Treat these as separate stages:

```text
MakeDoc execution
        |
        v
generated repository
        |
        v
TechDocs build
```

---

# Developer Hub integration

The plugin is designed to be integrated into the TIBCO Developer Hub workspace.

The host Developer Hub must register both the frontend and backend plugins.

The integration involves the host application's:

```text
packages/app/src/App.tsx
packages/app/package.json
packages/backend/src/index.ts
packages/backend/package.json
```

The repository README contains the current integration procedure.

After changing workspace dependencies, run:

```bash
yarn install
```

from the Developer Hub workspace root.

Do not assume that the MakeDoc plugin repository by itself represents the complete Developer Hub runtime.

---

# Development and testing

When working inside the actual Developer Hub workspace, use the Developer Hub workspace's normal root-level commands.

For package-level development, use the scripts defined in each package's current `package.json`.

Before considering a change complete:

```text
build
lint
tests
```

should pass for the affected package where applicable.

Do not introduce commands into this document that are not actually defined by the current package configuration.

---

# Debugging workflow

When an execution fails, follow the pipeline in order.

## 1. Frontend request

Check the browser Network tab.

Verify that the frontend sends the expected request to:

```text
/api/makedoc/run-job
```

Inspect the payload.

## 2. Backend validation

If no Kubernetes Job is created, inspect:

```text
validation.ts
job-service.ts
```

Check for:

* missing repository URL;
* missing token;
* missing input/output directory;
* invalid optional parameters;
* invalid selection values.

## 3. Developer Hub configuration

Before changing application code, verify:

```text
app-config.yaml
environment variables
Developer Hub secrets
```

If the required token/configuration is missing, fix the Developer Hub configuration first.

## 4. Kubernetes connectivity

Verify:

```text
MAKEDOC_KUBECONFIG
Kubernetes context
ServiceAccount
Role
RoleBinding
namespace
```

The backend must be able to communicate with the Kubernetes cluster.

## 5. Job creation

Check:

```bash
kubectl get jobs -n default
kubectl get pods -n default
```

Then:

```bash
kubectl describe job <job-name> -n default
kubectl describe pod <pod-name> -n default
```

## 6. Repository clone

If:

```text
step1-git-clone
```

fails, check:

* repository URL;
* GitHub token;
* token repository access;
* token permissions;
* network connectivity;
* init-container logs.

## 7. MakeDoc

If cloning succeeds but MakeDoc fails, inspect:

```text
step2-makedoc-engine
```

Check:

* MakeDoc image;
* MakeDoc environment variables;
* workspace;
* profile;
* filter;
* input path;
* output path.

## 8. Finalizer

If MakeDoc succeeds but the Job does not complete, inspect:

```text
step3-git-push-finalizer
```

Check:

* generated files;
* expected output path;
* Git authentication;
* repository write permission;
* finalizer Pod-status checks;
* runner RBAC.

## 9. Status and logs

If Kubernetes shows the correct state but the UI does not, inspect:

```text
job-status.ts
job-monitor.ts
job-events.ts
job-logs.ts
MakeDoc.tsx
JobStatus.tsx
```

---

# Common pitfalls

## Missing Developer Hub token/configuration

The plugin can be correctly installed and compiled while still failing at runtime if the required token/configuration has not been added to the Developer Hub application's `app-config.yaml`/runtime configuration.

Check the Developer Hub configuration before assuming the plugin code is broken.

## GitHub token has insufficient permissions

Authentication can succeed while repository push fails.

Verify both repository access and write permissions.

## Kubernetes RBAC

The backend and Job use different ServiceAccounts.

A valid kubeconfig does not guarantee that the required Kubernetes operations are permitted.

## Kubeconfig

For local development, verify that `MAKEDOC_KUBECONFIG` points to a usable kubeconfig and that the selected context can access the expected cluster/namespace.

## MkDocs YAML

YAML indentation errors can make TechDocs fail even when MakeDoc succeeded.

Always validate the generated MkDocs structure.

## Catalog metadata

The target repository needs the appropriate Backstage catalog metadata, including `catalog-info.yaml`, for Developer Hub/TechDocs integration.

## Kubernetes startup timing

A Pod may exist before the MakeDoc container is ready.

Do not interpret temporary log availability failures as permanent MakeDoc failures.

## Image architecture

When testing container images locally on a different CPU architecture, verify the image platform/manifest.

Do not assume an architecture-related failure is a MakeDoc application failure.

---

# Important implementation rules

## Keep frontend and backend contracts synchronized

The frontend and backend communicate through manually defined request/status structures.

When changing:

* request fields;
* response fields;
* endpoint names;
* status names;
* SSE events;

update every affected consumer.

## Preserve container names

These names are cross-component identifiers:

```text
step1-git-clone
step2-makedoc-engine
step3-git-push-finalizer
```

Changing them requires checking status and log handling.

## Preserve Kubernetes labels

The backend uses Kubernetes Job/Pod labels to locate Jobs and Pods.

Do not remove or rename labels without checking:

```text
job-service.ts
job-status.ts
job-logs.ts
job-monitor.ts
```

## Preserve shared paths

The clone, MakeDoc, and finalizer containers depend on shared workspace paths.

Changing mount paths can break the pipeline even when each container works individually.

## Do not persist secrets

Never put execution tokens into:

```text
localStorage
source code
Git
SSE events
normal logs
```

## Do not assume process-local state is persistent

Job events and collected logs are held in backend memory.

A backend restart can lose this state.

Do not treat it as a durable Job database.

## Do not weaken security to fix setup problems

Do not solve permission problems by blindly granting cluster-admin access.

Do not solve Git problems by using unrestricted tokens.

Do not expose Kubernetes credentials to the frontend.

Do not disable security controls as a permanent workaround.

---

# Change map

Use this table as the first place to look when implementing a change.

| Change                                   | Primary files                                                              |
| ---------------------------------------- | -------------------------------------------------------------------------- |
| Change MakeDoc form                      | `makedoc-plugin/src/components/MakeDoc/`                                   |
| Add a request parameter                  | `ExecutionForm.tsx` → `types.ts` → `validation.ts` → `job-service.ts`      |
| Add/change MakeDoc selection             | `ExecutionForm.tsx` → `validation.ts` → `job-service.ts`                   |
| Change API endpoint                      | `router.ts` + frontend caller                                              |
| Change Job creation                      | `job-service.ts`                                                           |
| Change Kubernetes Job                    | `templates/job-template.ts`                                                |
| Change container configuration           | `templates/job-template.ts`                                                |
| Change Job status                        | `job-status.ts`                                                            |
| Change status monitoring                 | `job-monitor.ts`                                                           |
| Change status SSE                        | `job-events.ts` + frontend                                                 |
| Change log collection                    | `job-logs.ts` + `JobStatus.tsx`                                            |
| Change Kubernetes connection             | `kubernetes.ts`                                                            |
| Change request validation                | `validation.ts`                                                            |
| Change frontend status display           | `JobStatus.tsx`                                                            |
| Change frontend page flow                | `MakeDoc.tsx`                                                              |
| Change frontend route                    | `plugin.ts`, `routes.ts`                                                   |
| Change Developer Hub integration         | Host Developer Hub `App.tsx` / backend registration / package dependencies |
| Change Developer Hub token/configuration | Host Developer Hub `app-config.yaml` and deployment secrets/environment    |
| Fix TechDocs output                      | MakeDoc generation/template logic + generated MkDocs structure             |
| Fix Kubernetes permissions               | ServiceAccounts / Roles / RoleBindings + affected backend/Job code         |

---

# Final verification checklist

Before considering a change complete, verify all items affected by the change:

* [ ] TypeScript/build succeeds.
* [ ] Relevant lint/tests pass.
* [ ] Frontend/backend contracts still match.
* [ ] Developer Hub application configuration is present and correct.
* [ ] Required token/configuration is available to the Developer Hub backend.
* [ ] No real token has been committed.
* [ ] Kubernetes connectivity works.
* [ ] Kubernetes RBAC is sufficient.
* [ ] A MakeDoc Job can be created.
* [ ] The repository can be cloned.
* [ ] MakeDoc receives the intended parameters.
* [ ] Generated documentation is written to the expected location.
* [ ] Generated documentation can be pushed to Git.
* [ ] Job status transitions are detected.
* [ ] MakeDoc logs are collected.
* [ ] SSE status/log updates reach the frontend.
* [ ] Frontend state behaves correctly after a refresh.
* [ ] `catalog-info.yaml` is present where required.
* [ ] MkDocs configuration is valid.
* [ ] TechDocs can build the resulting repository.

When troubleshooting, trace the complete path instead of changing isolated components:

```text
Developer Hub configuration
        |
        v
UI
        |
        v
HTTP request
        |
        v
validation
        |
        v
job-service
        |
        v
Kubernetes Job
        |
        +--> clone
        |
        +--> MakeDoc
        |
        +--> finalizer
        |
        v
Git repository
        |
        v
TechDocs
```

