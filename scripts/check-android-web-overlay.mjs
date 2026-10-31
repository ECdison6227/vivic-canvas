import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(process.argv[2]); let checked = 0, failed = 0;
function check(folder) {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) check(file);
    else if (entry.name.endsWith('.js')) {
      try { new vm.SourceTextModule(fs.readFileSync(file, 'utf8'), { identifier: file }); checked++; }
      catch (error) { console.error(path.relative(root, file), error.message); failed++; }
    }
  }
}
check(root); console.log(JSON.stringify({ checked, failed })); if (failed) process.exitCode = 1;
