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

import hashlib, os, re, tempfile
from pathlib import Path
class AlecDevices:
    MAX = 16
    def __init__(self, file):
        self.file = Path(file)
        self.lock = threading.RLock()
        self.hashes = set()
        try:
            if self.file.is_symlink() or self.file.stat().st_size > 8192:
                raise ValueError('Registo de dispositivos invalido')
            data = json.loads(self.file.read_text(encoding='utf-8'))
            if not isinstance(data,list) or len(data)>self.MAX or any(not isinstance(x,str) or not re.fullmatch('[a-f0-9]{64}',x) for x in data):
                raise ValueError('Registo de dispositivos invalido')
            self.hashes=set(data)
        except FileNotFoundError:
            pass
    @staticmethod
    def digest(token):
        if not isinstance(token,str) or not re.fullmatch('[A-Za-z0-9_-]{48}',token):return None
        return hashlib.sha256(token.encode('ascii')).hexdigest()
    def has(self,token):
        digest=self.digest(token)
        with self.lock:return digest is not None and digest in self.hashes
    def count(self):
        with self.lock:return len(self.hashes)
    def _replace(self,new):
        self.file.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
        fd,name=tempfile.mkstemp(prefix='.devices-',dir=self.file.parent)
        try:
            with os.fdopen(fd,'w',encoding='utf-8') as f:
                json.dump(sorted(new),f);f.flush();os.fsync(f.fileno())
            os.replace(name,self.file)
        finally:
            if os.path.exists(name):os.unlink(name)
        self.hashes=new
    def add(self,token):
        digest=self.digest(token)
        if digest is None:raise ValueError('Invalid token')
        with self.lock:
            if len(self.hashes)>=self.MAX and digest not in self.hashes:raise ValueError('Device limit')
            self._replace(self.hashes|{digest})
    def revoke(self,token):
        with self.lock:self._replace(self.hashes-{self.digest(token)})
    def revoke_all(self):
        with self.lock:self._replace(set())

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
def alec_pair_handler(server,window,consumed,devices=None):
    class Handler(server.Handler):
        def authorised(self):
            token=self.headers.get('Authorization','')
            token=token[7:] if token.startswith('Bearer ') else ''
            if devices is not None and devices.has(token):return True
            return super().authorised()
        def do_POST(self):
            route=urlparse(self.path).path
            if devices is not None and route=='/api/pair/revoke':
                self.close_connection=True
                if not self.network_ok() or not self.authorised():return
                token=self.headers.get('Authorization','')[7:]
                with server.TOKEN_LOCK:
                    try:devices.revoke(token)
                    except OSError:return self.json_reply(503,{'error':'Não foi possível revogar.'})
                    server.TOKENS.discard(token)
                return self.json_reply(200,{'revoked':True})
            if route!='/api/pair/qr':
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
                if (devices.count() if devices is not None else len(server.TOKENS))>=16:return self.json_reply(409,{'error':'Limite de dispositivos atingido.'})
                serial=window.claim(data['ticket'])
                if serial is None:return self.json_reply(403,{'error':'QR inválido, utilizado ou expirado. Gera outro no PC.'})
                token=secrets.token_urlsafe(36)
                if devices is not None:
                    try:devices.add(token)
                    except (OSError,ValueError):return self.json_reply(503,{'error':'Não foi possível guardar o dispositivo. Gera outro QR.'})
                else:server.TOKENS.add(token)
            consumed(serial)
            return self.json_reply(200,{'token':token,'version':server.VERSION})
    return Handler
`;
export function buildPairRunner(original){
 const start='with server.ThreadingHTTPServer((bind,server.PORT),server.Handler) as srv:';
 const watch='    def watch():\n        try: sys.stdin.buffer.read()\n        finally: srv.shutdown()';
 if(original.split(start).length!==2||original.split(watch).length!==2)throw Error('Audited V16 runner changed');
 const setup=QR_PY+"\nwindow=AlecPairWindow()\noutput_lock=threading.Lock()\ndef pair_emit(kind,payload):\n    with output_lock: print(kind+' '+json.dumps(payload),flush=True)\ndef pair_issue(): pair_emit('ALEC_MANAGED_PAIR',window.issue())\ndevices=AlecDevices(Path(os.environ.get('LOCALAPPDATA',str(Path.home())))/'ALEC'/'Remote'/'devices.json')\nhandler=alec_pair_handler(server,window,lambda n:pair_emit('ALEC_MANAGED_PAIR_USED',{'serial':n}),devices)\nwith server.ThreadingHTTPServer((bind,server.PORT),handler) as srv:";
 const stdin="    pair_issue()\n    def watch():\n        try:\n            for line in sys.stdin.buffer:\n                if line.strip()==b'rotate':pair_issue()\n                elif line.strip()==b'revoke-all':\n                    try:\n                        with server.TOKEN_LOCK:\n                            devices.revoke_all();server.TOKENS.clear()\n                        pair_issue()\n                    except OSError:pair_emit('ALEC_MANAGED_PAIR_ERROR',{'error':'Não foi possível revogar os dispositivos.'})\n        finally: srv.shutdown()";
 return original.replace(start,()=>setup).replace(watch,()=>stdin);
}
