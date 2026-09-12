// Release preflight for the deliberately non-AI production branch.
// Smart Scan is retained on codex/smart-scan and the development backup branch.
// Never read environment files, credentials, user records, or call an AI provider.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
function files(dir) {
  return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):[join(dir,e.name)]);
}
const forbidden = files('src').filter(file => /\.(tsx?|mjs)$/.test(file) && /api\.openai\.com|OPENAI_API_KEY|SMART_SCAN_ENABLED|scan-ai/.test(readFileSync(file,'utf8')));
const routes = ['src/app/(workspace)/scan','src/app/scan-image'].filter(existsSync);
if (forbidden.length || routes.length) {
  console.error('STOP: AI source or routes exist in this release. Review production scope before deployment.');
  process.exit(1);
}
console.log('PASS: production source has no Smart Scan routes, OpenAI adapter, key reference or AI enable flag.');
const build = process.argv[2];
if (build) {
  const manifest = JSON.parse(readFileSync(join(build,'server/app-paths-manifest.json'),'utf8'));
  if (Object.keys(manifest).some(p=>/\/(scan|scan-image)(\/|$)/.test(p))) throw new Error('AI_ROUTE_IN_BUILD');
  console.log('PASS: production build contains no Smart Scan route.');
}
