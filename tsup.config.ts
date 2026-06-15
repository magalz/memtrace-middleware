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
    format: ['cjs'],
    clean: false,
    sourcemap: true,
    splitting: false,
    outExtension() {
      return { js: '.cjs' };
    },
    esbuildOptions(options) {
      options.banner = {
        js: '#!/usr/bin/env node',
      };
    },
  },
  {
    entry: { 'test-server': 'load/test-server.ts' },
    format: ['esm'],
    clean: false,
    sourcemap: true,
    splitting: false,
  },
]);
