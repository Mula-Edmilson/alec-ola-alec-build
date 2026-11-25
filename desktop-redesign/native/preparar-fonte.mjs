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
  const nativeFish=out[fi];
  const nativeUser=out[sc].match(/const userName = \(\(\) => \{[\s\S]*?\n\}\)\(\);/)?.[0];
  rep(sc,"const lookVoice = () => (LOOKS.find(([id]) => id === config.look) ?? LOOKS[0])[2];",`const lookVoice = () => ${JSON.stringify(profile.voice)};`);
  rep(fi,"text: '', reference_id: voice, format: 'pcm'",`text: '', reference_id: ${JSON.stringify(profile.voice)}, format: 'pcm'`);
  rep(fi,"export const FISH_MODELS = ['drama-3', 's2.1-pro', 's2.1-pro-free'];","export const FISH_MODELS = ['s2.1-pro-free'];");
  const choices=out[fi].match(/export const FISH_CHOICES = \[[\s\S]*?\n\];/)?.[0];if(!choices)throw Error("FISH_CHOICES anchor");
  rep(fi,choices,"export const FISH_CHOICES = [{ id: 's2.1-pro-free', name: 'S2.1 Pro Free', perM: 0 }];");
  const user=out[sc].match(/const userName = \(\(\) => \{[\s\S]*?\n\}\)\(\);/)?.[0];if(!user)throw Error("userName anchor");
  rep(sc,user,`const userName = ${JSON.stringify(profile.name)};`);
  if(profile.publicBuild){
    out["showcase/tauri/sidecar/alec-legacy-profile.mjs"]="import fs from 'node:fs';\nimport path from 'node:path';\nimport {createHash} from 'node:crypto';\n// Read the old installation as inert data, never execute it. No values logged or transmitted.\nexport const alecLegacyProfile=(()=>{\n  if(process.platform!=='win32'||!process.env.LOCALAPPDATA||process.env.ROAMIES_DATA_DIR)return null;\n  try {\n    const p=path.join(process.env.LOCALAPPDATA,'Roamies','sidecar','sidekick.mjs');\n    const stat=fs.statSync(p);if(!stat.isFile()||stat.size>16000000)return null;\n    const bytes=fs.readFileSync(p);\n    if(createHash('sha256').update(bytes).digest('hex')!=='4bd3e971b6ad039475ff52f23db5a7ded801a12c61189ab18ec96c303ddddfab')return null;\n    const legacy=bytes.toString('utf8');\n    const voice=legacy.match(/var lookVoice = \\(\\) => ['\"]([a-f0-9]{32})['\"];/i)?.[1];\n    const name=legacy.match(/\\/\\* ROAMIES_NOME_PERSONALIZADO \\*\\/ return \"([^\"\\r\\n]{1,70})\";/)?.[1];\n    if(!voice||!name||!legacy.includes('var FISH_MODELS = [\"s2.1-pro-free\"];'))return null;\n    return Object.freeze({voice,name});\n  }catch{return null;}\n})();\n";
    out[sc]="import { alecLegacyProfile } from './alec-legacy-profile.mjs';\n"+out[sc];
    rep(sc,`const lookVoice = () => ${JSON.stringify(profile.voice)};`,"const lookVoice = () => alecLegacyProfile?.voice ?? (LOOKS.find(([id]) => id === config.look) ?? LOOKS[0])[2];");
    rep(sc,`const userName = ${JSON.stringify(profile.name)};`,nativeUser.replace("const userName =","const userName = alecLegacyProfile?.name ??"));
    out[fi]="import { alecLegacyProfile } from './alec-legacy-profile.mjs';\n"+nativeFish;
    rep(fi,"export const FISH_MODELS = ['drama-3', 's2.1-pro', 's2.1-pro-free'];","export const FISH_MODELS = alecLegacyProfile ? ['s2.1-pro-free'] : ['drama-3', 's2.1-pro', 's2.1-pro-free'];");
    rep(fi,"export const FISH_CHOICES = [","export const FISH_CHOICES = alecLegacyProfile ? [{ id: 's2.1-pro-free', name:'S2.1 Pro Free', perM:0 }] : [");
    rep(sc,"// Hybrid models (route.mjs):","if(alecLegacyProfile)config.fishModel='s2.1-pro-free';\n// Hybrid models (route.mjs):");
  }
  // Re-register chat models without elevating their privileges. Text-only requests do not get tools or images.
  rep(lo,"export const localModels = (probes, windows = new Map()) => toolModels(probes, windows).filter((m) => m.supportsImages);",`export const localModels = (probes, windows = new Map()) => toolModels(probes, windows).filter((m) => m.supportsImages);
const alecChatModels = (probes, windows = new Map()) => probes.filter(p => p.reachable).flatMap(p => p.models.filter(m => m.supportsChat !== false).map(m => {
  const info = {...toModelInfo(m, p.endpoint), supportsTools:m.supportsTools===true, supportsImages:m.supportsImages===true};
  if (m.contextWindowKnown) return info;
  if (windows.has(info.id)) return withWindow(info, windows.get(info.id));
  return p.endpoint.custom ? withWindow(info, MIN_CONTEXT) : info;
}));`);
  rep(lo,"const p = await probe(key ? { ...server, apiKey: key } : server, { timeoutMs: 1500 });","const p = await probe(key ? { ...server, apiKey: key } : server, { timeoutMs: server.custom && server.baseUrl.startsWith('https://') ? 12000 : 1500 });");
  rep(lo,"{ save = false, apiKey, windows, probe = probeEndpoint } = {}","{ save = false, apiKey, windows, probe = probeEndpoint, conversation = false } = {}");
  rep(lo,"const usable = toolModels([p], windows), models = usable.filter((m) => m.supportsImages);","const usable = conversation ? alecChatModels([p], windows) : toolModels([p], windows), models = conversation ? usable : usable.filter(m => m.supportsImages);");
  rep(lo,"{ windows, probe } = {})","{ windows, probe, conversation = false } = {})");
  rep(lo,"connectLocal(auth, s, { windows, probe })","connectLocal(auth, s, { windows, probe, conversation })");
  rep(sc,"syncServers(auth, servers(), { windows: local.windows })","syncServers(auth, servers(), { windows: local.windows, conversation:true })");
  rep(sc,"connectLocal(auth, s, { save: true, windows: local.windows })","connectLocal(auth, s, { save: true, windows: local.windows, conversation:true })");
  rep(sc,"connectLocal(auth, s, { save: true, apiKey: key || undefined, windows: local.windows })","connectLocal(auth, s, { save: true, apiKey: key || undefined, windows: local.windows, conversation:true })");
  rep(lo,"text: usable.length - models.length","text: conversation ? usable.filter(m => m.supportsTools && !m.supportsImages).length : usable.length - models.length");
  rep(sc,"const canRun = (p, id) => !!signedIn.get(p) && seesImages(p, id) && getAuthStorageKeys(p, id).some((k) => k === p || storedKeys.has(k));",`const alecConversationOnly = (provider, model) => provider === 'local' && !!model && (model.supportsTools === false || model.supportsImages !== true);
const alecConversationNow = () => alecConversationOnly(config.provider, getModel(config.model));
const canRun = (p, id) => !!signedIn.get(p) && (p === 'local' || seesImages(p,id)) && getAuthStorageKeys(p,id).some(k => k === p || storedKeys.has(k));`);
  // Preserve upstream text-only subagents, while filtering unsupported models from the crew via crewSpec.
  rep(sc,"const crewNow = () => (config.subagents ?","const crewNow = () => (config.subagents && !alecConversationNow() ?");
  rep(sc,"const hybridActive = () => !!config.hybrid && hybridOn(config.heavy);","const hybridActive = () => !!config.hybrid && !alecConversationNow() && hybridOn(config.heavy);");
  rep(sc,"const runnableSpec = (p, id) => canRun(p, id) || (p === 'local' && !!signedIn.get('local') && !!parseLocalModelId(id ?? ''));","const runnableSpec = (p,id) => (p !== 'local' || ((!getModel(id) || (getModel(id)?.supportsTools !== false && getModel(id)?.supportsImages === true)))) && (canRun(p,id) || (p === 'local' && !!signedIn.get('local') && !!parseLocalModelId(id ?? '')));");
  rep(sc,"const crewSpec = (p, id) => runnableSpec(p, id) || canRunText(p, id);","const crewSpec = (p,id) => runnableSpec(p,id) || (canRunText(p,id) && (p !== 'local' || getModel(id)?.supportsTools !== false));");
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
.frame.opening { animation:crt-on 180ms ease-out both; }
.frame.shutting { animation:crt-off 120ms ease-in both; }
@keyframes crt-on { from {opacity:0;transform:translateY(3px) scale(.99)} to {opacity:1;transform:none} }
@keyframes crt-off { from {opacity:1} to {opacity:0} }
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

  out["showcase/tauri/sidecar/alec-skill-hub.mjs"]="import { randomUUID } from 'node:crypto';\nimport { httpGet,parseSkillFile,slugOf,screenSkill,installSkill,listSkills } from './skills.mjs';\nexport function createSkillHub({get,parse,slugOf,screen,install,list,clock=Date.now,token}){\n  let pending=null,status=null,busy=false;\n  const snapshot=()=>({busy,status,review:pending&&clock()<pending.expires?pending.view:null});\n  async function inspect(input,pick=null){\n    if(busy)throw Error(\"Análise em curso.\");\n    busy=true;pending=null;status=null;\n    try{\n      const m=/^https:\\/\\/github\\.com\\/([A-Za-z0-9_-]{1,100})\\/([A-Za-z0-9_.-]{1,100})\\/?$/.exec(String(input).trim());\n      if(!m)throw Error(\"Use a URL HTTPS da raiz de um repositório público GitHub.\");\n      const owner=m[1],repo=m[2].replace(/\\.git$/i,\"\");\n      if(!repo||repo===\".\"||repo===\"..\")throw Error(\"Repositório inválido.\");\n      const url=\"https://github.com/\"+owner+\"/\"+repo,base=\"https://api.github.com/repos/\"+owner+\"/\"+repo;\n      const meta=await get(base,{json:true,limit:120000});\n      if(meta.private!==false||typeof meta.default_branch!==\"string\")throw Error(\"Apenas repositórios públicos.\");\n      const rev=await get(base+\"/commits/\"+encodeURIComponent(meta.default_branch),{json:true,limit:500000});\n      if(!/^[a-f0-9]{40}$/i.test(rev.sha))throw Error(\"Commit inválido.\");\n      const info={url,sha:rev.sha,license:String(meta.license?.spdx_id??\"Não identificada\").slice(0,80),description:String(meta.description??\"\").slice(0,400),language:String(meta.language??\"\").slice(0,80)};\n      const tree=await get(base+\"/git/trees/\"+rev.sha+\"?recursive=1\",{json:true,limit:20000000});\n      if(!Array.isArray(tree.tree)||tree.truncated)throw Error(\"Árvore incompleta; requer revisão manual.\");\n      const entries=tree.tree.filter(e=>e.type===\"blob\"&&e.mode===\"100644\"&&typeof e.path===\"string\"&&/(^|\\/)SKILL\\.md$/.test(e.path)&&e.path.split(\"/\").every(p=>/^[A-Za-z0-9_.-]+$/.test(p)&&p!==\".\"&&p!==\"..\")&&!/(^|\\/)(node_modules|\\.git|tests?|fixtures)\\//.test(e.path));\n      if(!entries.length){status={...info,kind:\"adapter\",message:\"Sem SKILL.md. Requer adaptador específico; nenhum código instalado.\"};return;}\n      if(entries.length>100)throw Error(\"Demasiadas habilidades; análise manual necessária.\");\n      const choices=entries.map(e=>e.path);\n      if(!pick&&choices.length>1){status={...info,kind:\"choices\",choices};return;}\n      const chosen=entries.find(e=>e.path===(pick||choices[0]));\n      if(!chosen||!Number.isFinite(chosen.size)||chosen.size>60000)throw Error(\"Habilidade inválida ou demasiado grande.\");\n      const text=await get(\"https://raw.githubusercontent.com/\"+owner+\"/\"+repo+\"/\"+rev.sha+\"/\"+chosen.path.split(\"/\").map(encodeURIComponent).join(\"/\"),{limit:60000});\n      if(typeof text!==\"string\"||!text.trim()||text.length>60000||text.includes(\"\\0\"))throw Error(\"Documento inválido.\");\n      const p=parse(text,repo),slug=slugOf(p.name);\n      if(!slug||!p.description||!p.steps)throw Error(\"SKILL.md incompleto.\");\n      const sk={slug,name:p.name,description:p.description,text,files:[],skipped:0,from:url+\"/blob/\"+rev.sha+\"/\"+chosen.path};\n      const why=screen(sk);if(why)throw Error(why);\n      if(list().some(x=>x.slug===slug))throw Error(\"Já existe uma habilidade com este nome. Não será substituída.\");\n      const id=token(),expires=clock()+600000;\n      pending={sk,id,expires,view:{...info,id,expires,path:chosen.path,name:p.name,text}};\n    }catch(e){status={kind:\"error\",message:String(e?.message??e).slice(0,500)};}\n    finally{busy=false;}\n  }\n  async function approve(id){\n    if(busy||!pending||pending.id!==id||clock()>=pending.expires)throw Error(\"Análise inválida ou expirada.\");\n    const {sk}=pending;pending=null;busy=true;\n    try{if(list().some(x=>x.slug===sk.slug))throw Error(\"Habilidade já existente.\");const why=screen(sk);if(why)throw Error(why);await install(sk);status={kind:\"installed\",message:\"Habilidade documental instalada: \"+sk.name};}\n    finally{busy=false;}\n  }\n  function cancel(){if(!busy){pending=null;status=null;}}\n  return {snapshot,inspect,approve,cancel};\n}\nexport const skillHub=createSkillHub({get:httpGet,parse:parseSkillFile,slugOf,screen:screenSkill,install:installSkill,list:listSkills,token:randomUUID});\n";
  out[sc]="import { skillHub } from './alec-skill-hub.mjs';\n"+out[sc];
  rep(sc,"skills: listSkills().map((k) =>", "alecSkillHub: skillHub.snapshot(), skills: listSkills().map((k) =>");
  rep(sc,"else if (m.type === 'panel_key' &&", `else if (m.type === 'alec_skill_inspect' && typeof m.url === 'string') {
    const task = skillHub.inspect(m.url.slice(0,500), typeof m.pick === 'string' ? m.pick.slice(0,300) : null); panel();
    task.catch(e=>panelNote(String(e.message).slice(0,500),true)).finally(()=>panel());
  } else if (m.type === 'alec_skill_approve' && typeof m.id === 'string') {
    const task=skillHub.approve(m.id); panel();
    task.then(()=>panelNote('Habilidade instalada.')).catch(e=>panelNote(String(e.message).slice(0,500),true)).finally(()=>panel());
  } else if (m.type === 'alec_skill_cancel') { skillHub.cancel(); panel(); }
  else if (m.type === 'panel_key' &&`);
  rep(pj,"[['skills', 'Skills'], ['connections', 'Connections'], ['routines', 'Routines']]", "[['skills', 'Skill Hub'], ['connections', 'Connections'], ['routines', 'Routines']]");
  rep(pj,"function skillList() {", `let alecRepoUrl='';
  function alecHubForm(){
    const h=state.alecSkillHub;
    if(!h)return el('p',{className:'empty',textContent:'Skill Hub disponível apenas na aplicação nativa.'});
    const input=el('input',{type:'url',value:alecRepoUrl,placeholder:'https://github.com/owner/repo', 'aria-label':'Repositório público', 'data-k':'alec-repo', on:{input:e=>{alecRepoUrl=e.target.value;}}});
    const submit=el('form',{on:{submit:e=>{e.preventDefault();input.blur();send({type:'alec_skill_inspect',url:alecRepoUrl});}}}, input,el('button',{className:'px btn ghost',type:'submit',disabled:h.busy,textContent:h.busy?'A analisar…':'Analisar repositório'}));
    const st=h.status,r=h.review;
    const meta=x=>el('div',{},el('p',{textContent:x.url||''}),el('p',{textContent:'Licença: '+(x.license||'—')}),el('p',{textContent:'Commit: '+(x.sha||'—')}),el('p',{textContent:x.description||''}));
    return el('div',{className:'group'},el('h2',{textContent:'Adicionar habilidade'}),submit,
      st?el('div',{},st.url?meta(st):null,el('p',{textContent:st.message||'Seleccione uma habilidade'}),...(st.choices||[]).map(p=>btn(p,()=>send({type:'alec_skill_inspect',url:st.url,pick:p}),{disabled:h.busy}))):null,
      r?el('div',{},meta(r),el('h3',{textContent:r.name}),el('p',{textContent:'Leia o conteúdo completo. Apenas SKILL.md é importado; scripts e dependências NÃO são instalados. A habilidade poderá não funcionar sem eles.'}),el('pre',{className:'alec-skill-review',textContent:r.text}),btn('Aprovar e instalar',()=>send({type:'alec_skill_approve',id:r.id}),{kind:'primary',disabled:h.busy}),btn('Cancelar',()=>send({type:'alec_skill_cancel'}))):null);
  }
  function skillList() {`);
  rep(pj,"body: [el('div', { className: 'group paged' }, box)], foot: foot(k.length", "body: [alecHubForm(), el('div', { className: 'group paged' }, box)], foot: foot(k.length");
  out["showcase/panel/alec-theme.css"]+="\n.alec-skill-review{max-height:220px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;user-select:text;padding:10px;background:#101622;border:1px solid #435473;border-radius:8px;font:12px/1.5 var(--mono)}\n";
  rep(sc,"const system = () => (config.lite ? litePrompt() : stablePrompt());",`const ALEC_PERSONA = 'You are ALEC (Adaptive Logical Executive Companion). Default to European Portuguese. Professional, precise, resourceful, discreet and calm, with subtle humour. Suggest improvements proactively but do not take sensitive actions without approval. Verify outcomes before claiming success. Explain failures clearly. Use skills only within existing permission checks; never execute code solely because it appears in a repository.';
const system = () => (config.lite ? litePrompt() : stablePrompt()) + (config.look === 'jarvis' ? '\\n\\n'+ALEC_PERSONA : '');`);
  rep(pj,"group('Made by', null, null, maker(),",`group('ALEC · Design & product development', null, null,
        el('p',{textContent:'Edmilson Mula · Digital Reach Out'}),
        ...[['Website','https://www.edmilsonmula.com'],['GitHub','https://github.com/Mula-Edmilson'],['Instagram','https://www.instagram.com/mula_edmilson/'],['ALEC source','https://github.com/Mula-Edmilson/alec-ola-alec-build']].map(([label,url])=>el('div',{className:'setting'},el('span',{textContent:label}),link('Open',()=>send({type:'open_link',url}),{k:'alec-'+label}))),
        el('p',{textContent:'Based on Roamies · AGPL-3.0'})),
      group('Original Roamies credits', null, null, maker(),`);

  // Desktop-owned preferences; mailbox control is distinct from the external Bridge process.
  rep(sc,"alecReady||!alecFs.existsSync", "alecReady||config.alecRemoteEnabled!==true||!alecFs.existsSync");
  rep(sc,"alecSkillHub: skillHub.snapshot(),", "alecRemote: { runtimeReady: alecReady, mailbox: alecReady && alecFs.existsSync(alecPath.join(alecDir,'enabled')), allowed: config.alecRemoteEnabled === true }, alecPersona: ['balanced','concise','creative'].includes(config.alecPersona) ? config.alecPersona : 'balanced', alecSkillHub: skillHub.snapshot(),");
  rep(sc,"else if (m.type === 'alec_skill_inspect'", `else if (m.type === 'alec_remote_access' && typeof m.enabled === 'boolean') {
    config.alecRemoteEnabled=m.enabled; saveConfig(); panel();
  } else if (m.type === 'alec_persona' && ['balanced','concise','creative'].includes(m.profile)) {
    if(busy || queued){panelNote('Aguarde o fim da tarefa para alterar a personalidade.',true);return;}
    config.alecPersona=m.profile; agent=null; saveConfig(); panel();
  } else if (m.type === 'alec_skill_inspect'`);
  rep(sc,"const system = () => (config.lite ? litePrompt() : stablePrompt()) + (config.look === 'jarvis' ? '\\n\\n'+ALEC_PERSONA : '');",`const alecPersonaText = () => ALEC_PERSONA + ({concise:' Be especially concise and technical.',creative:' Offer creative alternatives when relevant.',balanced:' Balance technical precision with natural conversation.'}[config.alecPersona] || '');
const system = () => (config.lite ? litePrompt() : stablePrompt()) + (config.look === 'jarvis' ? '\\n\\n'+alecPersonaText() : '');`);
  rep(sc,"facts: listFacts() }) : system(),","facts: listFacts() }) + (config.look === 'jarvis' ? '\\n'+alecPersonaText() : '') : system(),");
  rep(pj,"function generalPage() {\n    return [",`function generalPage() {
    const r=state.alecRemote;
    const profile=state.alecPersona;
    return [
      r ? group('ALEC Remote', 'Estado do hook local. Não confirma ligação do telefone nem o processo externo do Bridge.', null,
        el('p',{textContent:r.runtimeReady?'Motor de integração pronto':'Motor de integração indisponível'}),
        el('p',{textContent:r.mailbox?'Mailbox sinalizada pelo Bridge':'Mailbox não sinalizada'}),
        toggle('Receber comandos remotos','Só controla a mailbox V11; não altera permissões de ficheiros nem encerra o Bridge.',r.allowed,()=>send({type:'alec_remote_access',enabled:!r.allowed}),'alec-remote-access')) : null,
      profile ? group('Personalidade ALEC', 'Aplica-se ao personagem ALEC. Não altera permissões nem os restantes personagens.', null,
        el('span',{className:'px field select'},el('select',{'aria-label':'Personalidade ALEC','data-k':'alec-persona',disabled:state.busy,on:{change:e=>send({type:'alec_persona',profile:e.target.value})}},
          ...[['balanced','Profissional'],['concise','Técnico e conciso'],['creative','Criativo e proactivo']].map(([value,label])=>el('option',{value,textContent:label,selected:profile===value}))))) : null,`);

  // The managed Bridge is the actual V16 server from the user's local extracted project.
  if(typeof profile.bridgeSupervisor!=='string'||!profile.bridgeSupervisor.includes('createBridgeSupervisor'))throw Error('Bridge supervisor module missing.');
  out["showcase/tauri/sidecar/alec-bridge-supervisor.mjs"]=profile.bridgeSupervisor;
  out[sc]="import { createBridgeSupervisor, cleanBridgeSettings, readPersonalFolders } from './alec-bridge-supervisor.mjs';\n"+out[sc];
  rep(sc,"function panel() {",`let alecImportedRoots=[];\nconst alecBridge = createBridgeSupervisor({
  changed: () => panel(),
  ready: settings => {
    if(settings.ask){
      alecFs.mkdirSync(alecDir,{recursive:true,mode:0o700});
      alecFs.closeSync(alecFs.openSync(alecPath.join(alecDir,'enabled'),'a',0o600));
    }
    config.alecRemoteEnabled=settings.ask; saveConfig();
  },
  closed: () => {config.alecRemoteEnabled=false;saveConfig();}
});
function startAlecBridge(settings){
  if(!['stopped','error'].includes(alecBridge.snapshot().phase))throw Error('Pare o serviço antes de iniciar novamente.');
  const valid=cleanBridgeSettings(settings);
  config.alecRemoteEnabled=false;saveConfig();
  const saved=alecBridge.start(valid);config.alecBridge=saved;saveConfig();panel();
}
function panel() {`);
  rep(sc,"alecRemote: { runtimeReady:", "alecManagedBridge: { ...alecBridge.snapshot(), settings: config.alecBridge ?? null, importedRoots: alecImportedRoots }, alecRemote: { runtimeReady:");
  rep(sc,"else if (m.type === 'alec_remote_access'",`else if(m.type==='alec_bridge_import'){
    if(!['stopped','error'].includes(alecBridge.snapshot().phase))return;
    try{alecImportedRoots=readPersonalFolders(m.project);panelNote('Pastas lidas. Reveja antes de aplicar.');}catch(e){alecImportedRoots=[];panelNote(String(e.message).slice(0,300),true);}panel();
  } else if (m.type === 'alec_bridge_save' || m.type === 'alec_bridge_start') {
    if(!['stopped','error'].includes(alecBridge.snapshot().phase)){panelNote('Pare o Bridge antes de alterar configurações.',true);return;}
    try{
      const settings=cleanBridgeSettings(m.settings);
      if(m.type==='alec_bridge_start')startAlecBridge(settings);
      else {config.alecBridge=settings;saveConfig();panel();}
      panelNote(m.type==='alec_bridge_start'?'A iniciar o Bridge V16.':'Configuração guardada.');
    }catch(e){panelNote(String(e.message).slice(0,400),true);panel();}
  } else if(m.type==='alec_bridge_stop'){
    config.alecRemoteEnabled=false;saveConfig();alecBridge.stop();panel();
  } else if (m.type === 'alec_remote_access'`);
  rep(sc,"config.alecRemoteEnabled=m.enabled; saveConfig(); panel();","if(alecBridge.snapshot().phase==='running' && m.enabled && !alecBridge.settings()?.ask){panelNote('Ask desactivado no Bridge gerido. Pare e configure o serviço.',true);return;} config.alecRemoteEnabled=m.enabled; saveConfig(); panel();");
  rep(sc,"alecReady = true;","alecReady = true;\nif(config.alecBridge?.auto){try{startAlecBridge(config.alecBridge);}catch(e){panelNote('Bridge não iniciado: '+String(e.message).slice(0,300),true);}}");
  rep(sc,"}).on('close', () => {\n  // The app quit","}).on('close', () => {\n  alecBridge.stop();\n  // The app quit");
  rep(pj,"function generalPage() {",`let alecBridgeDraft=null,alecBridgeDraftKey='';
  function managedBridgeGroup(){
    const b=state.alecManagedBridge;
    if(!b)return null;
    const initial=b.settings||{};
    const key=JSON.stringify(initial);
    if(!alecBridgeDraft||alecBridgeDraftKey!==key){
      alecBridgeDraft={project:b.defaults?.project||'',python:b.defaults?.python||'',bind:b.interfaces?.find(a=>!a.startsWith('127.'))||'127.0.0.1',roots:[],transfer:'',ask:false,screen:false,camera:false,auto:false,visionServer:'',visionModel:'',ollamaModel:'',...initial};
      alecBridgeDraftKey=key;
    }
    const d=alecBridgeDraft,locked=['running','starting','stopping'].includes(b.phase);
    const row=(label,k,placeholder='')=>el('label',{className:'alec-bridge-field'},el('span',{textContent:label}),el('input',{type:'text',value:d[k]||'',placeholder,disabled:locked,'aria-label':label,'data-k':'bridge-'+k,on:{input:e=>{d[k]=e.target.value;}}}));
    const check=(label,k)=>el('label',{className:'alec-bridge-check'},el('input',{type:'checkbox',checked:!!d[k],disabled:locked,on:{change:e=>{d[k]=e.target.checked;}}}),el('span',{textContent:label}));
    const roots=el('div',{className:'group'},el('h3',{textContent:'Pastas de leitura (API de ficheiros)'}),
      ...d.roots.map((v,i)=>el('div',{className:'alec-bridge-root'},el('input',{type:'text',value:v,disabled:locked,'aria-label':'Pasta '+(i+1),on:{input:e=>{d.roots[i]=e.target.value;}}}),btn('Remover',()=>{d.roots.splice(i,1);render('bridge-add-root');},{disabled:locked}))),
      btn('Adicionar pasta',()=>{d.roots.push('');render('bridge-add-root');},{disabled:locked||d.roots.length>=32,k:'bridge-add-root'}));
    const addresses=[...new Set([...(b.interfaces||[]),d.bind])].filter(Boolean);
    const submit=type=>{document.activeElement?.blur();send({type,settings:{...d,roots:d.roots.filter(x=>x.trim())}});};
    return group('Bridge V16 · Serviço gerido', 'Utiliza o projecto V16 local auditado. A sessão é renovada a cada arranque. Python 3.10+ necessário.',null,
      el('p',{textContent:'Estado: '+({running:'Em execução',starting:'A iniciar',stopping:'A terminar',stopped:'Parado',error:'Erro'}[b.phase]||'Indisponível')}),
      b.error?el('p',{textContent:b.error}):null,
      b.phase==='running'?el('div',{className:'alec-pair'},el('p',{textContent:b.url}),el('strong',{textContent:b.code}),el('p',{textContent:'Código de emparelhamento actual · '+b.version})):null,
      row('Pasta do projecto ALEC Remote V16','project','C:\\\\...\\\\ALEC_Remote_V16'),row('Executável Python / py.exe','python','C:\\\\Windows\\\\py.exe'),
      el('label',{className:'alec-bridge-field'},el('span',{textContent:'Interface de rede privada'}),el('select',{disabled:locked,value:d.bind,on:{change:e=>{d.bind=e.target.value;}}},...addresses.map(value=>el('option',{value,selected:d.bind===value,textContent:value+(value.startsWith('127.')?' · Só PC':'')})))),
      row('Pasta V16 original para importar (opcional)','importProject'),
      btn('Ler pastas do script pessoal',()=>{document.activeElement?.blur();send({type:'alec_bridge_import',project:d.importProject||d.project});},{disabled:locked}),
      b.importedRoots?.length?el('div',{className:'group'},el('p',{textContent:b.importedRoots.length+' pastas encontradas. Reveja antes de adicionar.'}),...b.importedRoots.map(p=>el('p',{textContent:p})),btn('Adicionar à lista de leitura',()=>{d.roots=[...new Set([...d.roots.filter(Boolean),...b.importedRoots])].slice(0,32);render('bridge-add-root');},{disabled:locked})):null,
      roots,row('Pasta de recepção (upload opcional)','transfer','Vazio = desactivado'),
      check('Permitir Ask remoto com ferramentas gerais (não limitado pelas pastas acima)','ask'),
      el('p',{textContent:'Os limites de pastas aplicam-se apenas à API de ficheiros. Ask remoto pode usar ferramentas gerais do agente; mantenha-o desligado para limitar o acesso directo.'}),
      check('Permitir captura do ecrã','screen'),check('Permitir webcam','camera'),check('Iniciar Bridge automaticamente com ALEC','auto'),
      row('Servidor de visão local (opcional)','visionServer','http://127.0.0.1:1234/v1'),row('Modelo de visão local','visionModel'),row('Modelo Ollama de visão','ollamaModel'),
      el('div',{className:'row-btns'},btn('Guardar',()=>submit('alec_bridge_save'),{disabled:locked}),btn('Iniciar',()=>submit('alec_bridge_start'),{kind:'primary',disabled:locked}),btn('Parar / revogar sessões',()=>send({type:'alec_bridge_stop'}),{disabled:!['running','starting'].includes(b.phase)})),
      el('p',{textContent:'Não cria regras de firewall nem encaminha portas. Use LAN de confiança ou Tailscale. Alterações às pastas exigem parar e reiniciar o Bridge.'}));
  }
  function generalPage() {`);
  rep(pj,"const profile=state.alecPersona;\n    return [","const profile=state.alecPersona;\n    return [\n      managedBridgeGroup(),");
  out["showcase/panel/alec-theme.css"]+="\n.alec-bridge-field{display:grid;gap:5px;margin:7px 0}.alec-bridge-field input,.alec-bridge-field select,.alec-bridge-root input{min-width:0;width:100%;padding:8px;border:1px solid var(--line-hi);background:var(--panel);color:var(--ink);border-radius:7px;font:12px var(--mono)}.alec-bridge-root{display:flex;gap:5px;align-items:center}.alec-bridge-check{display:flex;align-items:center;gap:7px;margin:6px 0}.alec-pair{background:var(--panel);border:1px solid var(--line);padding:12px;border-radius:9px;text-align:center}.alec-pair strong{font-size:26px;letter-spacing:.2em;color:var(--accent)}\n";
  if(profile.bundleBridge){
    const bundledCfg=JSON.parse(out[tc]);
    bundledCfg.bundle.resources["../alec-remote/"]="alec-remote/";
    out[tc]=JSON.stringify(bundledCfg,null,2)+"\n";
  }

  // Configurable full wake phrase, Windows only. The original greeting/name matcher stays intact.
  const wr="showcase/tauri/src-tauri/voice-win/src/wake.rs",wv="showcase/tauri/src-tauri/voice-win/src/main.rs";
  const wakeValidator = "function cleanAlecWakePhrase(raw){\n const t=String(raw??'').trim().normalize('NFC');\n if(!t)return {ok:true,phrase:''};\n const bad=why=>({ok:false,why});\n if([...t].length>80||!/^[\\p{L}\\s,]+$/u.test(t))return bad('Usa apenas letras, espaços e vírgulas.');\n const words=t.split(/[\\s,]+/u).filter(Boolean);\n const letters=[...words.join('')].length;\n if(words.length<1||words.length>4||letters<4||letters>36)return bad('Escolhe 1 a 4 palavras, com 4 a 36 letras.');\n if(words.length===1&&['hello','hey','okay','alexa','google','siri','olá','ola','acorda','bom','obrigado','sim','não','nao','pronto','listen'].includes(words[0].toLowerCase()))return bad('Escolhe uma palavra menos comum, para reduzir activaçōes acidentais.');\n return {ok:true,phrase:words.join(' ')};\n}";
  out["showcase/tauri/sidecar/alec-wake-phrase.mjs"]="export "+wakeValidator+"\n";
  out[sc]="import { cleanAlecWakePhrase } from './alec-wake-phrase.mjs';\n"+out[sc];
  rep(sc,"const WAKE_OK = hasWakeWord(process.platform);","const WAKE_OK = hasWakeWord(process.platform);\nconst alecWakePhrase = () => process.platform === 'win32' && cleanAlecWakePhrase(config.alecWakePhrase).ok ? cleanAlecWakePhrase(config.alecWakePhrase).phrase : '';\nconst alecWakeDisplay = () => alecWakePhrase() || 'Hey '+wakeName(config);");
  // Retain the original setting for conventional wake names.
  rep(sc,"wakeName: wakeName(config),","wakeName: wakeName(config), alecWakePhrase: alecWakePhrase(), alecWakeSupported: process.platform === 'win32',");
  rep(sc,"wakeName: config.wakeName || '', lang:","wakeName: config.wakeName || '', alecWakePhrase: alecWakePhrase(), lang:");
  rep(sc,"config.wakeName = r.name; saveConfig();","config.wakeName = r.name; delete config.alecWakePhrase; saveConfig();");
  rep(sc,"  else if (id === 'voicedl') startVoiceDownload();","  else if (id === 'alec_wake_phrase' && WAKE_OK && process.platform === 'win32') {\n    const typed = await ask({ prompt: 'Frase de activação completa (1–4 palavras). Vazio restaura Hey + nome. Actual: '+alecWakeDisplay(), placeholder: 'Olá Alec' });\n    if (typed == null) return;\n    const result = cleanAlecWakePhrase(typed);\n    if (!result.ok) { say(result.why, 'concerned'); return; }\n    config.alecWakePhrase = result.phrase; saveConfig(); agentStale = true; voiceConfig(); menu();\n    say('Frase guardada. '+(config.wakeWord?'Experimenta dizer a frase depois desta resposta.':'Activa a escuta por voz para a experimentar.'),'happy');\n  }\n  else if (id === 'voicedl') startVoiceDownload();");
  // Live prompt mentions the exact currently active phrase; not a fixed "Hey" prefix.
  rep(pj,"link('Change', () => act('wakename'), { k: 'wakename', aria: 'Change the wake word name' })) : null))];","link('Change', () => act('wakename'), { k: 'wakename', aria: 'Change the wake word name' })) : null,\n        v.wake && v.alecWakeSupported ? el('div', { className: 'setting' },\n          el('span', {}, 'Frase de activação livre', el('small', { textContent: v.alecWakePhrase || 'Modo original Hey + nome' }),\n            el('small', { textContent: 'Reconhecimento local; escolha uma frase distintiva. Não é identificação do locutor.' })),\n          link('Configurar', () => act('alec_wake_phrase'), { k: 'alec-wake-phrase', aria: 'Configurar frase de activação' })) : null))];");
  rep(rs,'                to_voice(app, &json!({ "cmd": "wake", "on": wake }));\n','');
  rep(rs,'                to_voice(app, &json!({ "cmd": "wake_name", "word": name }));',"                to_voice(app, &json!({ \"cmd\": \"wake_name\", \"word\": name }));\n                #[cfg(windows)]\n                to_voice(app, &json!({ \"cmd\": \"wake_phrase\", \"phrase\": msg.get(\"alecWakePhrase\").and_then(Value::as_str).unwrap_or(\"\") }));\n                to_voice(app, &json!({ \"cmd\": \"wake\", \"on\": wake }));");
  rep(wr,"    custom: Option<String>,","    custom: Option<String>,\n    phrase: Vec<String>,");
  rep(wr,"custom: None }","custom: None, phrase: Vec::new() }");
  // set_name should not clear full phrase while repeatedly receiving voice_config.
  rep(wr,"            *self = WakeWord::default();","            self.custom = None;\n            self.names = DEFAULT_NAMES.map(String::from).to_vec();");
  rep(wr,"    /// Whether a heard word (within the allowed edits)","    /// Full phrase (without mandatory greeting). An empty value restores native greeting/name.\n    pub fn set_phrase(&mut self, raw: &str) -> bool {\n        if raw.trim().is_empty() { self.phrase.clear(); return true; }\n        if raw.chars().count() > 80 || !raw.chars().all(|c| c.is_alphabetic() || c.is_whitespace() || c == ',') {\n            return false;\n        }\n        let words: Vec<String> = raw.split(|c: char| c.is_whitespace() || c == ',')\n            .filter(|w| !w.is_empty()).map(str::to_lowercase).collect();\n        let letters: usize = words.iter().map(|w| w.chars().count()).sum();\n        if !(1..=4).contains(&words.len()) || !(4..=36).contains(&letters) { return false; }\n        if words.len() == 1 && [\"hello\", \"hey\", \"okay\", \"alexa\", \"google\", \"siri\", \"olá\", \"ola\", \"acorda\", \"bom\", \"obrigado\", \"sim\", \"não\", \"nao\", \"pronto\", \"listen\"].contains(&words[0].as_str()) { return false; }\n        self.phrase = words;\n        true\n    }\n\n    pub fn phrase(&self) -> &[String] { &self.phrase }\n\n    fn scan_phrase(&self, text: &str, words: &[Token]) -> Scan {\n        let n = self.phrase.len();\n        if words.len() >= n && words.iter().take(n).zip(&self.phrase).all(|(heard, want)| &heard.word == want)\n            && words[..n].windows(2).all(|w| text[w[0].end..w[1].start].chars().all(|c| c.is_whitespace() || c == ',')) {\n            let end = words[n-1].end;\n            let rest = text[end..].trim_start_matches(|c: char| !c.is_alphanumeric());\n            return Scan { rest: Some(rest.trim().to_string()), distance: Some(0) };\n        }\n        Scan { rest: None, distance: None }\n    }\n\n    /// Whether a heard word (within the allowed edits)");
  rep(wr,"        let words = tokens(text);\n        let mut closest:","        let words = tokens(text);\n        if !self.phrase.is_empty() { return self.scan_phrase(text, &words); }\n        let mut closest:");
  rep(wr,"    #[test]\n    fn dropping_takes_the_first_words_off()","    #[test]\n    fn full_phrase_custom_and_native_fallback() {\n        let mut w = WakeWord::default();\n        assert!(w.set_phrase(\"Hello Alex\"));\n        check(&w, \"HELLO ALEX, open Mail.\", Some(\"open Mail.\"));\n        check(&w, \"Hello Alex\", Some(\"\"));\n        check(&w, \"Hello Alice\", None);\n        check(&w, \"I said Hello Alex\", None);\n        check(&w, \"Hey Roamies\", None);\n        assert!(w.set_phrase(\"Olá, Alec\"));\n        check(&w, \"Olá Alec abre o navegador.\", Some(\"abre o navegador.\"));\n        check(&w, \"Olá. Alec\", None);\n        assert!(!w.set_phrase(\"hello\"));\n        assert!(!w.set_phrase(\"Alec 123\"));\n        check(&w, \"Olá Alec\", Some(\"\"));\n        assert!(w.set_name(Some(\"Jarvis\")));\n        check(&w, \"Olá Alec\", Some(\"\"));\n        assert!(w.set_phrase(\"\"));\n        check(&w, \"Hey Jarvis\", Some(\"\"));\n        check(&w, \"Olá Alec\", None);\n        assert!(w.set_phrase(\"Alec, acorda\"));\n        check(&w, \"Alec acorda\", Some(\"\"));\n        assert!(w.set_phrase(\"Alec\"));\n        check(&w, \"Alec, que horas são?\", Some(\"que horas são?\"));\n    }\n\n    #[test]\n    fn dropping_takes_the_first_words_off()");
  out["showcase/tauri/sidecar/test/alec-wake-phrase.test.mjs"]="import assert from 'node:assert/strict';\nimport {cleanAlecWakePhrase as clean} from '../alec-wake-phrase.mjs';\nfor(const phrase of ['Hello Alex','Olá Alec','Alec, acorda','Alec','Bom dia Alec']) assert.equal(clean(phrase).ok,true,phrase);\nassert.deepEqual(clean('  Olá,  Alec  '),{ok:true,phrase:'Olá Alec'});\nassert.deepEqual(clean(''),{ok:true,phrase:''});\nfor(const phrase of ['hello','1234','A','a b c d e','Alec!','Alec /command','A'.repeat(37),'google']) assert.equal(clean(phrase).ok,false,phrase);\nconsole.log('ALEC custom wake phrase validation passed');";
  rep(sc,"can also say \"Hey ${wakeName(config)}\" to start talking","can also say \"${alecWakeDisplay()}\" to start talking");
  rep(sc,"still starts with \"Hey ${wakeName(config)}\"","still starts with \"${alecWakeDisplay()}\"");
  rep(pj,"needs(`Say “Hey ${v.wakeName || 'Roamies'}” to talk. Mic stays on.`)","needs(`Diz “${v.alecWakePhrase || ('Hey '+(v.wakeName || 'Roamies'))}” para falar. Microfone em escuta.`)");
  rep(wv,"                // Roamies is answering or speaking: don't listen for the phrase (it mustn't wake itself).","                Some(\"wake_phrase\") => {\n                    let previous = self.wake.phrase().to_vec();\n                    let ok = self.wake.set_phrase(msg.get(\"phrase\").and_then(Value::as_str).unwrap_or(\"\"));\n                    if ok && previous.as_slice() != self.wake.phrase() { self.stop_wake(); }\n                    log(if ok { \"wake phrase configured\" } else { \"wake phrase refused\" });\n                }\n                // Roamies is answering or speaking: don't listen for the phrase (it mustn't wake itself).");

  rep("showcase/onboarding/onboarding.js","['jarvis', 'JARVIS']","['jarvis', 'ALEC']");
  rep(pj,"['jarvis', 'JARVIS']","['jarvis', 'ALEC']");
  // Strengthen the upstream structural assertion to require the added conversation-only gate.
  rep("showcase/tauri/sidecar/test/prompt.test.mjs","assert.match(side, /const agentish = !intro && !news && wantsAgent\\(text\\);/, 'a news turn never hatches an agent');","assert.match(side, /const agentish = !alecConversationNow\\(\\) && !intro && !news && wantsAgent\\(text\\);/, 'neither a conversation-only model nor a news turn hatches an agent');");
  return {out,changes};
}
const paths=["showcase/tauri/sidecar/sidekick.mjs","showcase/tauri/sidecar/speaker.mjs","showcase/tauri/sidecar/fish.mjs","showcase/tauri/sidecar/local.mjs","showcase/panel/index.html","showcase/panel/panel.js","showcase/panel/panel.css","showcase/roamies/12-sidekick.js","showcase/roamies/jarvis.js","showcase/desktop.html","showcase/tauri/src-tauri/tauri.conf.json","showcase/tauri/src-tauri/src/main.rs","showcase/tauri/src-tauri/voice-win/src/wake.rs","showcase/tauri/src-tauri/voice-win/src/main.rs","showcase/onboarding/onboarding.js","showcase/tauri/sidecar/test/prompt.test.mjs"];
const [rootArg,legacyArg,bridgeArg]=process.argv.slice(2);
if(!rootArg||!legacyArg){console.error('Usage: node preparar-fonte.mjs <fresh-upstream-checkout> <private-sidekick.mjs> [extracted-V16-project]');process.exit(1);}
const root=path.resolve(rootArg);
const publicBuild=legacyArg==='--public';
let voice,name,bridge;
if(publicBuild){
 voice='00000000000000000000000000000000';name='ALEC';
 bridge=fs.readFileSync(new URL('./live-hook.mjs',import.meta.url),'utf8');
 if(createHash('sha256').update(bridge.replace(/\r\n/g,'\n')).digest('hex')!=='5a17088fc7abc57ff4e0ea2d040855fa03291289fc83b3cd5eb9c0f87f9efcc4')throw Error('Generic V11 hook hash mismatch.');
}else{
const legacyPath=path.resolve(legacyArg);
if(legacyPath.startsWith(root+path.sep))throw Error('Keep private sidekick outside the source checkout.');
const original=fs.readFileSync(legacyPath);
if(createHash('sha256').update(original).digest('hex')!=='4bd3e971b6ad039475ff52f23db5a7ded801a12c61189ab18ec96c303ddddfab')throw Error('Private bundle differs from the audited snapshot. No changes.');
const legacy=original.toString('utf8').replace(/\r\n/g,'\n');
const marker="import { createRequire as __cr } from 'node:module';";
const boundary=legacy.indexOf(marker);
if(boundary<0||!legacy.startsWith('// ALEC_REMOTE_V11_HOOK')||boundary>20000)throw Error('Bridge boundary mismatch.');
voice=legacy.match(/var lookVoice = \(\) => ['"]([a-f0-9]{32})['"];/i)?.[1];
const reference=legacy.match(/reference_id: ['"]([a-f0-9]{32})['"],/i)?.[1];
name=legacy.match(/\/\* ROAMIES_NOME_PERSONALIZADO \*\/ return "([^"\n]{1,70})";/)?.[1];
if(!voice||voice!==reference||!name||!legacy.includes('var FISH_MODELS = ["s2.1-pro-free"];'))throw Error('Voice/name migration anchors not found.');

bridge=legacy.slice(0,boundary);
}
const actual=execFileSync('git',['-C',root,'describe','--tags','--exact-match','HEAD'],{encoding:'utf8'}).trim();
if(actual!=='v0.1.51'||execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim()!=='362645466349f4c520ad453d94a94c2481776c2f')throw Error('Only the audited Roamies v0.1.51 commit is supported.');
if(execFileSync('git',['-C',root,'status','--porcelain'],{encoding:'utf8'}).trim())throw Error('Use a clean disposable checkout.');
const files=Object.fromEntries(paths.map(p=>[p,fs.readFileSync(path.join(root,p),'utf8').replace(/\r\n/g,'\n')]));
const {out,changes}=prepareSources(files,{voice,name,bridge,publicBuild,bridgeSupervisor:fs.readFileSync(new URL('./alec-bridge-supervisor.mjs',import.meta.url),'utf8'),bundleBridge:!!bridgeArg});
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'alec-check-'));
try{
 for(const [p,s] of Object.entries(out)){
  if(s===files[p]||! /\.(?:mjs|js)$/.test(p))continue;
  const dest=path.join(temp,path.basename(p));fs.writeFileSync(dest,s);
  execFileSync(process.execPath,['--check',dest],{stdio:'inherit'});
 }
 if(bridgeArg){
  const {copyAuditedBridge}=await import('./alec-bridge-supervisor.mjs');
  copyAuditedBridge(path.resolve(bridgeArg),path.join(root,'showcase','tauri','alec-remote'));
 }
 // Source preparation only: never modify installed Roamies, its credentials, or its data.
 for(const [p,s] of Object.entries(out)){if(s===files[p])continue;fs.writeFileSync(path.join(root,p),s,'utf8');}
 console.log('Prepared source only; '+changes.length+' unique anchors verified. Personalization stays in the local checkout. Do not push this checkout.');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
