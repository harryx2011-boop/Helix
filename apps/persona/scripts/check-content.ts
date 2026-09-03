import { getPersonas, getRoles } from '../lib/catalog';

/**
 * Content gate: every role has a default persona, every persona parses, every
 * guide file resolves, every placeholder has a label. Run: pnpm check:content
 */
const roles = await getRoles();
const personas = await getPersonas();
const problems: string[] = [];

for (const role of roles) {
  const mine = personas.filter((p) => p.roleSlug === role.slug);
  if (mine.length === 0) problems.push(`${role.slug}: no personas`);
  if (mine.filter((p) => p.isDefault).length !== 1) problems.push(`${role.slug}: needs exactly one default persona (has ${mine.filter((p) => p.isDefault).length})`);
}
for (const p of personas) {
  if (!p.name || !p.tagline) problems.push(`${p.roleSlug}/${p.slug}: missing name or tagline`);
  if (!p.bodyMd.includes('## Core purpose')) problems.push(`${p.roleSlug}/${p.slug}: body lacks "## Core purpose"`);
  if (p.guides.length === 0) problems.push(`${p.roleSlug}/${p.slug}: no setup guides`);
  for (const ph of p.placeholders) if (!ph.label) problems.push(`${p.roleSlug}/${p.slug}: placeholder ${ph.key} has no label`);
}

console.log(`${roles.length} roles, ${personas.length} personas, ${personas.reduce((n, p) => n + p.guides.length, 0)} guides, ${personas.reduce((n, p) => n + p.placeholders.length, 0)} placeholders`);
if (problems.length) {
  console.error(problems.map((p) => `- ${p}`).join('\n'));
  process.exit(1);
}
console.log('content ok');
