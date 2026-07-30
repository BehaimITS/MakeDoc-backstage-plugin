import {
  createPlugin,
  createRoutableExtension,
} from '@backstage/core-plugin-api';

import {
  rootRouteRef,
} from './routes';


export const makedocPluginPlugin =
  createPlugin({
    id: 'makedoc-plugin',
    routes: {
      root: rootRouteRef,
    },
  });


export const MakedocPluginPage =
  makedocPluginPlugin.provide(
    createRoutableExtension({
      name: 'MakedocPluginPage',
      component: () =>
        import('./components/MakeDoc').then(
          m => m.MakeDocComponent,
        ),
      mountPoint: rootRouteRef,
    }),
  );