// src/why.js
// WHY: When a tool says a package is "used" or "unused", a beginner needs proof!
// The `why` command shows exact filenames and line numbers so the developer
// understands their project and can verify everything for themselves.

const { analyzeProject } = require('./analyzer');
const { createStyler } = require('./reporter');

/**
 * Explains in plain English why a package is used, unused, or missing.
 *
 * @param {string} projectDir
 * @param {string} targetPkg
 * @param {object} [options]
 * @param {boolean} [options.noColor=false]
 * @returns {number} Exit code
 */
function explainPackage(projectDir, targetPkg, options = {}) {
  const styler = createStyler(options.noColor);

  if (!targetPkg) {
    console.log(styler.red('❌ Please specify a package name to inspect.'));
    console.log(styler.dim('   Example: npx helpforbegs why lodash'));
    return 1;
  }

  const analysis = analyzeProject(projectDir);

  console.log();
  console.log(styler.bold(`🔍 Investigating "${targetPkg}" in your project:`));
  console.log();

  // 1. Check if it's missing (imported in code but not installed)
  const missingEntry = analysis.missing.find((m) => m.name === targetPkg);
  if (missingEntry) {
    console.log(styler.red(`⚠️  "${targetPkg}" is USED in your code, but MISSING from package.json!`));
    console.log('   Found in the following files:');
    for (const loc of missingEntry.locations) {
      console.log(`     • ${styler.cyan(loc.file)}:${styler.yellow(loc.line)}`);
    }
    console.log();
    console.log(styler.dim(`   👉 Fix: run \`npm install ${targetPkg}\` to add it properly.`));
    console.log();
    return 1;
  }

  // 2. Check if it's confirmed USED
  if (analysis.used.has(targetPkg)) {
    const usage = analysis.used.get(targetPkg);
    console.log(styler.green(`✅ "${targetPkg}" is ACTIVELY USED in your project.`));
    console.log();

    console.log('   Why it is kept:');
    for (const reason of usage.reasons) {
      console.log(`     • ${reason}`);
    }

    if (usage.locations.length > 0) {
      console.log();
      console.log('   Import locations in source code:');
      for (const loc of usage.locations) {
        const typeNote = loc.isTypeOnly ? styler.gray(' (type-only import)') : '';
        console.log(`     • ${styler.cyan(loc.file)}:${styler.yellow(loc.line)}${typeNote}`);
      }
    }

    console.log();
    return 0;
  }

  // 3. Check if it's PROBABLY UNUSED
  const probablyEntry = analysis.probablyUnused.find((p) => p.name === targetPkg);
  if (probablyEntry) {
    console.log(styler.yellow(`🤔 "${targetPkg}" is PROBABLY UNUSED.`));
    console.log(`   ${probablyEntry.reason}`);
    console.log();
    console.log('   Because this is a known development tool, check your npm scripts');
    console.log('   or config files before uninstalling it.');
    console.log();
    return 1;
  }

  // 4. Check if it's UNUSED
  const unusedEntry = analysis.unused.find((u) => u.name === targetPkg);
  if (unusedEntry) {
    console.log(styler.red(`❌ "${targetPkg}" is INSTALLED but UNUSED.`));
    console.log(`   ${unusedEntry.reason}.`);
    console.log(`   We scanned ${analysis.filesReadCount} files and found zero imports or script commands for it.`);
    console.log();
    console.log(styler.dim(`   👉 You can safely remove it with: \`npx helpforbegs remove\``));
    console.log();
    return 1;
  }

  // 5. Not found anywhere
  console.log(styler.gray(`ℹ️  "${targetPkg}" was not found in your package.json or your code.`));
  console.log();
  return 0;
}

module.exports = {
  explainPackage,
};
