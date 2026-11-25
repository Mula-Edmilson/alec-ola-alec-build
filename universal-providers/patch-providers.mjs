
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
export function patchText(source, models = []) {
  if (source.includes("ALEC_CLOUD_PROVIDERS_V1")) throw new Error("Already patched; no changes.");
  if (!Array.isArray(models) || models.length > 12 || models.some(m => typeof m !== "string" || !/^@cf\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(m))) throw new Error("Invalid Cloudflare model IDs.");
  models = [...new Set(models)];
  const probe = 'list = await fetchJsonOrThrow(listUrl, endpoint, { timeoutMs, signal });';
  const timeout = 'const p = await probe(key2 ? { ...server, apiKey: key2 } : server, { timeoutMs: 1500 });';
  for (const anchor of [probe, timeout]) if (source.split(anchor).length !== 2) throw new Error("Unknown bundle or ambiguous anchor; no changes.");
  const replacement = [
    '/* ALEC_CLOUD_PROVIDERS_V1 */',
    '    const alecCatalog = ' + JSON.stringify(models) + ';',
    '    const alecUrl = new URL(endpoint.baseUrl);',
    '    const alecPath = alecUrl.pathname.split("/").filter(Boolean);',
    '    const alecCloudflare = alecUrl.origin === "https://api.cloudflare.com" && alecPath.length === 6 && alecPath[0] === "client" && alecPath[1] === "v4" && alecPath[2] === "accounts" && /^[a-f0-9]{32}$/i.test(alecPath[3]) && alecPath[4] === "ai" && alecPath[5] === "v1";',
    '    if (alecCloudflare && alecCatalog.length) {',
    '      const alecRoot = alecUrl.origin + "/" + alecPath.slice(0,5).join("/");',
    '      const alecLists = await Promise.all(alecCatalog.map(async (id) => {',
    '        const url = alecRoot + "/models/search?per_page=50&search=" + encodeURIComponent(id);',
    '        const response = await fetchJsonOrThrow(url, endpoint, { timeoutMs, signal });',
    '        if (response.success !== true || !Array.isArray(response.result)) throw new Error("Cloudflare catalog unavailable");',
    '        return response.result.some(row => row && row.name === id) ? { id } : null;',
    '      }));',
    '      list = { data: alecLists.filter(Boolean) };',
    '      if (!list.data.length) throw new Error("No approved Cloudflare models found");',
    '    } else {',
    '      ' + probe,
    '    }'
  ].join(source.includes("\r\n") ? "\r\n" : "\n");
  return source.replace(probe, replacement).replace(timeout, 'const p = await probe(key2 ? { ...server, apiKey: key2 } : server, { timeoutMs: server.custom && server.baseUrl.startsWith("https://") ? 12000 : 1500 });');
}
const sha = b => createHash('sha256').update(b).digest('hex');
function run() {
  const [action = 'status', ...models] = process.argv.slice(2);
  if (!process.env.LOCALAPPDATA) throw new Error('Windows LOCALAPPDATA required.');
  const file = path.join(process.env.LOCALAPPDATA, 'Roamies', 'sidecar', 'sidekick.mjs');
  const original = fs.readFileSync(file);
  const source = original.toString('utf8');
  if (!Buffer.from(source, 'utf8').equals(original)) throw new Error('Invalid UTF-8; no changes.');
  const installed = source.includes('ALEC_CLOUD_PROVIDERS_V1');
  if (action === 'status') {
    console.log(JSON.stringify({ file, sha256: sha(original), installed, nativeCustomApi: source.includes('panel_local_add'), cloudProbeAnchor: source.includes('list = await fetchJsonOrThrow(listUrl, endpoint, { timeoutMs, signal });') }, null, 2));
    return;
  }
  if (action !== 'install' && action !== 'restore') throw new Error('Usage: status | install [@cf/author/model ...] | restore <manifest>');
  // Require Roamies closed so neither the application nor its updater competes for the file.
  if (process.platform !== 'win32') throw new Error('Windows required.');
  const tasks = execFileSync('tasklist.exe', ['/FO','CSV','/NH'], { encoding:'utf8', windowsHide:true });
  if (/"Roamies\.exe"/i.test(tasks)) throw new Error('Close Roamies completely before continuing.');
  const unique = Date.now().toString() + '-' + process.pid;
  const temp = file + '.alec-' + unique + '.mjs';
  let candidate, manifest;
  if (action === 'restore') {
    if (models.length !== 1) throw new Error('Specify exactly one manifest file.');
    manifest = JSON.parse(fs.readFileSync(models[0], 'utf8'));
    if (manifest.file !== file || sha(original) !== manifest.after || typeof manifest.backup !== 'string' || !manifest.backup.startsWith(file + '.alec-backup-')) throw new Error('Current file changed; refusing restore.');
    candidate = fs.readFileSync(manifest.backup);
    if (sha(candidate) !== manifest.before) throw new Error('Backup hash mismatch.');
  } else {
    candidate = Buffer.from(patchText(source, models), 'utf8');
  }
  try {
    fs.writeFileSync(temp, candidate, { flag:'wx' });
    execFileSync(process.execPath, ['--check',temp], { stdio:'inherit', windowsHide:true });
    if (sha(fs.readFileSync(file)) !== sha(original)) throw new Error('File changed concurrently.');
    const backup = file + '.alec-backup-' + unique;
    fs.copyFileSync(file, backup, fs.constants.COPYFILE_EXCL);
    if (sha(fs.readFileSync(backup)) !== sha(original)) throw new Error('Backup verification failed.');
    const record = file + '.alec-manifest-' + unique + '.json';
    fs.writeFileSync(record, JSON.stringify({file, backup, before:sha(original), after:sha(candidate)},null,2), {flag:'wx'});
    if (sha(fs.readFileSync(file)) !== sha(original)) throw new Error('File changed concurrently.');
    fs.renameSync(temp,file);
    console.log('Updated: '+file+'\nBackup: '+backup+'\nManifest: '+record);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { run(); } catch (e) { console.error(e.message); process.exitCode=1; }
}
