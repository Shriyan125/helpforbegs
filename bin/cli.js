#!/usr/bin/env node

// bin/cli.js
// WHY: This is the executable entry point when someone runs `helpforbegs`
// or `npx helpforbegs` in their terminal.
// It coordinates argument parsing, routing to commands, and clean exit codes.

const path = require('path');
const { parseArgs } = require('../src/args');
const { analyzeProject } = require('../src/analyzer');
const { calculateScoreAndSavings } = require('../src/scorer');
const { reportResults } = require('../src/reporter');
const { explainPackage } = require('../src/why');
const { removeUnused } = require('../src/remover');
const pkgInfo = require('../package.json');

/**
 * Prints user-friendly help documentation.
 */
function printHelp() {
  console.log(`
helpforbegs - ${pkgInfo.description}

USAGE:
  $ npx helpforbegs [command] [options]

COMMANDS:
  scan               (default) Scans your project and prints the health report
  remove             Safely uninstalls unused packages after confirmation
  why <package>      Explains exactly where a package is used, or why it is unused
  score              Prints only the health score and letter grade

FLAGS:
  --path <dir>       Scan another directory (default: current directory)
  --dry-run          Preview what \`remove\` would uninstall without changing files
  --yes, -y          Confirm \`remove\` automatically (required in CI / non-TTY)
  --roast            Funny, gently sarcastic commentary
  --json             Output raw JSON data for scripts and CI
  --no-color         Disable ANSI terminal colors
  --help, -h         Show this help screen
  --version, -v      Show the version of helpforbegs
  --debug            Show technical stack traces on unexpected errors

EXAMPLES:
  $ npx helpforbegs
  $ npx helpforbegs --roast
  $ npx helpforbegs why lodash
  $ npx helpforbegs remove --dry-run
  $ npx helpforbegs --path ./my-app
`);
}

async function main() {
  const { command, targetPkg, flags } = parseArgs(process.argv.slice(2));

  // 1. --help / -h
  if (flags.help) {
    printHelp();
    process.exit(0);
  }

  // 2. --version / -v
  if (flags.version) {
    console.log(pkgInfo.version);
    process.exit(0);
  }

  const targetDir = flags.targetDir;

  try {
    if (command === 'why') {
      const exitCode = explainPackage(targetDir, targetPkg, flags);
      process.exit(exitCode);
    }

    if (command === 'remove') {
      const exitCode = await removeUnused(targetDir, flags);
      process.exit(exitCode);
    }

    // Default: 'scan' or 'score'
    const analysis = analyzeProject(targetDir);
    const scoreData = calculateScoreAndSavings(analysis, { roast: flags.roast });

    const exitCode = reportResults(analysis, scoreData, {
      ...flags,
      scoreOnly: command === 'score',
    });

    process.exit(exitCode);
  } catch (err) {
    // Exit code 2 for internal/input errors (no package.json, invalid JSON, etc.)
    if (err.code === 'NO_PKG_JSON' || err.code === 'INVALID_PKG_JSON') {
      console.error(`\n❌ ${err.message}\n`);
      process.exit(2);
    }

    console.error(`\n❌ An unexpected error occurred: ${err.message}`);
    if (flags.debug) {
      console.error(err.stack);
    } else {
      console.error('   Run with `--debug` to view the full technical stack trace.\n');
    }
    process.exit(2);
  }
}

main();
