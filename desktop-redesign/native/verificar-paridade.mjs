// Fail closed: all native functionality modules remain byte-identical to the pinned upstream.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import path from 'node:path';
const root=path.resolve(process.argv[2]||'upstream');
const git=(...a)=>execFileSync('git',['-C',root,...a],{encoding:'utf8',maxBuffer:16*1024*1024});
assert.equal(git('rev-parse','HEAD').trim(),'362645466349f4c520ad453d94a94c2481776c2f');
const allowed=new Set([
 'showcase/tauri/sidecar/test/fish.test.mjs',
 'showcase/tauri/src-tauri/build.rs',
 "showcase/tauri/src-tauri/icons/icon.ico","showcase/tauri/src-tauri/icons/32x32.png","showcase/tauri/src-tauri/icons/128x128.png","showcase/tauri/src-tauri/icons/128x128@2x.png","showcase/tauri/src-tauri/icons/icon.png","showcase/tauri/src-tauri/icons/icon.icns",
 'showcase/tauri/sidecar/sidekick.mjs','showcase/tauri/sidecar/speaker.mjs',
 'showcase/tauri/sidecar/test/prompt.test.mjs',
 'showcase/tauri/sidecar/test/snooze.test.mjs',
 'showcase/tauri/sidecar/fish.mjs','showcase/tauri/sidecar/local.mjs',
 'showcase/panel/index.html','showcase/panel/panel.js','showcase/panel/panel.css',
 "showcase/roamies/glass.js","showcase/roamies/agent.js","showcase/roamies/agent-cards.js","showcase/roamies/agent-panel.js","showcase/roamies/ink.js","showcase/roamies/sidebar.js","showcase/roamies/notch.js",
 'showcase/roamies/12-sidekick.js','showcase/roamies/jarvis.js','showcase/roamies/10-dither.js','showcase/roamies/ask-bar.js','showcase/roamies/core.js','showcase/roamies/host.js','showcase/desktop.html','showcase/onboarding/onboarding.js','showcase/onboarding/index.html',
 'showcase/tauri/src-tauri/tauri.conf.json','showcase/tauri/src-tauri/src/main.rs',
 'showcase/tauri/src-tauri/src/voice.rs',
 'showcase/tauri/src-tauri/voice-win/src/main.rs','showcase/tauri/src-tauri/voice-win/src/wake.rs'
]);
for(const line of git('diff','--name-status','HEAD').trim().split('\n').filter(Boolean)){
 const [status,file]=line.trimEnd().split('\t');
 assert.equal(status,'M','No native source deletion, rename or replacement allowed: '+line);
 assert.ok(allowed.has(file),'Unexpected modification: '+file);
}
const newAllowed=new Set(['showcase/tauri/sidecar/alec-qr-runtime.mjs','showcase/tauri/sidecar/alec-qrcode.cjs','showcase/tauri/sidecar/alec-local-context.mjs','showcase/tauri/sidecar/alec-voice-preference.mjs','showcase/panel/alec-theme.css','showcase/tauri/sidecar/alec-bridge-supervisor.mjs','showcase/tauri/sidecar/alec-skill-hub.mjs','showcase/tauri/sidecar/alec-legacy-profile.mjs','showcase/tauri/sidecar/alec-wake-phrase.mjs','showcase/tauri/sidecar/test/alec-wake-phrase.test.mjs']);
newAllowed.add('showcase/tauri/sidecar/alec-sigma-vision.mjs');
newAllowed.add('showcase/tauri/sidecar/alec-sigma-supervisor.mjs');
newAllowed.add('showcase/tauri/sidecar/alec-update.mjs');
newAllowed.add('showcase/tauri/sidecar/alec-trust.mjs');
newAllowed.add('showcase/tauri/sidecar/alec-learn.mjs');
for(const n of ['alec-cloud.mjs','alec-cloud-local.mjs','alec-evolution.mjs'])newAllowed.add('showcase/tauri/sidecar/'+n);
newAllowed.add('showcase/tauri/sidecar/alec-adaptive-memory.mjs');
for(const f of git('ls-files','--others','--exclude-standard').trim().split('\n').filter(Boolean))assert.ok(newAllowed.has(f),'Unexpected added source: '+f);
const before=f=>git('show','HEAD:'+f).replace(/\r\n/g,'\n');
const after=f=>readFileSync(path.join(root,f),'utf8').replace(/\r\n/g,'\n');
const refs=s=>[...s.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(m=>m[1]);
for(const file of ['showcase/desktop.html','showcase/panel/index.html','showcase/onboarding/index.html']) assert.deepEqual(refs(after(file)),refs(before(file)),file+': native script chain');
const core='showcase/tauri/sidecar/';
const protectedPaths=git('ls-files','showcase/roamies',core,'showcase/tauri/src-tauri/hands-win','showcase/tauri/src-tauri/voice-win').trim().split('\n').filter(f=>!allowed.has(f));
assert.ok(protectedPaths.length>30,'Native module inventory incomplete');
const tools=after(core+'tools.mjs');
for(const n of ['draw','take_screenshot','read_window','act_in_app','pointer_drag','read_file','list_files','search_files','write_file','run_command','open','use_skill','install_skill','schedule_job','remember_commitment'])assert.ok(tools.includes("name: '"+n+"'"),'Missing native tool: '+n);
const source=after(core+'sidekick.mjs');
assert.equal(after(core+'alec-adaptive-memory.mjs'),readFileSync(new URL('./alec-adaptive-memory.mjs',import.meta.url),'utf8').replace(/\r\n/g,'\n'),'Adaptive memory module integrity mismatch');
assert.ok(source.includes('tools: textChat ? [] : tools.filter(t=>(!config.lite||LITE_TOOLS.has(t.name))&&(!SIGMA_TOOL_NAMES.has(t.name)||alecSigma.available()))'),'Native tool availability and Sigma security gates must remain intact');
assert.equal(after(core+'alec-sigma-vision.mjs'),readFileSync(new URL('./alec-sigma-vision.mjs',import.meta.url),'utf8').replace(/\r\n/g,'\n'),'Sigma module integrity mismatch');
assert.ok(source.includes('const textChat = alecConversationOnly(config.provider,m);'),'Text-only gate missing');
assert.ok(source.includes('const alecConversationOnly = (provider, model) => provider === \'local\''),'Text-only gating must be restricted to local-compatible models');
assert.ok(source.includes('alecContext.run(remoteDevice'),'Remote context missing');
assert.ok(after('showcase/tauri/src-tauri/voice-win/src/wake.rs').includes('fn full_phrase_custom_and_native_fallback()'),'Missing wake phrase regression test');
assert.ok(after('showcase/tauri/src-tauri/voice-win/src/wake.rs').includes('fn the_phrase_and_its_near_misses()'),'Missing original wake tests');
assert.ok(after('showcase/tauri/src-tauri/voice-win/src/main.rs').includes('Some("wake_phrase")'),'Missing helper protocol');
// Only strengthen the one known assertion; the rest of the upstream test must remain byte-identical after newline normalization.
assert.equal(after("showcase/tauri/sidecar/test/prompt.test.mjs"),before("showcase/tauri/sidecar/test/prompt.test.mjs").replace("assert.match(side, /const agentish = !intro && !news && wantsAgent\\(text\\);/, 'a news turn never hatches an agent');","assert.match(side, /const agentish = !alecConversationNow\\(\\) && !intro && !news && wantsAgent\\(text\\);/, 'neither a conversation-only model nor a news turn hatches an agent');").replace("assert.match(side, /call about_roamies and answer from what it says\\. Don't invent features or settings it doesn't list\\./, 'the prompt sends app questions to about_roamies');","assert.match(side, /Questions about ALEC itself[^]*?call about_roamies \\(the internal ALEC manual tool\\) and answer from what it says\\. Never describe the original Roamies UI as the current ALEC interface\\./, 'the prompt sends ALEC app questions to the actual ALEC manual');").replace("assert.match(side, /name: 'about_roamies',[^]*?execute: async \\(\\) => aboutRoamies\\(/, 'about_roamies is a tool');","assert.match(side, /name: 'about_roamies',[^]*?execute: async \\(\\) => aboutAlec\\(/, 'compatibility tool uses the ALEC manual, not upstream Roamies instructions');"));
assert.equal(after("showcase/tauri/sidecar/test/snooze.test.mjs"),before("showcase/tauri/sidecar/test/snooze.test.mjs").replace("const args = /running\\.then\\(\\(\\) => prompt\\(([^)]*)\\)\\)/.exec(side)[1].split(',').map((a) => a.trim());","const call = /running\\.then\\(\\(\\) => alecContext\\.run\\(remoteDevice, async \\(\\) => \\{ alecBegin\\(remoteId\\); try \\{ return await prompt\\(([^)]*)\\); \\} catch\\(e\\) \\{ if\\(remoteId\\) alecFailed=true; throw e; \\} finally \\{ alecFinish\\(remoteId\\); \\} \\}\\)\\)/.exec(side);\n  assert.ok(call, 'enqueue calls prompt inside the remote context and finalizes the receipt');\n  const args = call[1].split(',').map((a) => a.trim());"));
const panelSource=after('showcase/panel/panel.js'),orbSource=after('showcase/roamies/jarvis.js'),desktopSource=after('showcase/roamies/10-dither.js');
assert.ok(orbSource.includes("revision:'ALEC_ORB_EVOLUTION_V1'"),'Approved Orb Evolution renderer is required');
assert.ok(panelSource.includes("id:'alec-main-orb'")&&panelSource.includes('return [alecDashboard()];')&&panelSource.includes("id:'alec-ask-launch'")&&panelSource.includes("act('ask',true)")&&panelSource.includes("type:'alec_panel_listen'"),'Dashboard must render orb and real native Ask launcher and voice controls');
assert.ok(desktopSource.includes('window.Roamie.alecOrb.paint(ctx'),'Floating desktop renderer must use smooth orb');
assert.ok(source.includes("kind:'alec_live'")&&source.includes("m.type==='alec_panel_ask'")&&source.includes("m.type==='alec_panel_listen'"),'Native event routes are required');
assert.ok(panelSource.includes("const ALEC_TOP=['home','conversations','vision','memory','remote','abilities','settings','about']"),'Approved navigation required');
assert.ok(panelSource.includes("id:'alec-ask-launch'")&&panelSource.includes("act('ask',true)")&&panelSource.includes("type:'alec_visual_report'")&&!panelSource.includes("id:'alec-ask-input'"),'Single native Ask bar: no duplicate Home composer');
const shell=after('showcase/tauri/src-tauri/src/main.rs');
assert.ok(shell.includes('const PANEL_W: f64 = 400.0;')&&shell.includes('const PANEL_H: f64 = 470.0;')&&!shell.includes('fn alec_panel_compact('),'One compact window, no expanded alternative');
assert.ok(shell.includes('.skip_taskbar(true)')&&shell.includes('hide_panel(&app2, "blur")'),'Popup closes on loss of focus');
assert.ok(source.includes('if(!config.alecCursorV4){delete config.avatarPin;config.alecCursorV4=true;}')&&!source.includes("config.avatarPin={corner:'bottom-right'"),'Do not force pin on cursor-follow avatar');
assert.ok(!source.includes("send({ type: 'update', install: false })")&&!source.includes("send({ type: 'update', install: true })")&&source.includes('await checkAlecRelease(VERSION)')&&!source.includes('alec_update_channel')&&!after('showcase/panel/panel.js').includes('Canal de actualizações'),'Only ALEC release discovery may run');
assert.equal(after(core+'alec-update.mjs'),readFileSync(new URL('./alec-update.mjs',import.meta.url),'utf8').replace(/\r\n/g,'\n'),'ALEC update module integrity mismatch');
assert.ok(after('showcase/panel/alec-theme.css').includes('.alec-bridge-check input[type=checkbox]'),'Remote checkbox layout fix required');
assert.ok(panelSource.includes('Edmilson Mula')&&!panelSource.includes('Digital Reach Out')&&!after('showcase/panel/index.html').includes('By Ken Kai'),'Restore ALEC author only in About');
assert.ok(shell.includes('KEY, "/v", "ALEC"')&&!shell.includes('KEY, "/v", "Roamies"'),'Independent Windows startup registration');
assert.ok(source.includes('fitLocalText(alecConversationHistory(msgs)')&&source.includes('alecTextSession.base,...received.slice(at)'),'Bound local context, preserve saved history');
assert.ok(after('showcase/panel/alec-theme.css').includes('#pane-conversations .alec-history{overflow:visible!important'),'Use same scrolling surface');
assert.ok(panelSource.includes('Baseado em Roamies (AGPL-3.0)')&&!panelSource.includes("group('Help'"),'Minimal About and no Help');
assert.ok(orbSource.includes('ctx.clip()')&&orbSource.includes('const strands=Array.from')&&orbSource.includes('const project='),'Transparent projected-3D filament shell');
assert.equal(readFileSync(path.join(root,'showcase/tauri/src-tauri/icons/icon.ico')).readUInt16LE(4),9,'Official multi-size ICO');
assert.ok(after('showcase/roamies/ask-bar.js').includes("submit.addEventListener('click'"),'Cursor ask send control missing');
assert.ok(after('showcase/roamies/core.js').includes("R.alecOrbOpen(true)")&&after('showcase/roamies/host.js').includes("invoke('alec_orb_open'"),'Floating orb must open native compact dashboard');
assert.ok(after('showcase/roamies/ask-bar.js').includes("type:'alec_panel_listen'"),'Floating Ask microphone must use real voice route');
assert.ok(desktopSource.includes('ALEC_NATIVE_SINGLE_BODY')&&!desktopSource.includes('}else J.body(k, bx / P, by / P, R / P, jst);'),'Legacy orb fallback must be absent');
assert.ok(orbSource.includes("mode==='talk'||mode==='listen'?level:0")&&orbSource.includes('st.reduced?0:')&&desktopSource.includes("look==='jarvis'?72:140"),'Audio-reactive compact renderer and reduced motion are required');
assert.ok(after('showcase/roamies/notch.js').includes('R.alecOrb.paint(gctx'),'Notch uses the same ALEC orb');
assert.ok(panelSource.includes('alec-official-logo')&&!panelSource.includes('https://github.com/Mula-Edmilson'),'Official logo and no personal/product GitHub links in About');
assert.ok(shell.includes('voice_owner.as_deref()==Some(label.as_str())'),'Only one overlay receives speech');
assert.ok(after(core+'speaker.mjs').includes('generation!==tries'),'Ignore stale speech-provider callbacks');
for(const f of ['glass.js','agent.js','agent-cards.js','agent-panel.js','ink.js','sidebar.js','notch.js','ask-bar.js'])assert.ok(!/#78ffe2\b|rgba?\(\s*120\s*,\s*255\s*,\s*226\b/i.test(after('showcase/roamies/'+f)),'Legacy brand accent in '+f);
assert.ok(source.includes("async function startAlecTailnet")&&source.includes("await detectTailnet()")&&source.includes("alecTailnetGeneration"),'Cancellable Tailscale discovery and managed start');
assert.ok(panelSource.includes("role:'switch'")&&panelSource.includes("alec_bridge_tailnet_start")&&panelSource.includes("alec_bridge_stop"),'Native Bridge toggle');
assert.ok(after(core+'alec-bridge-supervisor.mjs').includes("status','--json'")&&after(core+'alec-bridge-supervisor.mjs').includes("settings.tailnet?'100.64.0.0/10'"),'Authenticated tailnet state and private bind');
assert.ok(after('showcase/tauri/src-tauri/build.rs').includes('window_icon_path("icons/icon.ico")'),'PE icon explicitly bound');
assert.ok(source.includes('alecVoicePreference.get()')&&source.includes("alec_fish_reference_save")&&source.includes("execute: async () => aboutAlec("),'Independent voice settings and actual ALEC manual');
assert.ok(panelSource.includes('Voz personalizada · Fish Audio')&&panelSource.includes("alec_fish_reference_save"),'Editable Fish Audio reference field');
assert.ok(source.includes("['ultren', 'Amilcar',")&&!source.includes('your name is Ultren'),'Rename character without changing internal key');
assert.equal(after("showcase/tauri/sidecar/test/fish.test.mjs"),before("showcase/tauri/sidecar/test/fish.test.mjs").replace("assert.deepEqual(FISH_CHOICES.map((c) => c.id), ['drama-3', 's2.1-pro']);","assert.deepEqual(FISH_CHOICES.map((c) => c.id), ['s2.1-pro-free', 'drama-3', 's2.1-pro']);").replace("for (const c of FISH_CHOICES) { assert.ok(FISH_MODELS.includes(c.id) && c.id !== FREE_MODEL, c.id); assert.ok(c.perM > 0 && c.name, c.id); }","for (const c of FISH_CHOICES) { assert.ok(FISH_MODELS.includes(c.id) && c.name, c.id); assert.ok(c.id === FREE_MODEL ? c.perM === 0 : c.perM > 0, c.id); }\n  assert.equal(FISH_CHOICES[0].id, FREE_MODEL, 'ALEC defaults to the free model; paid models remain opt-in');").replace("Date.parse(FISH_CHOICES[0].promo.until)","Date.parse(FISH_CHOICES.find(c=>c.id==='drama-3').promo.until)"));
assert.ok(source.includes('alec_bridge_qr_renew')&&panelSource.includes('alecPairingCard')&&panelSource.includes('Código QR temporário'),'Native QR pairing controls');
assert.ok(after(core+'alec-qr-runtime.mjs').includes("'/api/pair/qr'")&&after(core+'alec-qr-runtime.mjs').includes('self.until=self.clock()+120')&&after(core+'alec-qr-runtime.mjs').includes('hmac.compare_digest'),'One-use private pairing endpoint');
assert.ok(after(core+'alec-qrcode.cjs').includes('MIT License'),'QR dependency license retained');
assert.ok(source.includes("if(l!=='jarvis')return;")&&source.includes("looks: LOOKS.filter(([id])=>id==='jarvis')"),'Only ALEC is selectable');
assert.ok(after('showcase/onboarding/onboarding.js').includes("look.radios('looks', LOOKS.filter(([id])=>id==='jarvis'), 'jarvis'")&&after('showcase/onboarding/index.html').includes('Bem-vindo ao ALEC'),'ALEC first-run identity');
for(const file of ['alec-trust.mjs','alec-learn.mjs','alec-cloud.mjs','alec-cloud-local.mjs','alec-evolution.mjs'])assert.equal(after(core+file),readFileSync(new URL('./'+file,import.meta.url),'utf8').replace(/\r\n/g,'\n'),'Trust/Learn integrity');
assert.ok(shell.includes('if window.label() != PANEL_LABEL { return; }')&&source.includes('m.alecLocalPanel!==true'),'Local panel approval boundary required');
const updaterConfig=JSON.parse(after('showcase/tauri/src-tauri/tauri.conf.json'));
assert.equal(updaterConfig.version,JSON.parse(readFileSync(new URL('./alec-version.json',import.meta.url),'utf8')).version);
assert.deepEqual(updaterConfig.plugins.updater.endpoints,['https://github.com/Mula-Edmilson/alec-ola-alec-build/releases/latest/download/latest.json']);
assert.equal(updaterConfig.plugins.updater.pubkey,(process.env.ALEC_UPDATER_PUBLIC_KEY||'').trim());
assert.equal(updaterConfig.bundle.createUpdaterArtifacts,!!updaterConfig.plugins.updater.pubkey);
assert.ok(shell.indexOf('#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]')>=0&&shell.indexOf('#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]')<shell.indexOf('const ALEC_SIGNED_UPDATE: bool'),'Rust crate attribute must precede updater declaration');
assert.ok(shell.includes('update.download_and_install')&&shell.includes('update.version!=expected')&&shell.includes('!ALEC_SIGNED_UPDATE'),'Native signed installer gate');
console.log('Parity source gate OK: '+protectedPaths.length+' original tracked paths protected; all native script references preserved. Runtime behavior still requires tests.');
