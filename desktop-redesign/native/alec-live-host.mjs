// Original bounded loopback gateway for explicitly started ALEC Live sessions.
import http from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
const TYPES={'/':'text/html; charset=utf-8','/client.js':'text/javascript; charset=utf-8','/capture.js':'text/javascript; charset=utf-8'};
export async function startLiveHost({connect,assets,onEnd=()=>{},onState=()=>{},startMs=60000,maxMs=600000}){
 if(typeof connect!=='function'||!Object.keys(TYPES).every(k=>typeof assets[k]==='string'))throw Error('Live configuration');
 const token=randomBytes(32).toString('hex');let origin,active=null,used=false,ended=false,timer;
 const close=(reason='stopped')=>{if(ended)return;ended=true;clearTimeout(timer);const a=active;active=null;try{a?.close(reason);}catch{}server.close();server.closeAllConnections?.();onEnd(reason);};
 const authorized=req=>{const got=Buffer.from(String(req.headers['x-alec-token']||''));return req.headers.origin===origin&&got.length===token.length&&timingSafeEqual(got,Buffer.from(token));};
 const server=http.createServer({requestTimeout:5000,headersTimeout:5000,maxHeaderSize:8192},async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  if(ended||req.headers.host!==origin?.slice(7)){res.writeHead(403).end();return;}
  if(req.method==='GET'&&Object.hasOwn(TYPES,req.url)){res.writeHead(200,{'Content-Type':TYPES[req.url]});res.end(assets[req.url]);return;}
  if(req.method!=='POST'||!authorized(req)){res.writeHead(403).end();return;}
  if(req.url==='/session'){
   if(used){res.writeHead(409).end();return;}used=true;clearTimeout(timer);
   res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8'});res.flushHeaders();
   const endStream=reason=>{if(!res.writableEnded)res.end();close(reason);};
   try{active=connect({emit:e=>{if(ended)return;if(e.type==='ready')onState('ready');if(!res.writableEnded&&!res.write(JSON.stringify(e)+'\n'))close('client_backpressure');},onClose:()=>endStream('session_ended')});}
   catch{res.end(JSON.stringify({type:'closed',reason:'connection_failed'})+'\n');close('connection_failed');return;}
   timer=setTimeout(()=>close('session_limit'),maxMs);timer.unref?.();
   res.on('close',()=>close('client_closed'));return;
  }
  if(req.url==='/stop'){res.writeHead(204).end();close();return;}
  if(req.url==='/audio'&&active){
   const a=active;let n=0;const parts=[];
   try{for await(const c of req){n+=c.length;if(n>6400){res.writeHead(413).end();return;}parts.push(c);}}
   catch{res.writeHead(400).end();return;}
   const ok=active===a&&!ended&&a.audio(Buffer.concat(parts));res.writeHead(ok?204:409).end();return;
  }
  res.writeHead(404).end();
 });
 server.maxConnections=12;server.on('clientError',(_e,socket)=>socket.destroy());
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 origin='http://127.0.0.1:'+server.address().port;
 timer=setTimeout(()=>close('start_timeout'),startMs);timer.unref?.();
 return {url:origin+'/#'+token,close};
}
