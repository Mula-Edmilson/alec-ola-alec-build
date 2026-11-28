// Structural check of the actual migrated native code, not an OS keypress simulation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=process.argv[2];
if(!root)throw Error('Pass prepared upstream directory');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const side=read('showcase/tauri/sidecar/sidekick.mjs');
const host=read('showcase/roamies/host.js');
const shell=read('showcase/tauri/src-tauri/src/main.rs');
const panel=read('showcase/panel/panel.js');
assert.match(shell,/tap\.step\(chord, mods_down\(\), other_input_down/);
assert.match(shell,/"type": "write_tap"/);
assert.match(side,/m\.type === 'write_tap'\) onWriteTap\(\)/);
assert.match(side,/if \(barAsk\) barAsk\.abort\(\);\s*else typeToAsk\(\{ interrupt: true \}\)/);
assert.match(side,/else if\(!alecLiveTyped\(typed\)\)/);
assert.match(side,/if\(alecLiveLocked\)return alecLiveArea\(\)/);
assert.match(host,/alecNativeLiveSession&&!ask/);
assert.match(panel,/Repor Ctrl\+Shift/);
assert.match(side,/saveKeys\(\{\.\.\.keys\(\),write:pair\}\)/);
assert.match(side,/createUnifiedLiveActions\(\{runGoal:alecRunUnifiedGoal/);
assert.match(side,/createLiveAgentBridge\(\{agents:alecNativeAgents/);
assert.match(side,/!t\.name\.startsWith\('alec_agent_'\)&&t\.name!=='alec_webcam_capture'/);
assert.match(shell,/alec_native_live_camera_result/);
assert.match(side,/alecLiveCameraPending/);
assert.match(side,/createLiveTranscript\(\{commit:alecLiveRecord\}\)/);
console.log('ALEC Live native wiring and hotkey routing structural assertions passed');

assert.match(side,/async function alecStartLive\(withActions\)\{\s*if\(withActions!==true\)/);
assert.doesNotMatch(side,/alecStartLive\(\s*\)/);
assert.match(side,/createResilientLiveSession\(\{[^\n]+requireActions:true,actions:alecLiveActions/);
assert.match(side,/if\(m\.alecLocalPanel===true&&!alecContext\.getStore\(\)\)void alecStartLive\(true\)/);
assert.match(panel,/btn\('Activar Live',\(\)=>alecConfirm\([^\n]+send\(\{type:'alec_live_actions_start'\}\)/);
assert.doesNotMatch(panel,/btn\('Live \+ tarefas'/);
assert.doesNotMatch(panel,/\?\s*'alec_live_stop'\s*:\s*'alec_live_start'/);
console.log('Desktop Live has exactly one authorised activation path; no conversation-only desktop fallback');

assert.match(side,/tools: textChat \? \[\] : alecSharedTools\(\)/);

assert.match(side,/async function alecRunUnifiedGoal\(goal,signal\)/);
assert.match(side,/await prompt\(goal,null,'',false,null,false\)/);
assert.match(side,/for await \(const e of agentEvents\(agent\.prompt\(content\)\)\)/);
assert.match(side,/if\(alecUnifiedOutput\(msg\)\)return/);
assert.match(side,/const voice = alecUnifiedTask \? null : VOICE_ON/);
assert.doesNotMatch(side,/const core=createLiveCore/);
assert.doesNotMatch(side,/alecLiveActions=createLiveActions/);
console.log('Live delegates user goals to the exact same prompt and native agent loop as normal requests');
