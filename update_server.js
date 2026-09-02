const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const jobState = `
// --- Job Queue State ---
const scheduledJobs: any[] = [];
setInterval(async () => {
  const now = new Date();
  for (let i = scheduledJobs.length - 1; i >= 0; i--) {
    const job = scheduledJobs[i];
    if (new Date(job.targetTime) <= now) {
      console.log(\`Executing Scheduled Job: \${job.taskId}\`);
      scheduledJobs.splice(i, 1);
      
      // Execute mint for all wallets in job
      if (job.wallets && job.wallets.length > 0) {
        // Here we'd call the same blastToAll logic internally. 
        // For preview MVP, we just log it since the true params (contract etc)
        // are expected to be attached or parsed from the launchpad URL
        console.log(\`Minting for \${job.wallets.length} wallets on \${job.launchpadUrl}\`);
      }
    }
  }
}, 5000);
// -----------------------
`;

code = code.replace('async function startServer() {', jobState + '\nasync function startServer() {');

code = code.replace(
  '// For this preview/MVP, we\'ll just acknowledge the successful dispatch.',
  `scheduledJobs.push({ taskId, targetTime, launchpadUrl, wallets, chain });`
);

// We need to change the destructure from body
code = code.replace(
  'const { launchpadUrl, targetTime, walletIds, chain } = req.body;',
  'const { launchpadUrl, targetTime, wallets, chain } = req.body;'
);

code = code.replace(
  'if (!launchpadUrl || !targetTime || !walletIds || !walletIds.length) {',
  'if (!launchpadUrl || !targetTime || !wallets || !wallets.length) {'
);

code = code.replace(
  'walletCount: walletIds.length,',
  'walletCount: wallets.length,'
);

fs.writeFileSync('server.ts', code);
