import qrcode from './alec-qrcode.cjs';
export function makePairMatrix(bind,ticket){
 const nums=String(bind).split('.').map(Number);
 if(!/^100\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(bind)||nums[1]<64||nums[1]>127||nums.some(n=>!Number.isInteger(n)||n<0||n>255)||!/^[A-Za-z0-9_-]{32}$/.test(ticket))throw Error('Invalid private pairing ticket');
 const qr=qrcode(0,'M');qr.addData('ALEC1|'+bind+'|8765|'+ticket,'Byte');qr.make();
 return Array.from({length:qr.getModuleCount()},(_,y)=>Array.from({length:qr.getModuleCount()},(_,x)=>qr.isDark(y,x)?'1':'0').join(''));
}
// Only the audited managed V16 child receives this code, never the original installation.
export const QR_PY=String.raw`
import hmac, secrets, time
from urllib.parse import urlparse
class AlecPairWindow:
    def __init__(self, clock=time.monotonic):
        self.clock=clock
        self.lock=threading.RLock()
        self.serial=0
        self.ticket=''
        self.until=0
    def issue(self):
        with self.lock:
            self.serial+=1
            self.ticket=secrets.token_urlsafe(24)
            self.until=self.clock()+120
            return {'serial':self.serial,'ticket':self.ticket,'ttl':120}
    def claim(self, ticket):
        if not isinstance(ticket,str) or len(ticket)!=32 or not all(c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-' for c in ticket):
            return None
        with self.lock:
            if self.clock()>=self.until or not self.ticket or not hmac.compare_digest(ticket,self.ticket):
                return None
            self.ticket=''
            return self.serial
def alec_pair_handler(server,window,consumed):
    class Handler(server.Handler):
        def do_POST(self):
            if urlparse(self.path).path!='/api/pair/qr':
                return super().do_POST()
            if not self.network_ok():return
            if ipaddress.ip_address(self.client_address[0]) not in ipaddress.ip_network('100.64.0.0/10'):
                return self.json_reply(403,{'error':'Emparelhamento QR exige Tailscale.'})
            if self.headers.get('Transfer-Encoding'):
                self.close_connection=True
                return self.json_reply(400,{'error':'Pedido inválido.'})
            try:
                size=int(self.headers.get('Content-Length','0'))
                if not 1<=size<=256:raise ValueError()
                self.connection.settimeout(5)
                data=json.loads(self.rfile.read(size))
                if not isinstance(data,dict) or set(data)!={'ticket'}:raise ValueError()
            except (ValueError,OSError,UnicodeError):
                self.close_connection=True
                return self.json_reply(400,{'error':'Pedido inválido.'})
            with server.TOKEN_LOCK:
                if len(server.TOKENS)>=16:return self.json_reply(409,{'error':'Limite de dispositivos atingido.'})
                serial=window.claim(data['ticket'])
                if serial is None:return self.json_reply(403,{'error':'QR inválido, utilizado ou expirado. Gera outro no PC.'})
                token=secrets.token_urlsafe(36)
                server.TOKENS.add(token)
            consumed(serial)
            return self.json_reply(200,{'token':token,'version':server.VERSION})
    return Handler
`;
export function buildPairRunner(original){
 const start='with server.ThreadingHTTPServer((bind,server.PORT),server.Handler) as srv:';
 const watch='    def watch():\n        try: sys.stdin.buffer.read()\n        finally: srv.shutdown()';
 if(original.split(start).length!==2||original.split(watch).length!==2)throw Error('Audited V16 runner changed');
 const setup=QR_PY+"\nwindow=AlecPairWindow()\noutput_lock=threading.Lock()\ndef pair_emit(kind,payload):\n    with output_lock: print(kind+' '+json.dumps(payload),flush=True)\ndef pair_issue(): pair_emit('ALEC_MANAGED_PAIR',window.issue())\nhandler=alec_pair_handler(server,window,lambda n:pair_emit('ALEC_MANAGED_PAIR_USED',{'serial':n}))\nwith server.ThreadingHTTPServer((bind,server.PORT),handler) as srv:";
 const stdin="    pair_issue()\n    def watch():\n        try:\n            for line in sys.stdin.buffer:\n                if line.strip()==b'rotate':pair_issue()\n        finally: srv.shutdown()";
 return original.replace(start,()=>setup).replace(watch,()=>stdin);
}
