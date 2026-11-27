// ALEC Universal AI: original provider presets and explicit request templates.
export const FREE_ENDPOINT='https://openrouter.ai/api/v1';
export const PROVIDER_PRESETS=Object.freeze([
 {id:'openrouter-free',label:'OpenRouter · Free',baseUrl:FREE_ENDPOINT,freeOnly:true,note:'Catálogo oficial de modelos :free, com preço zero anunciado. Limites e disponibilidade variam.'},
 {id:'groq',label:'Groq',baseUrl:'https://api.groq.com/openai/v1',note:'Limites e eventuais custos dependem da conta.'},
 {id:'cerebras',label:'Cerebras',baseUrl:'https://api.cerebras.ai/v1',note:'Créditos, trial ou plano conforme a conta.'},
 {id:'nvidia',label:'NVIDIA NIM',baseUrl:'https://integrate.api.nvidia.com/v1',note:'Acesso e créditos conforme a conta.'},
 {id:'fireworks',label:'Fireworks AI',baseUrl:'https://api.fireworks.ai/inference/v1',note:'Créditos ou utilização paga; verifica a conta.'},
 {id:'llamacpp',label:'llama.cpp',baseUrl:'http://127.0.0.1:9931/v1',note:'Servidor local iniciado pelo utilizador. Ajusta a porta.'}
].map(Object.freeze));
export const RECIPES=Object.freeze([
 {id:'code-review',title:'Revisão de código',description:'Auditar sem editar nem publicar.',prompt:'Revê o projecto que vou indicar. Identifica erros, riscos e melhorias. Não alteres ficheiros nem publiques alterações sem autorização. Projecto: '},
 {id:'design-brief',title:'Brief de design',description:'Estruturar uma proposta visual.',prompt:'Prepara um brief de design com objectivos, público, hierarquia, estilo e entregáveis. Não publiques nada. Projecto: '},
 {id:'diagnosis',title:'Diagnóstico técnico',description:'Analisar um problema antes de agir.',prompt:'Analisa o problema técnico que vou indicar. Começa por um diagnóstico não destrutivo, explica as evidências e propõe correcções para aprovação. Problema: '},
 {id:'files',title:'Organização de ficheiros',description:'Propor organização sem mover ficheiros.',prompt:'Analisa apenas a pasta autorizada que vou indicar. Propõe uma organização reversível; não movas, renomeies nem apagues ficheiros sem confirmação. Pasta: '},
 {id:'document',title:'Estrutura de documento',description:'Preparar conteúdo e estrutura.',prompt:'Prepara uma estrutura clara e profissional para o documento que vou indicar. Distingue factos de suposições e pergunta antes de gravar ou enviar ficheiros. Tema: '},
 {id:'research',title:'Pesquisa e comparação',description:'Comparar com fontes e limitações.',prompt:'Pesquisa o tema indicado usando fontes verificáveis quando as ferramentas estiverem disponíveis. Distingue factos, estimativas e dados não verificados. Não envies formulários nem compres nada. Tema: '}
].map(Object.freeze));
export const singleMode=config=>config?.alecSingleModel!==false;
export const recipe=id=>RECIPES.find(x=>x.id===id)||null;
export function isLoopback(value){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&['127.0.0.1','localhost','[::1]'].includes(u.hostname)&&!u.username&&!u.password;}catch{return false;}}
export function safeEndpoint(value,key=''){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&!u.search&&!u.hash&&(!key||u.protocol==='https:'||isLoopback(value));}catch{return false;}}
export function freeRows(data){
 if(!Array.isArray(data?.data))throw Error('Catálogo de modelos inválido.');
 const zero=v=>((typeof v==='number'||typeof v==='string'&&v.trim()!=='')&&Number.isFinite(Number(v))&&Number(v)===0);
 const seen=new Set(),out=[];
 for(const row of data.data){
  if(typeof row?.id!=='string'||row.id.length>180||!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+:free$/.test(row.id)||seen.has(row.id))continue;
  if(!row.pricing||!zero(row.pricing.prompt)||!zero(row.pricing.completion)||!Object.values(row.pricing).every(zero))continue;
  if(row.architecture?.output_modalities&&!row.architecture.output_modalities.includes('text'))continue;
  const context=Number(row.context_length);
  seen.add(row.id);out.push({rawId:row.id,contextWindow:Number.isInteger(context)&&context>=1024?Math.min(context,1048576):4096,contextWindowKnown:true,supportsChat:true,supportsTools:false,supportsImages:false,supportsThinking:false});
  if(out.length>=200)break;
 }
 return out;
}
export async function fetchFreeCatalog({fetcher=fetch}={}){
 const res=await fetcher(FREE_ENDPOINT+'/models',{method:'GET',redirect:'error',headers:{accept:'application/json'},signal:AbortSignal.timeout(12000)});
 if(!res.ok)throw Error('Catálogo OpenRouter indisponível.');
 const reader=res.body?.getReader();if(!reader)throw Error('Resposta sem conteúdo.');
 const chunks=[];let total=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>4*1024*1024)throw Error('Catálogo demasiado grande.');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
 return freeRows(JSON.parse(Buffer.concat(chunks).toString('utf8')));
}
export async function probeFree(server,{fetcher}={}){
 if(server?.baseUrl!==FREE_ENDPOINT||server.freeOnly!==true)return {endpoint:server,reachable:false,reason:'Endpoint gratuito inválido',models:[]};
 try{const models=(await fetchFreeCatalog({fetcher})).map(m=>({...m,endpointId:server.id}));return {endpoint:server,reachable:true,models};}catch{return {endpoint:server,reachable:false,reason:'Catálogo gratuito indisponível',models:[]};}
}
export async function verifyFreeModel(server,rawId,{fetcher}={}){
 const p=await probeFree(server,{fetcher});return p.reachable&&p.models.some(m=>m.rawId===rawId);
}
