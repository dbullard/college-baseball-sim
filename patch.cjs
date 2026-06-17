const fs = require('fs');
const path = './src/state/franchiseStore.ts';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  "const nextSave = { ...save };",
  "const nextSave = { ...save };\n  nextSave.eventLog = save.eventLog ?? [];\n  nextSave.complianceReviews = save.complianceReviews ?? [];"
);

fs.writeFileSync(path, content);
console.log("Patched franchiseStore.ts");
