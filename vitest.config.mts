import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'node',
    setupFiles: ['tests/vitest/vitest.setup.ts'],
    include: ['tests/vitest/int/**/*.int.spec.ts'],
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
