// src/fileFinder.js
// WHY: To analyze a project's dependencies accurately, we must discover every
// single JavaScript/TypeScript file where code might be imported, while skipping
// heavy dependency folders (like node_modules) and generated build outputs (dist/).

const fs = require('fs');
const path = require('path');

// 1 Megabyte in bytes. We skip files larger than this to prevent memory spikes
// and keep scanning blazing fast, especially if someone accidentally committed a minified bundle.
const MAX_FILE_SIZE_BYTES = 1024 * 1024; // 1 MB

// Folders that should always be ignored.
// Scanning these would produce false positives or freeze the CLI.
const DEFAULT_IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  'out',
  '.cache',
  '.turbo',
  'fixtures',
  '__fixtures__',
]);

// Extensions we want to inspect for imports and requires.
const SUPPORTED_EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.jsx',
  '.ts',
  '.tsx',
]);

/**
 * Parses a .gitignore file into a list of pattern matchers.
 * Supports basic gitignore patterns (*, /dir, dir/, filename).
 *
 * @param {string} rootDir
 * @returns {Array<(relPath: string, isDirectory: boolean) => boolean>}
 */
function loadGitignoreMatchers(rootDir) {
  const gitignorePath = path.join(rootDir, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(gitignorePath, 'utf8');
    const lines = content.split(/\r?\n/);
    const matchers = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      // Ignore empty lines and comments
      if (!line || line.startsWith('#')) {
        continue;
      }

      const isDirOnly = line.endsWith('/');
      let cleanPattern = line.replace(/\/+$/, ''); // Remove trailing slashes
      const isRootAnchored = cleanPattern.startsWith('/');
      if (isRootAnchored) {
        cleanPattern = cleanPattern.slice(1);
      }

      // Convert a simple glob (*, ?) into a regular expression
      // e.g. *.log -> ^.*\.log$
      const escaped = cleanPattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');

      const regex = new RegExp(isRootAnchored ? `^${escaped}` : `(^|/)${escaped}(/|$)`);

      matchers.push((relPath, isDirectory) => {
        // Normalize Windows backslashes to forward slashes for matching
        const normalized = relPath.replace(/\\/g, '/');
        if (isDirOnly && !isDirectory) {
          return false;
        }
        return regex.test(normalized);
      });
    }

    return matchers;
  } catch {
    // If .gitignore cannot be read, continue without crashing
    return [];
  }
}

/**
 * Scans a folder recursively to find all source code files.
 *
 * @param {string} rootDir - Absolute path to the project directory to scan
 * @param {object} options
 * @param {string[]} [options.extraIgnores=[]] - Additional patterns or folders to ignore
 * @returns {{ files: Array<{ fullPath: string, relativePath: string, ext: string }>, skippedLargeFiles: Array<{ fullPath: string, relativePath: string, size: number }> }}
 */
function findFiles(rootDir, options = {}) {
  const files = [];
  const skippedLargeFiles = [];
  const gitignoreMatchers = loadGitignoreMatchers(rootDir);

  function walk(currentDir) {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      // Permission error or unreadable directory; skip gracefully
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(rootDir, fullPath);

      // Check standard ignored folders
      if (entry.isDirectory()) {
        if (DEFAULT_IGNORED_DIRS.has(entry.name)) {
          continue;
        }

        // Check gitignore for directory
        const isIgnoredByGitignore = gitignoreMatchers.some((matcher) =>
          matcher(relativePath, true)
        );
        if (isIgnoredByGitignore) {
          continue;
        }

        // Recurse into subdirectory
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();

        // Check if the file extension is one of our target JS/TS code formats.
        // NOTE: Config files like `vite.config.js` or `.eslintrc.js` end in .js,
        // so they are intentionally included here so their imports count as usage!
        if (!SUPPORTED_EXTENSIONS.has(ext)) {
          continue;
        }

        // Check gitignore for file
        const isIgnoredByGitignore = gitignoreMatchers.some((matcher) =>
          matcher(relativePath, false)
        );
        if (isIgnoredByGitignore) {
          continue;
        }

        // Check file size to avoid processing massive files
        try {
          const stats = fs.statSync(fullPath);
          if (stats.size > MAX_FILE_SIZE_BYTES) {
            skippedLargeFiles.push({
              fullPath,
              relativePath,
              size: stats.size,
            });
            continue;
          }
        } catch {
          // If stat fails (e.g. broken symlink), skip safely
          continue;
        }

        files.push({
          fullPath,
          relativePath,
          ext,
        });
      }
    }
  }

  walk(rootDir);

  return {
    files,
    skippedLargeFiles,
  };
}

module.exports = {
  findFiles,
  MAX_FILE_SIZE_BYTES,
  DEFAULT_IGNORED_DIRS,
  SUPPORTED_EXTENSIONS,
};
