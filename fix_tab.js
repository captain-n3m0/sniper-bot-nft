import fs from 'fs';
let code = fs.readFileSync('src/pages/Dashboard.tsx', 'utf8');
code = code.replace(
  "Whitelist Checker",
  "Eligibility Simulator"
);
fs.writeFileSync('src/pages/Dashboard.tsx', code);
