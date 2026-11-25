// Generate original ALEC logo assets in the pinned Tauri source. No external dependencies.
import fs from 'node:fs';
import path from 'node:path';
import {deflateSync} from 'node:zlib';
const polys=[[[279,298],[522,298],[734,515],[617,630],[471,486],[280,671]],[[575,298],[969,298],[969,509],[783,693],[781,508]],[[279,726],[465,550],[465,785],[629,951],[279,951]],[[508,777],[749,776],[969,564],[967,951],[683,951]]].map(p=>p.map(([x,y])=>[(x-279)/690,(y-298+18.5)/690]));
function inside(x,y,p){let v=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const [a,b]=p[i],[c,d]=p[j];if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)v=!v;}return v;}
function crc(b){let c=0xffffffff;for(const n of b){c^=n;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function chunk(t,b){const tag=Buffer.from(t),h=Buffer.alloc(4),z=Buffer.alloc(4);h.writeUInt32BE(b.length);z.writeUInt32BE(crc(Buffer.concat([tag,b])));return Buffer.concat([h,tag,b,z]);}
function png(n){const raw=Buffer.alloc(n*(1+n*4)),pad=n<=24?.09:.13,span=1-pad*2;for(let y=0;y<n;y++)for(let x=0;x<n;x++){let k=0;for(let j=0;j<4;j++)for(let i=0;i<4;i++)if(polys.some(p=>inside(((x+(i+.5)/4)/n-pad)/span,((y+(j+.5)/4)/n-pad)/span,p)))k++;const a=k/16,o=y*(n*4+1)+1+x*4;raw[o]=raw[o+1]=Math.round(15+240*a);raw[o+2]=Math.round(39+216*a);raw[o+3]=255;}const h=Buffer.alloc(13);h.writeUInt32BE(n);h.writeUInt32BE(n,4);h[8]=8;h[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);}
const dir=path.resolve(process.argv[2]||'upstream','showcase/tauri/src-tauri/icons'),sizes=[16,20,24,32,40,48,64,128,256],imgs=sizes.map(png),h=Buffer.alloc(6+16*sizes.length);
h.writeUInt16LE(1,2);h.writeUInt16LE(sizes.length,4);let off=h.length;for(let i=0;i<sizes.length;i++){const n=sizes[i],p=6+16*i,b=imgs[i];h[p]=h[p+1]=n===256?0:n;h.writeUInt16LE(1,p+4);h.writeUInt16LE(32,p+6);h.writeUInt32LE(b.length,p+8);h.writeUInt32LE(off,p+12);off+=b.length;}
fs.writeFileSync(path.join(dir,'icon.ico'),Buffer.concat([h,...imgs]));
for(const [f,n] of [['32x32.png',32],['128x128.png',128],['128x128@2x.png',256],['icon.png',512]])if(fs.existsSync(path.join(dir,f)))fs.writeFileSync(path.join(dir,f),png(n));
const parts=[['icp4',16],['icp5',32],['icp6',64],['ic07',128],['ic08',256],['ic09',512]].map(([t,n])=>{const b=png(n),h=Buffer.alloc(8);h.write(t);h.writeUInt32BE(b.length+8,4);return Buffer.concat([h,b]);});const c=Buffer.alloc(8);c.write('icns');c.writeUInt32BE(8+parts.reduce((a,b)=>a+b.length,0),4);if(fs.existsSync(path.join(dir,'icon.icns')))fs.writeFileSync(path.join(dir,'icon.icns'),Buffer.concat([c,...parts]));
console.log('Official ALEC icon: Windows ICO (9 sizes), PNG and ICNS generated.');
