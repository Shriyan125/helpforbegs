// src/safeList.js
// WHY: Many essential development packages are run directly from the command line,
// loaded via CLI hooks, or invoked by build systems, so they never appear in `require()` or `import`
// inside source code. Flagging them as "unused" would confuse beginners and break their builds.
// Keeping this list in a dedicated, clean file makes it easy to maintain and expand.

/**
 * Built-in safe-list of popular development tools, linters, transpilers,
 * test frameworks, and CLI helpers.
 */
const SAFE_LIST = new Set([
  // Compilers & Language Tools
  'typescript',
  'ts-node',
  'tsx',
  'tslib',
  '@babel/core',
  '@babel/cli',
  '@babel/preset-env',
  '@babel/preset-react',
  '@babel/preset-typescript',

  // Linters & Formatters
  'eslint',
  'prettier',
  'lint-staged',
  'husky',
  'commitlint',
  '@commitlint/cli',
  '@commitlint/config-conventional',

  // Bundlers & Build Tools
  'webpack',
  'webpack-cli',
  'webpack-dev-server',
  'vite',
  'esbuild',
  'rollup',
  'parcel',
  'turbo',

  // Testing Frameworks & Runners
  'jest',
  'vitest',
  'mocha',
  'chai',
  'supertest',
  'c8',
  'nyc',
  'cypress',
  'playwright',

  // CLI Utilities & Task Runners
  'nodemon',
  'pm2',
  'rimraf',
  'concurrently',
  'npm-run-all',
  'cross-env',
  'shx',
  'dotenv-cli',
  'wait-on',
  'serve',

  // Styling & CSS Processors (invoked by PostCSS/Tailwind CLI or build tools)
  'postcss',
  'postcss-cli',
  'autoprefixer',
  'tailwindcss',

  // Documentation & Deployment
  'typedoc',
  'jsdoc',
  'gh-pages',
]);

/**
 * Checks if a given package name is in our built-in tooling safe-list.
 *
 * @param {string} packageName
 * @returns {boolean}
 */
function isSafeListed(packageName) {
  if (!packageName) return false;
  return SAFE_LIST.has(packageName.toLowerCase());
}

module.exports = {
  SAFE_LIST,
  isSafeListed,
};
