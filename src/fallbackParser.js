// src/fallbackParser.js
// WHY: In the real world, developers might have files with experimental syntax,
// syntax typos, or custom template tags that strict AST parsers choke on.
// Instead of crashing the whole CLI, we fall back to a line-by-line regex scanner
// for that file, and flag a gentle note in the report: "Could not fully read <file>".

const { builtinModules } = require('module');
const path = require('path');

const BUILTINS = new Set(builtinModules);

/**
 * Normalizes a raw module specifier into a clean npm package name.
 * Returns null if it is a relative file, built-in, or alias.
 *
 * @param {string} rawSpecifier - e.g. "lodash/debounce", "./utils", "node:fs"
 * @param {Set<string>} [knownAliases=new Set()]
 * @returns {string|null}
 */
function normalizePackageName(rawSpecifier, knownAliases = new Set()) {
  if (!rawSpecifier || typeof rawSpecifier !== 'string') {
    return null;
  }

  const trimmed = rawSpecifier.trim();

  // Skip relative paths (./foo, ../bar) and root-relative/absolute paths
  if (trimmed.startsWith('.') || trimmed.startsWith('/') || path.isAbsolute(trimmed)) {
    return null;
  }

  // Skip common framework path aliases (@/components, ~/utils, #internal)
  if (trimmed.startsWith('@/') || trimmed.startsWith('~/') || trimmed.startsWith('#')) {
    return null;
  }

  // Skip custom tsconfig/jsconfig aliases passed in
  for (const alias of knownAliases) {
    if (trimmed === alias || trimmed.startsWith(alias + '/')) {
      return null;
    }
  }

  // Any specifier starting with the 'node:' prefix (e.g. node:fs, node:test)
  // is reserved by Node.js for built-in modules and is never an npm package.
  if (trimmed.startsWith('node:')) {
    return null;
  }

  // Skip Node.js built-in modules without prefix (fs, path, crypto, http, etc.)
  if (BUILTINS.has(trimmed)) {
    return null;
  }

  const withoutNodePrefix = trimmed;

  // Scoped packages: @scope/pkg/deep -> @scope/pkg
  if (withoutNodePrefix.startsWith('@')) {
    const parts = withoutNodePrefix.split('/');
    if (parts.length >= 2) {
      return `${parts[0]}/${parts[1]}`;
    }
    return withoutNodePrefix;
  }

  // Regular packages: lodash/fp -> lodash
  return withoutNodePrefix.split('/')[0];
}

/**
 * Fallback regex scanner for files that fail to parse with Babel.
 *
 * @param {string} code - File content
 * @param {string} filePath - Path for reporting line numbers
 * @param {object} [options]
 * @param {Set<string>} [options.knownAliases]
 * @returns {Array<{ packageName: string, rawSpecifier: string, line: number, isTypeOnly: boolean }>}
 */
function scanWithRegex(code, filePath, options = {}) {
  const knownAliases = options.knownAliases || new Set();
  const results = [];
  const lines = code.split(/\r?\n/);

  // Regexes matching common import/require patterns
  const requireRegex = /\brequire\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
  const requireResolveRegex = /\brequire\.resolve\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
  const dynamicImportRegex = /\bimport\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
  const staticImportRegex = /\bimport\s+(?:type\s+)?(?:[\s\S]*?from\s+)?['"`]([^'"`]+)['"`]/g;
  const exportFromRegex = /\bexport\s+(?:type\s+)?(?:[\s\S]*?from\s+)?['"`]([^'"`]+)['"`]/g;

  lines.forEach((lineText, index) => {
    const lineNumber = index + 1;

    // Check each pattern on this line
    const patterns = [
      { regex: requireRegex, isTypeOnly: false },
      { regex: requireResolveRegex, isTypeOnly: false },
      { regex: dynamicImportRegex, isTypeOnly: false },
      { regex: staticImportRegex, isTypeOnly: lineText.includes('import type') },
      { regex: exportFromRegex, isTypeOnly: lineText.includes('export type') },
    ];

    for (const { regex, isTypeOnly } of patterns) {
      // Reset regex index for each line
      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(lineText)) !== null) {
        const rawSpecifier = match[1];
        const packageName = normalizePackageName(rawSpecifier, knownAliases);

        if (packageName) {
          results.push({
            packageName,
            rawSpecifier,
            line: lineNumber,
            isTypeOnly,
          });
        }
      }
    }
  });

  return results;
}

module.exports = {
  scanWithRegex,
  normalizePackageName,
  BUILTINS,
};
