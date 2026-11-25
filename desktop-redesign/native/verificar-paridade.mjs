// Fail closed: all native functionality modules remain byte-identical to the pinned upstream.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import path from 'node:path';
const root=path.resolve(process.argv[2]||'upstream');
const git=(...a)=>execFileSync('git',['-C',root,...a],{encoding:'utf8',maxBuffer:16*1024*1024});
assert.equal(git('rev-parse','HEAD').trim(),'362645466349f4c520ad453d94a94c2481776c2f');
const allowed=new Set([
 'showcase/tauri/sidecar/sidekick.mjs','showcase/tauri/sidecar/speaker.mjs',
 'showcase/tauri/sidecar/fish.mjs','showcase/tauri/sidecar/local.mjs',
 'showcase/panel/index.html','showcase/panel/panel.js','showcase/panel/panel.css',
 'showcase/roamies/12-sidekick.js','showcase/roamies/jarvis.js','showcase/desktop.html','showcase/onboarding/onboarding.js',
 'showcase/tauri/src-tauri/tauri.conf.json','showcase/tauri/src-tauri/src/main.rs',
 'showcase/tauri/src-tauri/voice-win/src/main.rs','showcase/tauri/src-tauri/voice-win/src/wake.rs'
]);
for(const line of git('diff','--name-status','HEAD').trim().split('\n').filter(Boolean)){
 const [status,file]=line.trimEnd().split('\t');
 assert.equal(status,'M','No native source deletion, rename or replacement allowed: '+line);
 assert.ok(allowed.has(file),'Unexpected modification: '+file);
}
const newAllowed=new Set(['showcase/panel/alec-theme.css','showcase/tauri/sidecar/alec-bridge-supervisor.mjs','showcase/tauri/sidecar/alec-skill-hub.mjs','showcase/tauri/sidecar/alec-legacy-profile.mjs','showcase/tauri/sidecar/alec-wake-phrase.mjs','showcase/tauri/sidecar/test/alec-wake-phrase.test.mjs']);
for(const f of git('ls-files','--others','--exclude-standard').trim().split('\n').filter(Boolean))assert.ok(newAllowed.has(f),'Unexpected added source: '+f);
const before=f=>git('show','HEAD:'+f).replace(/\r\n/g,'\n');
const after=f=>readFileSync(path.join(root,f),'utf8').replace(/\r\n/g,'\n');
const refs=s=>[...s.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(m=>m[1]);
for(const file of ['showcase/desktop.html','showcase/panel/index.html']) assert.deepEqual(refs(after(file)),refs(before(file)),file+': native script chain');
const core='showcase/tauri/sidecar/';
const protectedPaths=git('ls-files','showcase/roamies',core,'showcase/tauri/src-tauri/hands-win','showcase/tauri/src-tauri/voice-win').trim().split('\n').filter(f=>!allowed.has(f));
assert.ok(protectedPaths.length>30,'Native module inventory incomplete');
const tools=after(core+'tools.mjs');
for(const n of ['draw','take_screenshot','read_window','act_in_app','pointer_drag','read_file','list_files','search_files','write_file','run_command','open','use_skill','install_skill','schedule_job','remember_commitment'])assert.ok(tools.includes("name: '"+n+"'"),'Missing native tool: '+n);
const source=after(core+'sidekick.mjs');
assert.ok(source.includes('tools: textChat ? [] : config.lite ? tools.filter((t) => LITE_TOOLS.has(t.name)) : tools'),'Full tool set must remain in full mode');
assert.ok(source.includes('const textChat = alecConversationOnly(config.provider,m);'),'Text-only gate missing');
assert.ok(source.includes('const alecConversationOnly = (provider, model) => provider === \'local\''),'Text-only gating must be restricted to local-compatible models');
assert.ok(source.includes('alecContext.run(remoteDevice'),'Remote context missing');
assert.ok(after('showcase/tauri/src-tauri/voice-win/src/wake.rs').includes('fn full_phrase_custom_and_native_fallback()'),'Missing wake phrase regression test');
assert.ok(after('showcase/tauri/src-tauri/voice-win/src/wake.rs').includes('fn the_phrase_and_its_near_misses()'),'Missing original wake tests');
assert.ok(after('showcase/tauri/src-tauri/voice-win/src/main.rs').includes('Some("wake_phrase")'),'Missing helper protocol');
console.log('Parity source gate OK: '+protectedPaths.length+' original tracked paths protected; all native script references preserved. Runtime behavior still requires tests.');
