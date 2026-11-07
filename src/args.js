// src/args.js
// WHY: We avoid heavy argument parsing libraries (like commander or yargs)
// to keep helpforbegs lightweight, fast to install, and dependency-free for CLI parsing.
// Parsing process.argv manually teaches us exactly how Node.js receives command-line inputs.

const path = require('path');

/**
 * Parses raw command-line arguments (process.argv.slice(2))
 * into an easy-to-use JavaScript object.
 *
 * @param {string[]} rawArgs - e.g. ['scan', '--roast', '--path', './my-app']
 * @returns {object} Parsed command, package target (for `why`), and options
 */
function parseArgs(rawArgs = process.argv.slice(2)) {
  const flags = {
    json: false,
    noColor: false,
    roast: false,
    targetDir: process.cwd(), // Default to the folder where the user ran the command
    dryRun: false,
    yes: false,
    help: false,
    version: false,
    debug: false,
    isInteractive: true, // Auto-adjusted below for CI / non-TTY
  };

  const positional = [];

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];

    if (arg === '--json') {
      flags.json = true;
    } else if (arg === '--no-color') {
      flags.noColor = true;
    } else if (arg === '--roast') {
      flags.roast = true;
    } else if (arg === '--dry-run') {
      flags.dryRun = true;
    } else if (arg === '--yes' || arg === '-y') {
      flags.yes = true;
    } else if (arg === '--help' || arg === '-h') {
      flags.help = true;
    } else if (arg === '--version' || arg === '-v') {
      flags.version = true;
    } else if (arg === '--debug') {
      flags.debug = true;
    } else if (arg === '--path') {
      // The user provided --path <directory>. Look at the next argument.
      const nextArg = rawArgs[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        flags.targetDir = path.resolve(process.cwd(), nextArg);
        i++; // Skip the directory string in the next loop iteration
      }
    } else if (arg.startsWith('--path=')) {
      // Support syntax like --path=./subfolder
      const customPath = arg.slice('--path='.length);
      flags.targetDir = path.resolve(process.cwd(), customPath);
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  // Determine the primary command:
  // e.g. `helpforbegs` -> 'scan'
  //      `helpforbegs scan` -> 'scan'
  //      `helpforbegs remove` -> 'remove'
  //      `helpforbegs why lodash` -> command: 'why', targetPkg: 'lodash'
  //      `helpforbegs score` -> 'score'
  let command = 'scan';
  let targetPkg = null;

  if (positional.length > 0) {
    const first = positional[0].toLowerCase();
    if (first === 'scan' || first === 'remove' || first === 'score') {
      command = first;
    } else if (first === 'why') {
      command = 'why';
      targetPkg = positional[1] || null; // e.g. 'why express' -> express
    } else {
      // If someone types `helpforbegs my-package` without saying 'why',
      // or an unknown command, we keep 'scan' or treat it safely.
      command = first;
    }
  }

  // TTY and CI detection:
  // WHY: If the CLI is run inside a script, redirected to a file (`helpforbegs > output.txt`),
  // or executed inside a CI pipeline (like GitHub Actions), process.stdout.isTTY is false.
  // In those environments:
  // 1. We must not emit ANSI escape color codes (they turn into messy symbols in text files).
  // 2. We cannot ask interactive readline questions (there is no human sitting at a keyboard).
  const isCI = Boolean(process.env.CI);
  const isNoColorEnv = Boolean(process.env.NO_COLOR);
  const isNotTTY = !process.stdout.isTTY;

  if (isCI || isNoColorEnv || isNotTTY || flags.noColor) {
    flags.noColor = true;
  }

  if (isCI || isNotTTY) {
    flags.isInteractive = false;
  }

  return {
    command,
    targetPkg,
    flags,
  };
}

module.exports = {
  parseArgs,
};
