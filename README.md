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

### 2. Add custom plugins

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
+ import { MakeDocPage } from '@internal/plugin-makedoc';

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
+ "@internal/plugin-makedoc": "workspace:*",
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

