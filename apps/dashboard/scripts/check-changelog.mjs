// Fails when the changelog data and the repository disagree: a tag or a manifest version with no entry, an entry with
// no source, a wrong release kind, a commit that does not match its tag, or a list that does not descend by version.
// Needs full git history and tags (a shallow clone fails on purpose). Run: npm run check:changelog
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..', '..');
const { CHANGELOG, validateChangelog } = await import(new URL('../lib/changelog.ts', import.meta.url).href);

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
const problems = validateChangelog(CHANGELOG);

const tags = new Map(
  git('tag', '--list', 'v*')
    .split('\n')
    .filter((t) => /^v\d+\.\d+\.\d+$/.test(t))
    .map((t) => [t.slice(1), git('rev-parse', `${t}^{commit}`).trim()]),
);
if (tags.size === 0) problems.push('no version tags found; fetch the full history and tags before checking');

const manifest = new Set();
for (const line of git('log', '-p', '--format=', '--', 'package.json').split('\n')) {
  const m = /^\+\s+"version":\s*"(\d+\.\d+\.\d+)"/.exec(line);
  if (m) manifest.add(m[1]);
}
manifest.add(JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version);

const listed = new Map(CHANGELOG.map((e) => [e.version, e]));
const known = new Set([...tags.keys(), ...manifest]);

for (const v of known) if (!listed.has(v)) problems.push(`${v}: in ${tags.has(v) ? 'a git tag' : 'the manifest history'} but missing from the changelog`);

for (const e of CHANGELOG) {
  const tagCommit = tags.get(e.version);
  const inManifest = manifest.has(e.version);
  if (!tagCommit && !inManifest) problems.push(`${e.version}: no tag and no manifest version backs this entry`);
  if (e.kind === 'tagged' && !tagCommit) problems.push(`${e.version}: kind is tagged but no tag v${e.version} exists`);
  if (e.kind === 'untagged' && tagCommit) problems.push(`${e.version}: kind is untagged but tag v${e.version} exists`);
  if (e.kind === 'foreign-tag' && (!tagCommit || inManifest)) problems.push(`${e.version}: kind is foreign-tag but it is ${tagCommit ? 'in the manifest history' : 'not a tag'}`);
  if ((e.kind === 'untagged' || e.kind === 'baseline') && !inManifest) problems.push(`${e.version}: kind ${e.kind} needs a manifest version`);
  if (tagCommit && !tagCommit.startsWith(e.commit)) problems.push(`${e.version}: commit ${e.commit} is not where tag v${e.version} points (${tagCommit.slice(0, 7)})`);
  if (!tagCommit) {
    try {
      git('cat-file', '-e', `${e.commit}^{commit}`);
    } catch {
      problems.push(`${e.version}: commit ${e.commit} does not exist`);
    }
  }
}

if (problems.length > 0) {
  console.error(`changelog check failed (${problems.length}):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`changelog ok: ${CHANGELOG.length} entries, newest ${CHANGELOG[0].version}, ${tags.size} tags, ${manifest.size} manifest versions`);
