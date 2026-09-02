import fs from 'fs';
let code = fs.readFileSync('src/pages/Dashboard.tsx', 'utf8');

code = code.replace(
  '<GasEstimator addLog={addLog} />',
  '<GasEstimator addLog={addLog} selectedChain={selectedChain} />'
);

fs.writeFileSync('src/pages/Dashboard.tsx', code);
