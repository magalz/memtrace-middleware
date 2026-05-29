import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    sourcemap: true,
    splitting: false,
  },
  {
    entry: { cli: 'src/cli/index.ts' },
    format: ['esm'],
    clean: false,
    sourcemap: true,
    splitting: false,
    esbuildOptions(options) {
      options.banner = {
        js: '#!/usr/bin/env node',
      };
    },
  },
]);
