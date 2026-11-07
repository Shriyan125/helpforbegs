// src/analyzer.js
// WHY: This is the brain of helpforbegs. It collects findings from all our scanners
// (AST parser, config reader, scripts, bin mapper, peer dependencies, and safe-list)
// and sorts every package into one of four clear verdict buckets:
// 1. Used
// 2. Unused (high confidence)
// 3. Probably unused (tooling with uncertainty)
// 4. Missing (imported in code but forgotten in package.json)

const fs = require('fs');
const path = require('path');
const { findFiles } = require('./fileFinder');
const { parseImports } = require('./astParser');
const {
  extractPathAliases,
  readIgnoreFile,
  collectPeerDependencies,
  scanConfigFiles,
  checkDotenvInScripts,
} = require('./configReader');
const { mapInstalledBins, findBinUsageInScripts } = require('./binMapper');
const { isSafeListed } = require('./safeList');

/**
 * Resolves monorepo workspace directories if "workspaces" is defined in package.json.
 *
 * @param {string} projectDir
 * @param {string[]|object} workspacesConfig
 * @returns {string[]} List of absolute paths to workspace packages
 */
function resolveWorkspaces(projectDir, workspacesConfig) {
  const patterns = Array.isArray(workspacesConfig)
    ? workspacesConfig
    : (workspacesConfig && Array.isArray(workspacesConfig.packages) ? workspacesConfig.packages : []);

  const workspaceDirs = [];

  for (const pattern of patterns) {
    if (pattern.endsWith('/*')) {
      // e.g. "packages/*"
      const parentDir = path.join(projectDir, pattern.slice(0, -2));
      if (fs.existsSync(parentDir)) {
        try {
          const entries = fs.readdirSync(parentDir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory()) {
              const subDir = path.join(parentDir, entry.name);
              if (fs.existsSync(path.join(subDir, 'package.json'))) {
                workspaceDirs.push(subDir);
              }
            }
          }
        } catch {
          // Ignore directory read errors
        }
      }
    } else {
      // Direct directory path, e.g. "apps/web"
      const directDir = path.join(projectDir, pattern);
      if (fs.existsSync(path.join(directDir, 'package.json'))) {
        workspaceDirs.push(directDir);
      }
    }
  }

  return workspaceDirs;
}

/**
 * Main analysis function that scans a project folder and categorizes all dependencies.
 *
 * @param {string} projectDir - Absolute path to the project root
 * @param {object} [options]
 * @returns {object} Full analysis results
 */
