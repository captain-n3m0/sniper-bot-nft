import fs from 'fs';
let code = fs.readFileSync('src/components/DropStages.tsx', 'utf8');

// The backslash escaping generated literal backslashes in the TSX file because I used 'EOF'.
// E.g. \` instead of just `

code = code.replace(/\\\`/g, '\`');
code = code.replace(/\\\$/g, '$');

fs.writeFileSync('src/components/DropStages.tsx', code);
