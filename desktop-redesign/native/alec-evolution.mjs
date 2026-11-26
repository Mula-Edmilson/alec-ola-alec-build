// Proposal lifecycle only: never executes model-generated code or changes installed binaries.
import {randomUUID} from 'node:crypto';
const areas=new Set(['interface','performance','reliability','accessibility','knowledge']);
const priorities=new Set(['low','normal','high']);
const validText=(s,max)=>typeof s==='string'&&s.trim().length>0&&s.length<=max&&!/[\x00-\x1f]/.test(s);
export function createEvolution({trust,clock=Date.now}={}){
 if(typeof trust?.authorize!=='function')throw Error('Trust required');
 const proposals=new Map();
 const view=p=>Object.freeze({...p});
 const local=o=>o?.kind==='desktop'&&o.verified===true;
 function propose(origin,{area,title,summary,priority='normal'}={}){
  if(!trust.authorize({capability:'evolution.propose',origin,scope:'improvements'}).allowed)throw Error('Proposal not authorized');
  if(!areas.has(area)||!priorities.has(priority)||!validText(title,120)||!validText(summary,1000)||proposals.size>=100)throw Error('Invalid proposal');
  const p={id:randomUUID(),area,title,summary,priority,state:'pending',createdAt:clock()};
  proposals.set(p.id,p);return view(p);
 }
 function review(origin,id,decision){
  if(!local(origin)||!['approve-testing','reject'].includes(decision))throw Error('Local review required');
  const p=proposals.get(id);if(!p||p.state!=='pending')throw Error('Proposal unavailable');
  p.state=decision==='reject'?'rejected':'approved-for-testing';p.reviewedAt=clock();return view(p);
 }
 // Test approval is not permission to install or modify the live application.
 function discard(origin,id){if(!local(origin))throw Error('Local review required');return proposals.delete(id);}
 return Object.freeze({propose,review,discard,list:()=>[...proposals.values()].map(view)});
}