function analyzeProject(projectDir, options = {}) {
  const pkgJsonPath = path.join(projectDir, 'package.json');

  // Verify that package.json exists
  if (!fs.existsSync(pkgJsonPath)) {
    const error = new Error(`No package.json found in ${projectDir}. Make sure you are in a Node.js project folder.`);
    error.code = 'NO_PKG_JSON';
    throw error;
  }

  // Parse package.json
  let rootPkgJson;
  try {
    const content = fs.readFileSync(pkgJsonPath, 'utf8');
    rootPkgJson = JSON.parse(content);
  } catch (err) {
    const error = new Error(`Could not read package.json in ${projectDir}. It contains invalid JSON syntax.`);
    error.code = 'INVALID_PKG_JSON';
    throw error;
  }

  // Check for monorepo workspaces
  const workspaceDirs = rootPkgJson.workspaces ? resolveWorkspaces(projectDir, rootPkgJson.workspaces) : [];
  const isMonorepo = workspaceDirs.length > 0;

  // Aggregate all declared dependencies across root and workspaces
  const declaredDeps = new Map(); // pkgName -> { isDev: boolean, definedIn: string }
  const workspacePkgNames = new Set();

  function registerDeps(pkgData, sourcePath) {
    if (pkgData.name) {
      workspacePkgNames.add(pkgData.name);
    }
    const regularDeps = pkgData.dependencies || {};
    const devDeps = pkgData.devDependencies || {};

    for (const dep of Object.keys(regularDeps)) {
      if (!declaredDeps.has(dep)) {
        declaredDeps.set(dep, { isDev: false, definedIn: sourcePath });
      }
    }
    for (const dep of Object.keys(devDeps)) {
      // If already in dependencies, regular dependency takes precedence
      if (!declaredDeps.has(dep)) {
        declaredDeps.set(dep, { isDev: true, definedIn: sourcePath });
      }
    }
  }

  registerDeps(rootPkgJson, 'package.json');

  for (const wsDir of workspaceDirs) {
    try {
      const wsPkgJson = JSON.parse(fs.readFileSync(path.join(wsDir, 'package.json'), 'utf8'));
      registerDeps(wsPkgJson, path.relative(projectDir, wsDir));
    } catch {
      // Ignore unparseable workspace package.json
    }
  }

  // Discover files to scan
  const { files, skippedLargeFiles } = findFiles(projectDir);
  const knownAliases = extractPathAliases(projectDir, rootPkgJson);
  const userIgnored = readIgnoreFile(projectDir);
  const peerDeps = collectPeerDependencies(projectDir);
  const { usedPackages: configPackages, hasTsConfig } = scanConfigFiles(projectDir);
  const { binToPkg, missingNodeModules } = mapInstalledBins(projectDir);

  // Collect scripts from root and workspaces
  const allScripts = { ...(rootPkgJson.scripts || {}) };
  for (const wsDir of workspaceDirs) {
    try {
      const wsPkg = JSON.parse(fs.readFileSync(path.join(wsDir, 'package.json'), 'utf8'));
      Object.assign(allScripts, wsPkg.scripts || {});
    } catch {
      // Ignore
    }
  }

  const binUsageInScripts = findBinUsageInScripts(allScripts, binToPkg);
  const dotenvInScripts = checkDotenvInScripts(allScripts);

  // Track code imports: pkgName -> Array<{ file: string, line: number, isTypeOnly: boolean }>
  const codeImports = new Map();
  const parseWarnings = [];
  let hasTypeScriptFiles = false;

  for (const fileObj of files) {
    if (fileObj.ext === '.ts' || fileObj.ext === '.tsx') {
      hasTypeScriptFiles = true;
    }

    try {
      const content = fs.readFileSync(fileObj.fullPath, 'utf8');
      const { imports, warning } = parseImports(content, fileObj.fullPath, { knownAliases });

      if (warning) {
        parseWarnings.push(warning);
      }

      for (const item of imports) {
        if (!codeImports.has(item.packageName)) {
          codeImports.set(item.packageName, []);
        }
        codeImports.get(item.packageName).push({
          file: fileObj.relativePath,
          line: item.line,
          isTypeOnly: item.isTypeOnly,
        });
      }
    } catch {
      parseWarnings.push(`Could not read file: ${fileObj.relativePath}`);
    }
  }

  // Build verdicts:
  const used = new Map(); // pkgName -> { locations: [], reasons: [] }
  const unused = [];
  const probablyUnused = [];
  const missing = [];

  // Helper to mark a package as used with a specific reason
  function markUsed(pkgName, reason, locations = []) {
    if (!used.has(pkgName)) {
      used.set(pkgName, { locations: [], reasons: [] });
    }
    const entry = used.get(pkgName);
    if (reason && !entry.reasons.includes(reason)) {
      entry.reasons.push(reason);
    }
    if (locations && locations.length > 0) {
      entry.locations.push(...locations);
    }
  }

  // 1. Evaluate all declared packages
  for (const [pkgName, meta] of declaredDeps.entries()) {
    let isFound = false;

    // a) Found in user .helpforbegsignore
    if (userIgnored.has(pkgName)) {
      markUsed(pkgName, 'Listed in .helpforbegsignore');
      continue;
    }

    // b) Found in source code imports
    if (codeImports.has(pkgName)) {
      markUsed(pkgName, 'Imported in source code', codeImports.get(pkgName));
      isFound = true;
    }

    // c) Found in package.json scripts (directly or via bin name)
    if (binUsageInScripts.has(pkgName)) {
      const uses = binUsageInScripts.get(pkgName);
      const scriptsList = uses.map((u) => `"${u.scriptName}"`).join(', ');
      markUsed(pkgName, `Executed in package.json scripts: ${scriptsList}`);
      isFound = true;
    } else {
      // Also check if the raw package name itself appears as a command in scripts
      const escaped = pkgName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const scriptRegex = new RegExp(`(^|[;&|\\s])${escaped}(\\s|$|[;&|])`);
      for (const [sName, sCmd] of Object.entries(allScripts)) {
        if (typeof sCmd === 'string' && scriptRegex.test(sCmd)) {
          markUsed(pkgName, `Referenced in script "${sName}"`);
          isFound = true;
          break;
        }
      }
    }

    // d) Found in config files (ESLint, Prettier, Babel, tsconfig)
    if (configPackages.has(pkgName)) {
      markUsed(pkgName, 'Referenced in project configuration files');
      isFound = true;
    }

    // e) Declared as a peerDependency by an installed package
    if (peerDeps.has(pkgName)) {
      markUsed(pkgName, 'Required as a peer dependency by another installed package');
      isFound = true;
    }

    // f) Handling @types/xyz packages
    if (pkgName.startsWith('@types/')) {
      const basePkg = pkgName.slice('@types/'.length);

      // If the base package is used in code or declared
      if (codeImports.has(basePkg) || declaredDeps.has(basePkg)) {
        markUsed(pkgName, `TypeScript definitions for used package "${basePkg}"`);
        isFound = true;
      }
      // Special rule: @types/node is used if project has any TS files or tsconfig.json
      else if (basePkg === 'node' && (hasTypeScriptFiles || hasTsConfig)) {
        markUsed(pkgName, 'TypeScript type definitions for Node.js runtime');
        isFound = true;
      }
    }

    // g) Special dotenv check:
    if (pkgName === 'dotenv') {
      if (isFound || dotenvInScripts) {
        markUsed(pkgName, dotenvInScripts ? 'Loaded via -r dotenv/config in scripts' : 'Imported in source code');
        continue;
      } else {
        unused.push({
          name: pkgName,
          isDev: meta.isDev,
          reason: 'Neither imported in code nor referenced with -r dotenv/config in scripts',
        });
        continue;
      }
    }

    // If already confirmed as used, we're done with this package
    if (isFound) {
      continue;
    }

    // h) Built-in safe-list check:
    // If a package is in the safe-list but wasn't found in scripts or configs,
    // we mark it as "probably unused" so the user is encouraged to double check
    // rather than accidentally breaking their tooling.
    if (isSafeListed(pkgName)) {
      probablyUnused.push({
        name: pkgName,
        isDev: meta.isDev,
        reason: 'Known development tool, but no active script or config reference was detected',
      });
      continue;
    }

    // Otherwise, high confidence UNUSED
    unused.push({
      name: pkgName,
      isDev: meta.isDev,
      reason: `Installed in ${meta.isDev ? 'devDependencies' : 'dependencies'} but never imported or referenced`,
    });
  }

  // 2. Detect missing packages (imported in code but not in package.json)
  for (const [pkgName, locations] of codeImports.entries()) {
    if (
      !declaredDeps.has(pkgName) &&
      !workspacePkgNames.has(pkgName) &&
      !userIgnored.has(pkgName)
    ) {
      missing.push({
        name: pkgName,
        locations,
      });
    }
  }

  return {
    projectDir,
    rootPkgJson,
    isMonorepo,
    workspacesCount: workspaceDirs.length,
    missingNodeModules,
    filesReadCount: files.length,
    skippedLargeFiles,
    parseWarnings,
    used,
    unused,
    probablyUnused,
    missing,
  };
}

module.exports = {
  analyzeProject,
  resolveWorkspaces,
};
