import { createBackendPlugin, coreServices } from '@backstage/backend-plugin-api';
import { createRouter } from './router';
import { startJobMonitor } from './job-monitor';

export const makedocPlugin = createBackendPlugin({
  pluginId: 'makedoc',
  register(env) {
    env.registerInit({
      deps: {
        logger: coreServices.logger,
        httpRouter: coreServices.httpRouter,
      },
      async init({ logger, httpRouter }) {

        startJobMonitor();

        httpRouter.use(
          await createRouter({
            logger,
          }),
        );
      },
    });
  },
});