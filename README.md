# MakeDoc backstage plugin

A Backstage plugin for MakeDoc to run documentation generation from TIBCO Developer Hub.

## Development Setup

### 1. Set up TIBCO Developer Hub

Start by cloning and setting up the TIBCO Developer Hub repository.

Repository:

https://github.com/TIBCOSoftware/tibco-developer-hub

Follow the repository instructions to install dependencies and verify that the Developer Hub instance runs correctly before adding custom plugins.

At this stage, the goal is to have a working base Developer Hub installation.

---

### 2. Set up Kubernetes RBAC

The MakeDoc backend runs MakeDoc documentation generation as Kubernetes Jobs. Before running the backend, the required Kubernetes ServiceAccounts, Roles, and RoleBindings must be created.

Follow the [Kubernetes RBAC setup](makedoc-backend/docs/kubernetes.md) documentation to:

- create the `makedoc-controller` ServiceAccount
- create the `makedoc-runner` ServiceAccount
- configure the required Kubernetes Roles and RoleBindings
- generate the controller kubeconfig
- configure `MAKEDOC_KUBECONFIG`

The RBAC configuration must be completed before starting the MakeDoc backend.

---

### 3. Add custom plugins

Copy the plugin folders from the plugin repository into the Developer Hub plugins directory:

~~~text
tibco-developer-hub/
└── plugins/
    ├── existing-plugins/
    ├── makedoc-plugin/
    ├── makedoc-backend/
    └── other-custom-plugins/
~~~

The MakeDoc plugin consists of:

- `makedoc-plugin` - frontend plugin providing the Developer Hub UI.
- `makedoc-backend` - backend plugin responsible for handling MakeDoc execution.

The plugins are developed as part of the Developer Hub workspace.

---

### Developer Hub Repository Changes

After copying the plugin folders into `tibco-developer-hub/plugins`, the Developer Hub repository must be updated to load the new plugins.

The following changes were made inside the `tibco-developer-hub` repository.

---

#### Frontend Integration

##### `packages/app/src/App.tsx`

The MakeDoc frontend plugin must be imported and registered as a route.

Example:

~~~diff
+ import { MakeDocPage } from '@internal/plugin-makedoc-plugin';

...

const routes = (
  <FlatRoutes>
+   <Route path="/makedoc-plugin" element={<MakeDocPage />} />
  </FlatRoutes>
);
~~~

This exposes the MakeDoc page inside Developer Hub.

The resulting route is:

~~~text
/makedoc-plugin
~~~

---

#### Backend Integration

##### `packages/backend/src/index.ts`

The MakeDoc backend plugin must be registered in the backend application.

Example:

~~~diff
+ import { makedocPlugin } from '@internal/plugin-makedoc-backend';

...

+ backend.add(
+  makedocPlugin()
+ );
~~~

---

#### Package Configuration Changes

The new plugins must be added as workspace dependencies.

##### `packages/app/package.json`

Example:

~~~diff
+ "@internal/plugin-makedoc-plugin": "workspace:*",
~~~

This allows the frontend package to import the MakeDoc frontend plugin.

---

##### `packages/backend/package.json`

Example:

~~~diff
+ "@internal/plugin-makedoc-backend": "workspace:*",
~~~

This allows the backend package to load the MakeDoc backend plugin.

---

## Running Developer Hub

After integrating the plugins, install dependencies again from the Developer Hub root:

~~~bash
yarn install
~~~

Start the development environment:

~~~bash
yarn start
~~~

---

# Developer Documentation

The following documentation describes the internal implementation of the MakeDoc plugin and is intended for developers working on or extending the plugin.

### Backend Documentation

- [MakeDoc Backend](makedoc-backend/docs/MakeDoc%20Backend.md) - Backend architecture, execution flow, Kubernetes Jobs, API endpoints, status handling, log streaming, and TechDocs integration.


### Frontend Documentation

- [MakeDoc Frontend](makedoc-plugin/docs/MakeDoc%20Frontend.md) - Frontend architecture, components, execution form, job status handling, SSE connections, log streaming, and interaction with the MakeDoc backend.
