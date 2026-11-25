// ALEC source migration. Run only in a disposable Roamies v0.1.51 checkout.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
function prepareSources(files, profile) {
  const out = {...files};
  const changes=[];
  const rep=(file, from, to)=>{
    const s=out[file];
    if(typeof s!=="string" || s.split(from).length!==2) throw new Error(`Missing or ambiguous anchor: ${file}: ${from.slice(0,120)}`);
    out[file]=s.replace(from,()=>to); changes.push(file);
  };
  const sc="showcase/tauri/sidecar/sidekick.mjs",sp="showcase/tauri/sidecar/speaker.mjs",fi="showcase/tauri/sidecar/fish.mjs",lo="showcase/tauri/sidecar/local.mjs",pa="showcase/panel/index.html",pj="showcase/panel/panel.js",pc="showcase/panel/panel.css",dj="showcase/roamies/12-sidekick.js",ja="showcase/roamies/jarvis.js",de="showcase/desktop.html",tc="showcase/tauri/src-tauri/tauri.conf.json",rs="showcase/tauri/src-tauri/src/main.rs";
  if(!/^[0-9a-f]{32}$/i.test(profile.voice) || !profile.name || profile.name.length>70 || !profile.bridge.startsWith("// ALEC_REMOTE_V11_HOOK")) throw new Error("Unsupported personalization");
  // Keep the V11 mailbox, PCM ownership/lease, and heartbeat implementation verbatim. It stays in this module so its enqueue reference is lexical.
  rep(sc,"const ui = (msg) => {","const ui = (msg) => {\n  alecUi(msg); msg = alecVoiceMirror(msg);");
  rep(sc,"const ob = (msg) => send({ type: 'onboard', msg });","const ob = (msg) => { alecUi(msg); msg = alecVoiceMirror(msg); return send({ type: 'onboard', msg }); };");
  rep(sc,"const speech = createSpeaker({","const speech = createSpeaker({\n  alecSpeechOrigin, alecSay,");
  rep(sc,"news = null } = {}) {\n  if (interrupt && busy)","news = null, remoteId = null, remoteDevice = null } = {}) {\n  if (interrupt && busy)");
  rep(sc,"running = running.then(() => prompt(text, image, note, byVoice, news, listenAfter)).catch((e) => console.error('prompt', e))","running = running.then(() => alecContext.run(remoteDevice, async () => { alecBegin(remoteId); try { return await prompt(text, image, note, byVoice, news, listenAfter); } catch(e) { if(remoteId) alecFailed=true; throw e; } finally { alecFinish(remoteId); } })).catch((e) => console.error('prompt', e))");
  rep(sc,"enqueue(r.text, { image: r.image, note: r.note, byVoice: r.byVoice, listenAfter: r.listenAfter, news: r.news });","enqueue(r.text, { image: r.image, note: r.note, byVoice: r.byVoice, listenAfter: r.listenAfter, news: r.news, remoteDevice: alecContext.getStore() || null });");
  rep(sc,"function onVoice(m) {","function onVoice(m) {\n  alecMic(m);");
  rep(sc,"else if (m.type === 'reply_said') {","else if (m.type === 'reply_said') { alecStopSpeech();");
  rep(sc,"if (config.onboarded) warmUp();","if (config.onboarded) warmUp();\nalecReady = true;");
  rep(sp,"export function createSpeaker({ emit,","export function createSpeaker({ alecSpeechOrigin = () => {}, alecSay = () => {}, emit,");
  rep(sp,"const id = `s${++seq}`, said = [], t0 = Date.now();","const id = `s${++seq}`, said = [], t0 = Date.now(); alecSpeechOrigin(id);");
  rep(sp,"const id = `s${++seq}`, said = [];","const id = `s${++seq}`, said = []; alecSpeechOrigin(id);");
  rep(sp,"say(s) { if (done) return; said.push(s); v.say(s); },","say(s) { if (done) return; alecSay(id,s); said.push(s); v.say(s); },");
  rep(sp,"say(s) { if (done) return; mark(s); said.push(s); v.say(s); },","say(s) { if (done) return; alecSay(id,s); mark(s); said.push(s); v.say(s); },");
  rep(sp,"log('speech_beat', { id, ms: Date.now() - t0 });","alecSay(id,phrase); log('speech_beat', { id, ms: Date.now() - t0 });");
  // Personalized voice, kept local. Preserve the user's explicit free-only configuration.
  rep(sc,"const lookVoice = () => (LOOKS.find(([id]) => id === config.look) ?? LOOKS[0])[2];",`const lookVoice = () => ${JSON.stringify(profile.voice)};`);
  rep(fi,"text: '', reference_id: voice, format: 'pcm'",`text: '', reference_id: ${JSON.stringify(profile.voice)}, format: 'pcm'`);
  rep(fi,"export const FISH_MODELS = ['drama-3', 's2.1-pro', 's2.1-pro-free'];","export const FISH_MODELS = ['s2.1-pro-free'];");
  const choices=out[fi].match(/export const FISH_CHOICES = \[[\s\S]*?\n\];/)?.[0];if(!choices)throw Error("FISH_CHOICES anchor");
  rep(fi,choices,"export const FISH_CHOICES = [{ id: 's2.1-pro-free', name: 'S2.1 Pro Free', perM: 0 }];");
  const user=out[sc].match(/const userName = \(\(\) => \{[\s\S]*?\n\}\)\(\);/)?.[0];if(!user)throw Error("userName anchor");
  rep(sc,user,`const userName = ${JSON.stringify(profile.name)};`);
  // Re-register chat models without elevating their privileges. Text-only requests do not get tools or images.
  rep(lo,"export const localModels = (probes, windows = new Map()) => toolModels(probes, windows).filter((m) => m.supportsImages);",`export const localModels = (probes, windows = new Map()) => toolModels(probes, windows).filter((m) => m.supportsImages);
const alecChatModels = (probes, windows = new Map()) => probes.filter(p => p.reachable).flatMap(p => p.models.filter(m => m.supportsChat !== false).map(m => {
  const info = toModelInfo(m, p.endpoint);
  if (m.contextWindowKnown) return info;
  if (windows.has(info.id)) return withWindow(info, windows.get(info.id));
  return p.endpoint.custom ? withWindow(info, MIN_CONTEXT) : info;
}));`);
  rep(lo,"const p = await probe(key ? { ...server, apiKey: key } : server, { timeoutMs: 1500 });","const p = await probe(key ? { ...server, apiKey: key } : server, { timeoutMs: server.custom && server.baseUrl.startsWith('https://') ? 12000 : 1500 });");
  rep(lo,"const usable = toolModels([p], windows), models = usable.filter((m) => m.supportsImages);","const usable = alecChatModels([p], windows), models = usable;");
  rep(lo,"text: usable.length - models.length","text: usable.filter(m => !m.supportsImages).length");
  rep(sc,"const canRun = (p, id) => !!signedIn.get(p) && seesImages(p, id) && getAuthStorageKeys(p, id).some((k) => k === p || storedKeys.has(k));",`const alecConversationOnly = (provider, model) => provider === 'local' && !!model && (model.supportsTools !== true || model.supportsImages !== true);
const alecConversationNow = () => alecConversationOnly(config.provider, getModel(config.model));
const canRun = (p, id) => !!signedIn.get(p) && (p === 'local' || seesImages(p,id)) && getAuthStorageKeys(p,id).some(k => k === p || storedKeys.has(k));`);
  rep(sc,"const textOnly = (p) => getModelsForProvider(p).filter((m) => !seesImages(p, m.id) && canRunText(p, m.id));","const textOnly = (p) => p === 'local' ? [] : getModelsForProvider(p).filter((m) => !seesImages(p, m.id) && canRunText(p, m.id));");
  rep(sc,"const crewNow = () => (config.subagents ?","const crewNow = () => (config.subagents && !alecConversationNow() ?");
  rep(sc,"const hybridActive = () => !!config.hybrid && hybridOn(config.heavy);","const hybridActive = () => !!config.hybrid && !alecConversationNow() && hybridOn(config.heavy);");
  rep(sc,"const runnableSpec = (p, id) => canRun(p, id) || (p === 'local' && !!signedIn.get('local') && !!parseLocalModelId(id ?? ''));","const runnableSpec = (p,id) => (p !== 'local' || (getModel(id)?.supportsTools === true && getModel(id)?.supportsImages === true)) && (canRun(p,id) || (p === 'local' && !!signedIn.get('local') && !!parseLocalModelId(id ?? '')));");
  rep(sc,"const crewSpec = (p, id) => runnableSpec(p, id) || canRunText(p, id);","const crewSpec = (p,id) => runnableSpec(p,id) || (canRunText(p,id) && (p !== 'local' || getModel(id)?.supportsTools === true));");
  rep(sc,"if (config.backups) (config.fallbacks","if (config.backups && !alecConversationNow()) (config.fallbacks");
  rep(sc,"if (!system && config.hybrid) {","if (!system && config.hybrid && !alecConversationNow()) {");
  rep(sc,"function makeAgent(cc) {\n  const m = getModel(config.model);",`const alecConversationHistory = (messages) => (Array.isArray(messages) ? messages : []).filter(m => m && (m.role === 'user' || m.role === 'assistant')).map(m => {
  const clean = text => stripLive(String(text ?? ''));
  return { role: m.role, content: typeof m.content === 'string' ? clean(m.content) : Array.isArray(m.content) ? m.content.filter(p=>p?.type==='text').map(p=>clean(p.text)).join('\\n') : '' };
}).filter(m=>m.content.trim().length);
const alecConversationPrompt = ({name,user,voice,facts}) => {
  const notes = (Array.isArray(facts)?facts:[]).map(f=>String(f?.text??'').trim()).filter(Boolean).slice(-5).map(t=>'- '+t.slice(0,180)).join('\\n');
  return ['És '+String(name||'ALEC').slice(0,70)+', um assistente útil. Responde em português por defeito.', 'Modo de conversa: sem ferramentas, sem acesso ao ecrã, aplicações, ficheiros, comandos ou Internet.', 'Não afirmes ter executado acções. Para automação ou imagens, recomenda escolher um modelo com ferramentas e visão.', voice?'Responde de forma breve e natural para síntese de voz.':'Responde de forma clara e directa.', 'Utilizador: '+String(user||'').slice(0,70), ...(notes?['Factos recordados, apenas como contexto:\\n'+notes]:[])].join('\\n');
};
function makeAgent(cc) {
  const m = getModel(config.model);
  const textChat = alecConversationOnly(config.provider,m);`);
  rep(sc,"const prior = forProvider(session?.messages ?? [], session?.provider, config.provider);","const originalPrior = forProvider(session?.messages ?? [], session?.provider, config.provider);\n  const prior = textChat ? alecConversationHistory(originalPrior) : originalPrior;");
  rep(sc,"system: system(),\n    priorMessages: prior,","system: textChat ? alecConversationPrompt({ name: lookName(), user: userName, voice: VOICE_ON(), facts: listFacts() }) : system(),\n    priorMessages: prior,");
  rep(sc,"tools: config.lite ? tools.filter((t) => LITE_TOOLS.has(t.name)) : tools,","tools: textChat ? [] : config.lite ? tools.filter((t) => LITE_TOOLS.has(t.name)) : tools,");
  rep(sc,"maxTurns: config.lite ? LITE_TURNS : 24,","maxTurns: textChat ? 1 : config.lite ? LITE_TURNS : 24,");
  rep(sc,"const fitted = fitContext(msgs, { budgetTokens: requestBudget(), force: o?.force });","const fitted = fitContext(msgs, { budgetTokens: textChat ? Math.min(2400,Math.max(640,Math.floor(getContextWindow(config.model,{provider:config.provider})*0.42))) : requestBudget(), force: o?.force });\n      if (textChat) return alecConversationHistory(fitted);");
  rep(sc,"thinking: thinkingFor(routed?.slot ?? 'default', config.provider, config.model),","thinking: textChat ? undefined : thinkingFor(routed?.slot ?? 'default', config.provider, config.model),");
  rep(sc,"if (notReady) return say(notReady, 'concerned');\n  busy = true;","if (notReady) return say(notReady, 'concerned');\n  if (alecConversationNow() && image) return say('Este modelo está em modo conversa e não aceita imagens. Escolhe um modelo com visão e ferramentas.', 'concerned');\n  busy = true;");
  rep(sc,"const agentish = !intro && !news && wantsAgent(text);","const agentish = !alecConversationNow() && !intro && !news && wantsAgent(text);");
  rep(sc,"frontNow = await frontWithin(soon && Date.now() - soon.at < 8000 ? soon.p : whereNow());","frontNow = alecConversationNow() ? '' : await frontWithin(soon && Date.now() - soon.at < 8000 ? soon.p : whereNow());");
  rep(sc,"models: on ? runnable(p).map((mm) => ({ id: mm.id, name: mm.name, levels:","models: on ? runnable(p).map((mm) => ({ id: mm.id, name: p === 'local' && alecConversationOnly(p,mm) ? mm.name + ' · conversa' : mm.name, levels:");
  rep(sc,"that can see your screen.`","with different capabilities.`");
  // Native branding and theme; keep all event contracts and settings pages.
  rep(sc,"['jarvis', 'JARVIS',","['jarvis', 'ALEC',");
  rep(sc,"look: 'classic', introDone: false","look: 'jarvis', introDone: false");
  out[sc]=profile.bridge.trimEnd()+"\n\n"+out[sc];
  rep(pa,"<title>Roamies</title>","<title>ALEC</title>");
  rep(pa,'<h1 id="title">Roamies</h1>','<h1 id="title">ALEC</h1>');
  rep(pa,'<link rel="stylesheet" href="panel.css">','<link rel="stylesheet" href="panel.css">\n<link rel="stylesheet" href="alec-theme.css">');
  rep(de,"<title>Roamies on the desktop</title>","<title>ALEC on the desktop</title>");
  rep(dj,"pal: [[4, 16, 18], [14, 92, 96], [40, 196, 184], [120, 255, 226], [230, 255, 250]],","pal: [[7,10,18], [36,45,91], [96,110,205], [166,186,255], [234,242,255]],");
  rep(pj,"const LED = [[4, 16, 18], [14, 92, 96], [40, 196, 184], [120, 255, 226], [230, 255, 250]];","const LED = [[7,10,18], [36,45,91], [96,110,205], [166,186,255], [234,242,255]];");
  // Preserve the actual renderer and its cursor/readout; make the sphere breathe, with real native voice amplitude.
  rep(ja,"const DOTS = { default: sphere(520), small: sphere(260) };","const DOTS = { default: sphere(720), small: sphere(300) };");
  rep(ja,"mode === 'think' ? 1.6 : A === 'hype' ? 3 : st.sleepy > 0.5 ? 0.1 : 0.32","mode === 'think' ? 1.6 : A === 'hype' ? 3 : st.sleepy > 0.5 ? 0.08 : 0.18");
  rep(ja,"const wavy = mode === 'talk' || mode === 'listen' ? v : A === 'hype' ? 0.7 : 0.12;","const wavy = mode === 'talk' || mode === 'listen' ? v : A === 'hype' ? 0.7 : 0.16;");
  out["showcase/panel/alec-theme.css"]=`
/* ALEC Native Theme — preserves layout, IDs, events and accessibility. */
:root { --bg:#070a12; --panel:#101622; --ink:#eaf2ff; --ink-2:#b8c4da; --ink-3:#8b9bb5;
 --accent:#a6baff; --accent-hi:#d6e0ff; --accent-lo:#8495e1; --accent-ink:#080c17;
 --line:#252f43; --line-hi:#435473; --line-hot:#8194dc; --danger:#ff9b9b;
 --display:"Segoe UI",system-ui,sans-serif; --mono:"Segoe UI",system-ui,"Roamies Arabic",sans-serif; }
.frame { background:var(--bg); border-radius:13px; }
.head { padding-top:10px; padding-bottom:10px; }
.who h1 { font-weight:650; letter-spacing:.12em; }
.avatar { background:none; }
.px,.px::before { clip-path:none; border-radius:8px; }
.px { --bw:1px; }
.navi[aria-current="page"], .looktile[aria-checked="true"] { --fill:#1b2540; --bc:#8296e8; }
.frame.opening { animation:alec-open 180ms ease-out both; }
.frame.shutting { animation:alec-close 120ms ease-in both; }
@keyframes alec-open { from {opacity:0;transform:translateY(3px) scale(.99)} to {opacity:1;transform:none} }
@keyframes alec-close { from {opacity:1} to {opacity:0} }
.pane.enter > *, .pane.enter .list > li { animation:alec-in 150ms ease-out both; }
@keyframes alec-in { from {opacity:0} to {opacity:1} }
@media(prefers-reduced-motion:reduce){.frame.opening,.frame.shutting,.pane.enter > *,.pane.enter .list > li {animation:none!important}}
`;
  // Distinct installer identity. Disable the original updater rather than allowing upstream releases to overwrite ALEC.
  const cfg=JSON.parse(out[tc]); if(cfg.version!=="0.1.51"||cfg.identifier!=="com.kenkai.roamies")throw Error("Unexpected Tauri version");
  cfg.productName="ALEC";cfg.identifier="com.digitalreachout.alec";cfg.bundle.createUpdaterArtifacts=false;
  // Keep the upstream updater plugin config present for initialization but deny all update commands at the Rust boundary.
  out[tc]=JSON.stringify(cfg,null,2)+"\n";
  rep(rs,"fn update(app: &AppHandle, install: bool) {","fn update(app: &AppHandle, _install: bool) {\n    to_sidecar(app, &json!({ \"type\":\"update_status\", \"state\":\"error\", \"message\":\"ALEC updates are managed separately.\" }));\n}\n#[allow(dead_code)]\nfn upstream_update_disabled(app: &AppHandle, install: bool) {");
  rep(rs,'.title("Roamies")\n                .', '.title("ALEC")\n                .'); // panel
  rep(rs,'.title("Roamies")\n            .', '.title("ALEC")\n            .'); // overlay
  rep(rs,'.tooltip("Roamies")','.tooltip("ALEC")');
  return {out,changes};
}
const paths=["showcase/tauri/sidecar/sidekick.mjs","showcase/tauri/sidecar/speaker.mjs","showcase/tauri/sidecar/fish.mjs","showcase/tauri/sidecar/local.mjs","showcase/panel/index.html","showcase/panel/panel.js","showcase/panel/panel.css","showcase/roamies/12-sidekick.js","showcase/roamies/jarvis.js","showcase/desktop.html","showcase/tauri/src-tauri/tauri.conf.json","showcase/tauri/src-tauri/src/main.rs"];
const [rootArg,legacyArg]=process.argv.slice(2);
if(!rootArg||!legacyArg){console.error('Usage: node preparar-fonte.mjs <fresh-upstream-checkout> <private-sidekick.mjs>');process.exit(1);}
const root=path.resolve(rootArg),legacyPath=path.resolve(legacyArg);
if(legacyPath.startsWith(root+path.sep))throw Error('Keep private sidekick outside the source checkout.');
const original=fs.readFileSync(legacyPath);
if(createHash('sha256').update(original).digest('hex')!=='4bd3e971b6ad039475ff52f23db5a7ded801a12c61189ab18ec96c303ddddfab')throw Error('Private bundle differs from the audited snapshot. No changes.');
const legacy=original.toString('utf8').replace(/\r\n/g,'\n');
const marker="import { createRequire as __cr } from 'node:module';";
const boundary=legacy.indexOf(marker);
if(boundary<0||!legacy.startsWith('// ALEC_REMOTE_V11_HOOK')||boundary>20000)throw Error('Bridge boundary mismatch.');
const voice=legacy.match(/var lookVoice = \(\) => ['"]([a-f0-9]{32})['"];/i)?.[1];
const reference=legacy.match(/reference_id: ['"]([a-f0-9]{32})['"],/i)?.[1];
const name=legacy.match(/\/\* ROAMIES_NOME_PERSONALIZADO \*\/ return "([^"\n]{1,70})";/)?.[1];
if(!voice||voice!==reference||!name||!legacy.includes('var FISH_MODELS = ["s2.1-pro-free"];'))throw Error('Voice/name migration anchors not found.');
const actual=execFileSync('git',['-C',root,'describe','--tags','--exact-match','HEAD'],{encoding:'utf8'}).trim();
if(actual!=='v0.1.51')throw Error('Only v0.1.51 is supported.');
if(execFileSync('git',['-C',root,'status','--porcelain'],{encoding:'utf8'}).trim())throw Error('Use a clean disposable checkout.');
const files=Object.fromEntries(paths.map(p=>[p,fs.readFileSync(path.join(root,p),'utf8').replace(/\r\n/g,'\n')]));
const {out,changes}=prepareSources(files,{voice,name,bridge:legacy.slice(0,boundary)});
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'alec-check-'));
try{
 for(const [p,s] of Object.entries(out)){
  if(s===files[p]||! /\.(?:mjs|js)$/.test(p))continue;
  const dest=path.join(temp,path.basename(p));fs.writeFileSync(dest,s);
  execFileSync(process.execPath,['--check',dest],{stdio:'inherit'});
 }
 // Source preparation only: never modify installed Roamies, its credentials, or its data.
 for(const [p,s] of Object.entries(out)){if(s===files[p])continue;fs.writeFileSync(path.join(root,p),s,'utf8');}
 console.log('Prepared source only; '+changes.length+' unique anchors verified. Personalization stays in the local checkout. Do not push this checkout.');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
