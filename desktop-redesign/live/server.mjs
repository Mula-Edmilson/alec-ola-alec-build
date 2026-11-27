import http from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createLiveSession} from './transport.mjs';
const key=process.env.ALEC_LIVE_API_KEY,model=process.env.ALEC_LIVE_MODEL;
if(!key||!model||process.env.ALEC_LIVE_CONSENT!=='yes'){console.error('Define ALEC_LIVE_API_KEY, ALEC_LIVE_MODEL e ALEC_LIVE_CONSENT=yes após rever o custo e a transmissão de áudio.');process.exit(1);}
const token=randomBytes(32).toString('hex');
const files=new Map([['/',['index.html','text/html; charset=utf-8']],['/client.js',['client.js','text/javascript']],['/capture.js',['capture.js','text/javascript']]]);
let active=null,origin;
function authorized(req){const got=Buffer.from(String(req.headers['x-alec-token']||''));return got.length===token.length&&timingSafeEqual(got,Buffer.from(token))&&req.headers.origin===origin;}
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
 if(req.headers.host!==origin?.slice(7)){res.writeHead(403).end();return;}
 const route=req.url;
 if(req.method==='GET'&&files.has(route)){const [file,type]=files.get(route);res.writeHead(200,{'Content-Type':type});res.end(readFileSync(new URL(file,import.meta.url)));return;}
 if(req.method!=='POST'||!authorized(req)){res.writeHead(403).end();return;}
 if(route==='/session'){
  if(active){res.writeHead(409).end();return;}
  res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8'});res.flushHeaders();
  const current={live:null,res,timer:null};active=current;
  const finish=()=>{clearTimeout(current.timer);if(active===current)active=null;if(!res.writableEnded)res.end();};
  try{current.live=createLiveSession({apiKey:key,model,emit:event=>{if(!res.writableEnded&&!res.write(JSON.stringify(event)+'\n'))current.live?.close('client_backpressure');},onClose:finish});}
  catch{res.write(JSON.stringify({type:'closed',reason:'invalid_configuration'})+'\n');finish();return;}
  current.timer=setTimeout(()=>current.live.close('session_limit'),10*60*1000);current.timer.unref();
  res.on('close',()=>current.live.close('client_closed'));return;
 }
 if(route==='/stop'){active?.live.close();res.writeHead(204).end();return;}
 if(route==='/audio'&&active){
  const current=active,parts=[];let size=0;
  try{for await(const chunk of req){size+=chunk.length;if(size>6400){res.writeHead(413).end();return;}parts.push(chunk);}}
  catch{res.writeHead(400).end();return;}
  const ok=active===current&&current.live.audio(Buffer.concat(parts));res.writeHead(ok?204:409).end();return;
 }
 res.writeHead(404).end();
});
server.listen(0,'127.0.0.1',()=>{origin='http://127.0.0.1:'+server.address().port;console.log('Abre no Edge/Chrome: '+origin+'/#'+token);});
process.on('SIGINT',()=>{active?.live.close();server.close();});
