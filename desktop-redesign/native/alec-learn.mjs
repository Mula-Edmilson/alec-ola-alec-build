// A bounded recorder of successful, structured operation categories, not a screen/key logger.
// The native caller must authenticate the origin and report only actual completed operations.
import {randomUUID} from 'node:crypto';
const operations=new Set(['files.read','files.write','screen.read','camera.read','app.control','command.run','skill.run']);
export function createLearnRecorder({trust,clock=Date.now}={}){
 if(typeof trust?.authorize!=='function')throw Error('Trust required');
 let session=null;
 const snapshot=()=>session?{id:session.id,state:session.state,steps:[...session.steps],expires:session.expires}:null;
 const allowed=(origin,s)=>trust.authorize({capability:'skill.learn',origin,scope:s.id}).allowed;
 function prepare(origin){
  if(session)throw Error('Finish or discard the current recording');
  if(origin?.kind!=='desktop'||origin.verified!==true)throw Error('Local approval required');
  session={id:randomUUID(),state:'awaiting-approval',steps:[],expires:clock()+15*60*1000};
  return snapshot();
 }
 function start(origin){
  if(!session||session.state!=='awaiting-approval'||clock()>=session.expires||!allowed(origin,session))throw Error('Recording not authorized');
  session.state='recording';return snapshot();
 }
 function record(origin,operation){
  if(!session||session.state!=='recording')return false;
  if(clock()>=session.expires||!allowed(origin,session)){session.state='review';return false;}
  if(!operations.has(operation)||session.steps.length>=100)return false;
  session.steps.push(operation);return true;
 }
 function stop(){if(session?.state==='recording')session.state='review';return snapshot();}
 function discard(){session=null;}
 return Object.freeze({prepare,start,record,stop,discard,snapshot});
}
