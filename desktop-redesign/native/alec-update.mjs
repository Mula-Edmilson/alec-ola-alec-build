// Release discovery is metadata only. Native Tauri verifies the installer signature.
const repo='Mula-Edmilson/alec-ola-alec-build';
const root='https://api.github.com/repos/'+repo+'/releases';
const versionPattern=/^v?(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/;
export function parseVersion(value){
 const m=typeof value==='string'&&versionPattern.exec(value);
 return m?m.slice(1).map(Number):null;
}
export function newer(candidate,current){
 const a=parseVersion(candidate),b=parseVersion(current);
 if(!a||!b)return false;
 for(let i=0;i<3;i++)if(a[i]!==b[i])return a[i]>b[i];
 return false;
}
export async function checkAlecRelease(current,{request=fetch,channel='stable'}={}){
 if(!parseVersion(current)||!['stable','preview'].includes(channel))throw Error('Versão ou canal ALEC inválido.');
 const response=await request(root+(channel==='preview'?'?per_page=30':'/latest'),{headers:{Accept:'application/vnd.github+json','User-Agent':'ALEC-Desktop'},redirect:'error',signal:AbortSignal.timeout(10000)});
 if(response.status===404)return {state:'no-release'};
 if(!response.ok)throw Error('Não foi possível consultar as versões ALEC.');
 const body=await response.json();
 const list=channel==='preview'?body:[body];
 if(!Array.isArray(list))throw Error('Resposta ALEC inválida.');
 const releases=list.filter(r=>r&&r.draft===false&&typeof r.prerelease==='boolean'&&(channel==='preview'||!r.prerelease)&&/^v/.test(r.tag_name)&&parseVersion(r.tag_name));
 if(!releases.length)return {state:'no-release'};
 const release=releases.reduce((a,b)=>newer(b.tag_name,a.tag_name)?b:a);
 if(!newer(release.tag_name,current))return {state:'current'};
 const tag=release.tag_name;
 const feed='https://github.com/'+repo+'/releases/download/'+tag+'/latest.json';
 const hasFeed=Array.isArray(release.assets)&&release.assets.some(a=>a.name==='latest.json'&&a.browser_download_url===feed&&a.state==='uploaded');
 return {state:'available',version:tag.slice(1),tag,channel:release.prerelease?'preview':'stable',hasFeed,notes:typeof release.body==='string'?release.body.slice(0,16000):'',url:'https://github.com/'+repo+'/releases/tag/'+tag};
}
