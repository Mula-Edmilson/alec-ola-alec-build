// Small local models get a bounded text context, never the full application manual.
export function localTextOnly(model){
 if(!model)return false;
 const label=String(model.name||'')+' '+String(model.id||'');
 return model.supportsTools===false||model.supportsImages!==true||/lfm[-_. ]?3.*omni/i.test(label);
}
export function localContextWindow(model,reported){
 const n=Number(reported),w=Number.isFinite(n)&&n>=512?Math.floor(n):2048;
 // LFM3 Omni on small RAM systems frequently runs in a much smaller server context
 // than the model's advertised training window. Use a conservative request budget.
 return /lfm[-_. ]?3.*omni/i.test(String(model?.name||'')+' '+String(model?.id||''))?Math.min(w,2048):Math.min(w,8192);
}
export function estimateText(s){
 // Conservative for multilingual text/code: UTF-8 bytes/2 plus message framing.
 return Math.ceil(Buffer.byteLength(String(s),'utf8')/2)+16;
}
export function conversationBudget(model,reported,system){
 const window=localContextWindow(model,reported);
 const advertised=Number(model?.maxOutputTokens);
 const output=Math.max(256,Math.min(window>>2,Number.isFinite(advertised)&&advertised>0?advertised:512));
 return Math.max(96,window-output-128-estimateText(system));
}
export function fitLocalText(messages,budget){
 const clean=messages.filter(m=>m&&(m.role==='user'||m.role==='assistant')&&typeof m.content==='string'&&m.content.trim());
 if(!clean.length)return [];
 // Keep the newest user request whole, plus complete preceding turns where they fit.
 let last=clean.findLastIndex(m=>m.role==='user');
 if(last<0)return [];
 const newest=clean.slice(last),cost=items=>items.reduce((n,m)=>n+estimateText(m.content),0);
 let used=cost(newest),out=newest;
 if(used>budget)return newest; // caller rejects an oversized user request explicitly
 for(let end=last;end>0;){
  let start=end-1;while(start>=0&&clean[start].role!=='user')start--;
  if(start<0)break;
  const turn=clean.slice(start,end),n=cost(turn);
  if(used+n>budget)break;
  out=turn.concat(out);used+=n;end=start;
 }
 return out;
}
export function compactAlecGuide(name){
 return 'Aplicação: ALEC Desktop; personagem: '+String(name||'ALEC').slice(0,60)+'. Painel pelo ícone junto ao relógio. Menu: Assistente, Conversas, Visão, Memória, ALEC Remote, Skill Hub, Definições, Sobre. Voz: Definições > Voz e áudio. Modelos: Definições > Inteligência artificial. Não inventes outras funções.';
}
