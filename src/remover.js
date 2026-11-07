// src/remover.js
// WHY: Deleting dependencies can be scary for beginners.
// This module provides triple safety:
// 1. Shows you the exact list before touching anything.
// 2. Creates a timestamped backup of your package.json first.
// 3. Detects your exact package manager (npm, yarn, pnpm, or bun) so your lockfile stays valid.

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');
const { analyzeProject } = require('./analyzer');
const { calculateScoreAndSavings } = require('./scorer');
const { createStyler } = require('./reporter');

/**
 * Detects which package manager the project uses by looking for lockfiles.
 *
 * @param {string} projectDir
 * @returns {{ name: string, uninstallCmd: string[] }}
 */
function detectPackageManager(projectDir) {
  if (fs.existsSync(path.join(projectDir, 'pnpm-lock.yaml'))) {
    return { name: 'pnpm', uninstallCmd: ['remove'] };
  }
  if (fs.existsSync(path.join(projectDir, 'yarn.lock'))) {
    return { name: 'yarn', uninstallCmd: ['remove'] };
  }
  if (fs.existsSync(path.join(projectDir, 'bun.lockb')) || fs.existsSync(path.join(projectDir, 'bun.lock'))) {
    return { name: 'bun', uninstallCmd: ['remove'] };
  }
  // Default to npm
  return { name: 'npm', uninstallCmd: ['uninstall'] };
}

/**
 * Prompts the user with a y/N question in the terminal.
 *
 * @param {string} question
 * @returns {Promise<boolean>}
 */
function askConfirmation(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      resolve(trimmed === 'y' || trimmed === 'yes');
    });
  });
}

/**
 * Executes the safe package removal process.
 *
 * @param {string} projectDir
 * @param {object} [options]
 * @param {boolean} [options.dryRun=false]
 * @param {boolean} [options.yes=false]
 * @param {boolean} [options.isInteractive=true]
 * @param {boolean} [options.noColor=false]
 * @returns {Promise<number>} Exit code (0 = success, 1 = aborted or failed)
 */
async function removeUnused(projectDir, options = {}) {
  const styler = createStyler(options.noColor);
  const pkgJsonPath = path.join(projectDir, 'package.json');

  if (!fs.existsSync(pkgJsonPath)) {
    console.log(styler.red(`❌ No package.json found in ${projectDir}`));
    return 1;
  }

  const analysis = analyzeProject(projectDir);
  const { sizedUnused } = calculateScoreAndSavings(analysis);

  if (sizedUnused.length === 0) {
    console.log();
    console.log(styler.green('✨ No unused packages found! Your project is already tidy.'));
    console.log();
    return 0;
  }

  console.log();
  console.log(styler.bold(`Found ${sizedUnused.length} unused package${sizedUnused.length === 1 ? '' : 's'} ready for removal:`));
  console.log();

  for (const item of sizedUnused) {
    const sizeStr = item.bytes > 0 ? styler.gray(`(${item.formattedSize})`) : '';
    console.log(`  • ${styler.red(item.name)} ${sizeStr}`);
  }
  console.log();

  const pm = detectPackageManager(projectDir);
  const pkgsToRemove = sizedUnused.map((u) => u.name);
  const timestamp = Date.now();
  const backupFileName = `package.json.helpforbegs.${timestamp}.bak`;
  const backupFilePath = path.join(projectDir, backupFileName);

  // Dry-run mode: explain what would happen without altering files
  if (options.dryRun) {
    console.log(styler.cyan(styler.bold('🔎 [DRY RUN] Simulation mode active. No changes will be made:')));
    console.log(`   1. Would create backup at: ${backupFileName}`);
    console.log(`   2. Would run: ${pm.name} ${pm.uninstallCmd.join(' ')} ${pkgsToRemove.join(' ')}`);
    console.log();
    return 0;
  }

  // Non-interactive or CI environments without --yes: refuse to run
  if (!options.isInteractive && !options.yes) {
    console.log(styler.yellow('⚠️  Interactive confirmation is disabled in non-interactive / CI environments.'));
    console.log(styler.dim('   Run again with `--yes` to confirm removal automatically:'));
    console.log(`   npx helpforbegs remove --yes`);
    console.log();
    return 1;
  }

  // Prompt user for confirmation unless --yes was passed
  if (!options.yes) {
    const confirmed = await askConfirmation(
      styler.bold(`Are you sure you want to uninstall these ${pkgsToRemove.length} packages? (y/N): `)
    );

    if (!confirmed) {
      console.log();
      console.log(styler.gray('Cleanup cancelled. No changes were made.'));
      console.log();
      return 0;
    }
  }

  // 1. Create timestamped backup of package.json
  try {
    fs.copyFileSync(pkgJsonPath, backupFilePath);
    console.log();
    console.log(styler.green(`🛡️  Created backup: ${backupFileName}`));
  } catch (err) {
    console.log(styler.red(`❌ Failed to create backup file: ${err.message}`));
    return 1;
  }

  // 2. Run the package manager uninstall command
  console.log(styler.cyan(`🚀 Running \`${pm.name} ${pm.uninstallCmd.join(' ')} ${pkgsToRemove.join(' ')}\`...`));
  console.log();

  return new Promise((resolve) => {
    const child = spawn(pm.name, [...pm.uninstallCmd, ...pkgsToRemove], {
      cwd: projectDir,
      stdio: 'inherit',
      shell: process.platform === 'win32', // Use shell on Windows for resolving npm.cmd
    });

    child.on('error', (err) => {
      console.log();
      console.log(styler.red(`❌ Failed to execute ${pm.name}: ${err.message}`));
      console.log(styler.yellow(`   Your package.json backup is saved at: ${backupFileName}`));
      resolve(1);
    });

    child.on('close', (code) => {
      console.log();
      if (code === 0) {
        console.log(styler.green('🎉 Successfully uninstalled unused packages!'));
        console.log(styler.dim(`   (Backup kept at ${backupFileName} just in case you ever want it back)`));
        console.log();
        resolve(0);
      } else {
        console.log(styler.red(`⚠️  ${pm.name} exited with status code ${code}.`));
        console.log(styler.yellow(`   You can restore your original package.json from: ${backupFileName}`));
        console.log();
        resolve(1);
      }
    });
  });
}

module.exports = {
  removeUnused,
  detectPackageManager,
  askConfirmation,
};
