import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/cli/index.ts',
    'src/adapters/openai.ts',
    'src/adapters/anthropic.ts',
    'src/adapters/vercel-ai.ts',
    'src/adapters/langchain.ts',
  ],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  target: 'es2022',
})
