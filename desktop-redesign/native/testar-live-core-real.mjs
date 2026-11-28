// Real native implementation integration. No external API, personal files or user secrets.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[2],'showcase/tauri/sidecar');
const {createTools}=await import(pathToFileURL(path.join(root,'tools.mjs')).href);
const {createLiveCore}=await import(pathToFileURL(path.join(root,'alec-live-transport.mjs')).href);
const dir=await fs.mkdtemp(path.join(os.homedir(),'alec-live-fixture-'));
let allow=true,skip=true,asks=0,duplicate=0;const events=[];
const signal=new AbortController().signal;
try{
 const {tools}=createTools({allowActions:()=>allow,skipAllow:()=>allow&&skip,workdir:dir,userName:'test',ui:()=>{},ask:async()=>{asks++;return 'Allow';},openUrl:()=>{},onCommitments:()=>{},showList:()=>{},fmtWhen:()=>'',commitmentsText:()=>''});
 const core=createLiveCore({registry:()=>tools,nativePolicy:true,actionsAllowed:()=>allow,skipAllow:()=>allow&&skip,confirm:async()=>{duplicate++;return false;},invoke:async(t,args,ctx)=>{events.push(['start',t.name]);try{return await t.execute(args,ctx);}finally{events.push(['end',t.name]);}}});
 const execute=(name,args)=>core.execute(name,args,signal,'fixture-'+events.length);
 const file=path.join(dir,'project.txt');
 await fs.writeFile(file,'original');
 const normal=tools.find(t=>t.name==='list_files');
 const listed=await normal.execute({dir},{signal,toolCallId:'normal'});
 assert.equal((await execute('list_files',{dir})).output,listed);
 assert.equal((await execute('read_file',{path:file})).output,'original');
 assert.equal((await execute('write_file',{path:file,content:'modified'})).fileVerified,true);
 assert.equal(await fs.readFile(file,'utf8'),'modified');
 assert.match((await execute('run_command',{command:'echo ALEC_LIVE_REAL_EXECUTION'})).output,/ALEC_LIVE_REAL_EXECUTION/);
 assert.equal(asks,0);assert.equal(duplicate,0);
 // Native protected paths stay protected even when automatic confirmation is enabled.
 await assert.rejects(execute('read_file',{path:path.join(dir,'.env')}),/Blocked for safety/);
 allow=false;await assert.rejects(execute('write_file',{path:file,content:'blocked'}));assert.equal(await fs.readFile(file,'utf8'),'modified');
 allow=true;skip=false;await execute('write_file',{path:file,content:'reviewed'});assert.equal(asks,1);assert.equal(duplicate,0);
 assert.equal(events.filter(e=>e[0]==='start').length,events.filter(e=>e[0]==='end').length);
 console.log('Real native Windows tools: read, list, write/readback, command, protected paths and permission revocation verified; no duplicate Live confirmation.');
}finally{await fs.rm(dir,{recursive:true,force:true});}
