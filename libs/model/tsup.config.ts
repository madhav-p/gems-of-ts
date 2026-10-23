import { defineConfig } from 'tsup'

// JS is bundled by tsup (esbuild). Declaration files are emitted separately by
// `tsc` (see tsconfig.build.json) because tsup's dts pipeline needs the classic
// TypeScript compiler API, which TypeScript 7 no longer ships.
export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  dts: false,
  sourcemap: true,
  clean: true,
  target: 'es2022',
})
