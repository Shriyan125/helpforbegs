// src/binMapper.js
// WHY: When a user installs CLI tools like "rimraf", "nodemon", or "eslint",
// they don't `require('rimraf')` in code. Instead, they write `"clean": "rimraf dist"`
// in package.json scripts.
// By reading each installed package's "bin" field in node_modules, we discover
// what terminal commands it provides, and we can check if the user runs those commands in their scripts.

const fs = require('fs');
const path = require('path');

// Standard fallback command mappings for common development tools.
// WHY: If a user hasn't run `npm install` yet, node_modules is missing.
// Having built-in knowledge of standard tool commands (e.g. `tsc` comes from `typescript`)
// ensures we still recognize script usage and avoid false positives!
const DEFAULT_KNOWN_BINS = new Map([
  ['tsc', 'typescript'],
  ['eslint', 'eslint'],
  ['prettier', 'prettier'],
  ['jest', 'jest'],
  ['nodemon', 'nodemon'],
  ['vite', 'vite'],
  ['webpack', 'webpack'],
  ['rimraf', 'rimraf'],
  ['cross-env', 'cross-env'],
  ['ts-node', 'ts-node'],
  ['tsx', 'tsx'],
  ['babel', '@babel/cli'],
  ['mocha', 'mocha'],
  ['vitest', 'vitest'],
  ['concurrently', 'concurrently'],
  ['npm-run-all', 'npm-run-all'],
]);

/**
 * Discovers CLI binary commands provided by all installed packages in node_modules.
 *
 * @param {string} projectDir - Root folder containing package.json and node_modules
 * @returns {{ binToPkg: Map<string, string>, pkgToBins: Map<string, string[]>, missingNodeModules: boolean }}
 */
function mapInstalledBins(projectDir) {
  // Pre-seed with known standard binaries as a safety baseline
  const binToPkg = new Map(DEFAULT_KNOWN_BINS);
  const pkgToBins = new Map();
  const nodeModulesPath = path.join(projectDir, 'node_modules');

  if (!fs.existsSync(nodeModulesPath)) {
    // If node_modules hasn't been installed yet, don't crash!
    // Simply report that node_modules is missing so the analyzer can inform the user.
    return {
      binToPkg,
      pkgToBins,
      missingNodeModules: true,
    };
  }

  function readPkgJson(pkgName, pkgJsonPath) {
    try {
      if (fs.existsSync(pkgJsonPath)) {
        const content = fs.readFileSync(pkgJsonPath, 'utf8');
        const pkgData = JSON.parse(content);

        if (pkgData.bin) {
          const bins = [];
          if (typeof pkgData.bin === 'string') {
            // If "bin" is a string, the command name defaults to the package name
            // (or unscoped name for scoped packages)
            const defaultBinName = pkgName.startsWith('@') ? pkgName.split('/')[1] : pkgName;
            binToPkg.set(defaultBinName, pkgName);
            bins.push(defaultBinName);
          } else if (typeof pkgData.bin === 'object' && pkgData.bin !== null) {
            for (const binName of Object.keys(pkgData.bin)) {
              binToPkg.set(binName, pkgName);
              bins.push(binName);
            }
          }

          if (bins.length > 0) {
            pkgToBins.set(pkgName, bins);
          }
        }
      }
    } catch {
      // Ignore unparseable or corrupted package.json files inside node_modules
    }
  }

  try {
    const entries = fs.readdirSync(nodeModulesPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      if (entry.name.startsWith('@')) {
        // Handle scoped packages like @babel/cli inside node_modules/@babel/
        const scopePath = path.join(nodeModulesPath, entry.name);
        try {
          const scopedEntries = fs.readdirSync(scopePath, { withFileTypes: true });
          for (const scopedEntry of scopedEntries) {
            if (scopedEntry.isDirectory()) {
              const fullPkgName = `${entry.name}/${scopedEntry.name}`;
              const pkgJsonPath = path.join(scopePath, scopedEntry.name, 'package.json');
              readPkgJson(fullPkgName, pkgJsonPath);
            }
          }
        } catch {
          // Skip unreadable scope folders
        }
      } else if (!entry.name.startsWith('.')) {
        // Standard non-scoped package
        const pkgJsonPath = path.join(nodeModulesPath, entry.name, 'package.json');
        readPkgJson(entry.name, pkgJsonPath);
      }
    }
  } catch {
    return {
      binToPkg,
      pkgToBins,
      missingNodeModules: false,
    };
  }

  return {
    binToPkg,
    pkgToBins,
    missingNodeModules: false,
  };
}

/**
 * Checks all package.json scripts to see which packages are executed via CLI commands.
 *
 * @param {Record<string, string>} scripts - The "scripts" object from package.json
 * @param {Map<string, string>} binToPkg - Map of commandName -> packageName
 * @returns {Map<string, Array<{ scriptName: string, command: string }>>} - Map of packageName -> where it was used
 */
function findBinUsageInScripts(scripts = {}, binToPkg = new Map()) {
  const usageByPkg = new Map();

  for (const [scriptName, scriptCmd] of Object.entries(scripts)) {
    if (typeof scriptCmd !== 'string') continue;

    // Check each known binary name to see if it is invoked as a word in the script
    for (const [binName, pkgName] of binToPkg.entries()) {
      // Escape regex special chars in command name
      const escapedBin = binName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Match the command as a standalone word or at the start of a command pipeline
      const wordRegex = new RegExp(`(^|[;&|\\s])${escapedBin}(\\s|$|[;&|])`);

      if (wordRegex.test(scriptCmd)) {
        if (!usageByPkg.has(pkgName)) {
          usageByPkg.set(pkgName, []);
        }
        usageByPkg.get(pkgName).push({
          scriptName,
          command: binName,
        });
      }
    }
  }

  return usageByPkg;
}

module.exports = {
  mapInstalledBins,
  findBinUsageInScripts,
};
