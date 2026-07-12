import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    setupFiles: ['tests/vitest/vitest.setup.ts'],
    include: ['tests/vitest/int/**/*.int.spec.ts'],
    fileParallelism: false,
    reporters: [
      'default',
      [
        'json',
        {
          outputFile: 'tests/vitest/report/report.json',
        },
      ],
    ],
    coverage: {
      reportsDirectory: 'tests/vitest/coverage',
    },
  },
})
