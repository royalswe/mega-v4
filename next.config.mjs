import { withPayload } from '@payloadcms/next/withPayload'

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  /**
   * `file-type` is externalised by `withPayload` (see @payloadcms/next/withPayload), and its
   * `fromFile()` path loads `strtok3` through a non-literal dynamic import:
   *
   *   function importAtRuntime(specifier) { return import(specifier) }
   *   importAtRuntime('strtok3')
   *
   * @vercel/nft cannot trace a dynamic specifier, so only `strtok3/lib/core.js` (which file-type
   * imports statically) ends up in the standalone trace. `strtok3/lib/index.js` is then missing
   * from the production image, and Payload's `/api/media/file/*` endpoint (which calls
   * `fileTypeFromFile`) fails with ERR_MODULE_NOT_FOUND. Buffer based detection still works
   * because it only needs `strtok3/core`, which is why uploads succeed but downloads 500.
   *
   * Copy the whole package (pnpm virtual store and hoisted layouts) into every route trace.
   */
  outputFileTracingIncludes: {
    '/**': [
      './node_modules/.pnpm/strtok3@*/node_modules/strtok3/**/*',
      './node_modules/strtok3/**/*',
    ],
  },
  // Your Next.js config here
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    return webpackConfig
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
