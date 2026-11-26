// ALEC release discovery. No execution or download of unverified binaries.
const endpoint='https://api.github.com/repos/Mula-Edmilson/alec-ola-alec-build/releases/latest';
const versionPattern=/^v?(\d{1,9})\.(\d{1,9})\.(\d{1,9})$/;
export function parseVersion(value){
 const m=typeof value==='string'&&versionPattern.exec(value);
 if(!m)return null;
 return m.slice(1).map(Number);
}
export function newer(candidate,current){
 const a=parseVersion(candidate),b=parseVersion(current);
 if(!a||!b)return false;
 for(let i=0;i<3;i++)if(a[i]!==b[i])return a[i]>b[i];
 return false;
}
export async function checkAlecRelease(current,{request=fetch}={}){
 if(!parseVersion(current))throw Error('Versão ALEC inválida.');
 const response=await request(endpoint,{headers:{Accept:'application/vnd.github+json','User-Agent':'ALEC-Desktop'},redirect:'error',signal:AbortSignal.timeout(10000)});
 if(response.status===404)return {state:'no-release'};
 if(!response.ok)throw Error('Não foi possível consultar as versões ALEC.');
 const release=await response.json();
 if(release.draft!==false||release.prerelease!==false||!parseVersion(release.tag_name))return {state:'no-release'};
 if(!newer(release.tag_name,current))return {state:'current'};
 const tag=release.tag_name;
 return {state:'available',version:tag.replace(/^v/,''),notes:typeof release.body==='string'?release.body.slice(0,16000):'',url:'https://github.com/Mula-Edmilson/alec-ola-alec-build/releases/tag/'+encodeURIComponent(tag)};
}
