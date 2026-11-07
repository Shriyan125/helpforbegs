// src/messages.js
// WHY: Keeping all human-facing text in one place makes it easy to maintain,
// translate, review tone, and switch cleanly between friendly mode and roast mode.

const NORMAL_MESSAGES = {
  scanHeader: (filesCount) => `🔍 Scanning your project... (${filesCount} files read)`,
  monorepoNotice: (count) => `📦 Monorepo detected: merged dependencies across ${count} workspace folders.`,
  missingNodeModulesNotice: '💡 Tip: node_modules is missing. Run `npm install` for accurate folder sizes and script binary checks.',
  largeFileSkipped: (file, sizeMb) => `ℹ️  Skipped ${file} (${sizeMb} MB) because it exceeds the 1 MB safety limit.`,
  parseWarning: (warning) => `⚠️  ${warning} (fell back to regex scanning).`,

  unusedHeader: (count) => `❌ Installed but never used (${count})`,
  probablyHeader: (count) => `🤔 Probably unused (${count})`,
  missingHeader: (count) => `⚠️  Used but not installed (${count})`,
  usedHeader: (count) => `✅ ${count} package${count === 1 ? ' is' : 's are'} used correctly`,

  unusedItem: (pkg, reason) => `You installed ${pkg} but never used it.`,
  probablyItem: (pkg, reason) => `${reason || 'Detected as tooling with no direct script references; double check before removing.'}`,
  missingItem: (pkg, firstLoc) => `Used in ${firstLoc.file}:${firstLoc.line} but missing from package.json.`,

  scoreLabel: (score, grade, comment) => `📊 Health score: ${score}/100 (${grade}) "${comment}"`,
  spaceSaved: (sizeStr) => `💾 You could free about ${sizeStr}.`,
  cleanAllGood: '🎉 Congratulations! Your project dependencies are squeaky clean!',
  runRemoveTip: '💡 Run `npx helpforbegs remove` to clean up safely.',
  runDryRunTip: '💡 Run `npx helpforbegs remove --dry-run` to preview cleanup.',

  gradeComments: {
    'A+': 'Spotless! Everything installed has a clear purpose.',
    'A': 'Excellent! Clean, lean, and very well-organized.',
    'B': 'Pretty tidy, a few dusty corners.',
    'C': 'Getting cluttered; time for a quick spring cleaning.',
    'D': 'Heavy bag of unused packages slowing you down.',
    'F': 'Critical issues found! Missing packages could break your app at runtime.',
  },
};

const ROAST_MESSAGES = {
  scanHeader: (filesCount) => `🔍 Inspecting the crime scene... (${filesCount} files judged)`,
  monorepoNotice: (count) => `📦 Monorepo alert: you brought ${count} workspaces into this mess.`,
  missingNodeModulesNotice: '💡 Even node_modules refused to show up. Run `npm install` so we can see the full damage.',
  largeFileSkipped: (file, sizeMb) => `🐘 Skipped ${file} (${sizeMb} MB). Did you accidentally commit a movie?`,
  parseWarning: (warning) => `⚠️  ${warning}. Your syntax confused our parser, so we squinted at it with regex.`,

  unusedHeader: (count) => `❌ Digital hoarders club (${count} ghost dependencies)`,
  probablyHeader: (count) => `🤔 Living on borrowed time (${count} mystery packages)`,
  missingHeader: (count) => `⚠️  Playing with fire: imported but not installed (${count})`,
  usedHeader: (count) => `✅ ${count} package${count === 1 ? '' : 's'} actually paying rent in your code`,

  unusedItem: (pkg) => {
    const jokes = [
      `You installed ${pkg} months ago and never spoke to it again.`,
      `${pkg} is just taking up disk space and emotional energy.`,
      `Did you follow a 2017 tutorial and forget you installed ${pkg}?`,
      `${pkg} has been ghosted harder than a bad first date.`,
    ];
    // Return a consistent joke based on string hash
    const index = Math.abs(pkg.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)) % jokes.length;
    return jokes[index];
  },
  probablyItem: (pkg, reason) => `We saw ${pkg} lurking in the shadows. Check if you still need it before deleting.`,
  missingItem: (pkg, firstLoc) => `You imported ${pkg} in ${firstLoc.file}:${firstLoc.line} on pure faith without installing it!`,

  scoreLabel: (score, grade, comment) => `📊 Health roast: ${score}/100 (${grade}) "${comment}"`,
  spaceSaved: (sizeStr) => `💾 Removing these dead weights would free ${sizeStr} of sweet disk space.`,
  cleanAllGood: '🎉 Wow, not a single wasted byte. Are you sure you are a beginner?',
  runRemoveTip: '💡 Take out the trash with `npx helpforbegs remove`.',
  runDryRunTip: '💡 Too scared? Try `npx helpforbegs remove --dry-run` first.',

  gradeComments: {
    'A+': 'Suspiciously perfect. Did you write this in a cleanroom?',
    'A': 'Solid work! Marie Kondo would approve of this repo.',
    'B': 'Not bad, but a few neglected packages are crying for attention.',
    'C': 'Your package.json looks like an unfinished garage sale.',
    'D': 'More unused weight than a gym membership in March.',
    'F': 'An absolute danger zone! Your app will crash if you deploy this.',
  },
};

module.exports = {
  NORMAL_MESSAGES,
  ROAST_MESSAGES,
};
