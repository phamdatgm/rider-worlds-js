// npm run build step: the kit's check-export on this build's package (docs/GMSDK_JS/docs/EXPORT.md §5). The package
// folder export/build/<version>-<id> changes every build, so it is read from public/game.json here.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const game = JSON.parse(readFileSync('public/game.json', 'utf8'));
const dir = `export/build/${game.version}-${game.id}`;
const r = spawnSync(process.execPath, ['docs/GMSDK_JS/tools/check-export.mjs', dir, '--src', 'src', ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(r.status ?? 1);
