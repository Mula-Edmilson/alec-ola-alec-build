import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {makePairMatrix,QR_PY,buildPairRunner} from './alec-qr-runtime.mjs';
import {RUNNER} from './alec-bridge-supervisor.mjs';
const ticket='abcdefghijklmnopqrstuvwxyz123456';
const matrix=makePairMatrix('100.101.22.33',ticket);
assert.ok(matrix.length>=21&&matrix.length===matrix[0].length);
assert.ok(matrix.every(s=>s.length===matrix.length&&/^[01]+$/.test(s)));
assert.notDeepEqual(matrix,makePairMatrix('100.101.22.33','Z'+ticket.slice(1)));
for(const ip of ['192.168.1.2','127.0.0.1','100.128.1.2','100.64.1.256'])assert.throws(()=>makePairMatrix(ip,ticket));
assert.throws(()=>makePairMatrix('100.101.22.33','bad'));
const runner=buildPairRunner(RUNNER);
assert.ok(runner.includes('for line in sys.stdin.buffer')&&runner.includes('server.ThreadingHTTPServer((bind,server.PORT),handler)'));
const py='import threading, ipaddress, json\n'+QR_PY+'\n'+String.raw`
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import Request,urlopen
from urllib.error import HTTPError
from types import SimpleNamespace
clock=[100.]
w=AlecPairWindow(lambda:clock[0])
a=w.issue()
assert len(a['ticket'])==32
assert w.claim('é'*32) is None
assert w.claim(a['ticket'])==a['serial']
assert w.claim(a['ticket']) is None
a=w.issue();b=w.issue()
assert w.claim(a['ticket']) is None
clock[0]+=120
assert w.claim(b['ticket']) is None
issued=w.issue()
results=[]
threads=[threading.Thread(target=lambda:results.append(w.claim(issued['ticket']))) for _ in range(12)]
for t in threads:t.start()
for t in threads:t.join()
assert results.count(issued['serial'])==1
class Base(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def network_ok(self):return True
    def json_reply(self,code,data):
        body=json.dumps(data).encode()
        self.send_response(code);self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
    def do_POST(self):return self.json_reply(200,{'legacy':True})
server=SimpleNamespace(Handler=Base,TOKEN_LOCK=threading.RLock(),TOKENS=set(),VERSION='16.0.0')
used=[]
Handler=alec_pair_handler(server,w,used.append)
class Peer(Handler):
    def setup(self):
        super().setup()
        self.client_address=('100.101.22.33',self.client_address[1])
with ThreadingHTTPServer(('127.0.0.1',0),Peer) as srv:
    t=threading.Thread(target=srv.serve_forever,daemon=True);t.start()
    base='http://127.0.0.1:'+str(srv.server_port)
    def post(path,obj):
        r=Request(base+path,data=json.dumps(obj).encode(),headers={'Content-Type':'application/json'})
        try:
            with urlopen(r,timeout=5) as x:return x.status,json.loads(x.read())
        except HTTPError as x:return x.code,json.loads(x.read())
    a=w.issue()
    assert post('/api/pair/qr',{'ticket':'wrong'})[0]==403
    code,data=post('/api/pair/qr',{'ticket':a['ticket']})
    assert code==200 and data['token'] in server.TOKENS and used==[a['serial']]
    assert post('/api/pair/qr',{'ticket':a['ticket']})[0]==403
    assert post('/api/pair',{'code':'123456'})==(200,{'legacy':True})
    assert post('/api/pair/qr',{'ticket':'wrong','extra':True})[0]==400
    srv.shutdown()
print('QR: single-use, expiry, rotation, concurrency and actual HTTP handler passed.')
`;
const check=spawnSync('python',['-c',py],{encoding:'utf8',timeout:30000});
assert.equal(check.status,0,check.stderr||String(check.error||'Python QR test failed'));
console.log(check.stdout.trim());
console.log('Offline QR generator and managed runner passed.');
