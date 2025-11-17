import { createDevApp } from '@backstage/dev-utils';
import { makedocPluginPlugin, MakedocPluginPage } from '../src/plugin';

createDevApp()
  .registerPlugin(makedocPluginPlugin)
  .addPage({
    element: <MakedocPluginPage />,
    title: 'Root Page',
    path: '/makedoc-plugin',
  })
  .render();
