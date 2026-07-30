// plugins/makedoc-backend/src/index.ts
import { makedocPlugin } from './plugin';

// Allow the standard modular system to find it
export { makedocPlugin as default } from './plugin';

// Explicitly export for the dynamic feature loader scanner
export const dynamicPluginInstaller = makedocPlugin;