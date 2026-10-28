#!/usr/bin/env python3
"""对照页保存服务。改自 T016_对照页服务.py。
启动: python3 compare_server.py --page 对照页.html --port 8767
读出锦成版: python3 compare_server.py --page 对照页.html --dump
"""
import argparse, datetime, json, os, re, tempfile, threading
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path

DATA = re.compile(r'(<script id="compare-data" type="application/json">)(.*?)(</script>)', re.S)
LOCK = threading.Lock()
PAGE = None

def read():
    html = PAGE.read_text(encoding='utf-8')
    return html, json.loads(DATA.search(html).group(2))

def write(html, state):
    encoded = json.dumps(state, ensure_ascii=False).replace('<', '\\u003c')
    html = DATA.sub(lambda m: m.group(1) + encoded + m.group(3), html, count=1)
    with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=PAGE.parent, prefix='.compare-save-', delete=False) as f:
        f.write(html); f.flush(); os.fsync(f.fileno()); tmp = f.name
    os.replace(tmp, PAGE)

class H(BaseHTTPRequestHandler):
    timeout = 15
    def log_message(self, *a): pass
    def reply(self, code, payload, mime='application/json; charset=utf-8'):
        raw = payload.encode() if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(code); self.send_header('Content-Type', mime); self.send_header('Content-Length', str(len(raw)))
        self.send_header('Cache-Control', 'no-store'); self.end_headers(); self.wfile.write(raw)
    def ok_host(self): return self.headers.get('Host') == f'127.0.0.1:{self.server.server_port}'
    def do_GET(self):
        if not self.ok_host(): return self.reply(403, {'error': 'bad host'})
        if self.path == '/': return self.reply(200, PAGE.read_text(encoding='utf-8'), 'text/html; charset=utf-8')
        if self.path == '/api/state': return self.reply(200, read()[1])
        self.reply(404, {'error': 'not found'})
    def do_POST(self):
        origin = f'http://127.0.0.1:{self.server.server_port}'
        if not self.ok_host() or self.headers.get('Origin') != origin or self.headers.get('X-Compare-Save') != '1':
            return self.reply(403, {'error': 'same-origin only'})
        if self.path != '/api/save': return self.reply(404, {'error': 'not found'})
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 2_000_000: raise ValueError('bad size')
            upd = json.loads(self.rfile.read(size))
            with LOCK:
                html, state = read()
                if upd.get('revision') != state['revision']:
                    return self.reply(409, {'error': 'revision conflict', 'revision': state['revision']})
                secs = upd.get('sections')
                if not isinstance(secs, list) or len(secs) != len(state['sections']): raise ValueError('段数不对')
                if [s.get('id') for s in secs] != [s['id'] for s in state['sections']]: raise ValueError('段号不对')
                for s in secs:
                    if any(not isinstance(s.get(k), str) or len(s[k]) > 30000 for k in ('mine', 'note')): raise ValueError('文字不合法')
                now = datetime.datetime.now().astimezone().isoformat()
                changed = False
                for old, new in zip(state['sections'], secs):
                    if old['mine'] != new['mine'] or old['note'] != new['note']:
                        old['history'].append({'at': now, 'mine': old['mine'], 'note': old['note']})
                        old['mine'], old['note'] = new['mine'], new['note']; changed = True
                if changed:
                    state['revision'] += 1; state['updatedAt'] = now; write(html, state)
                self.reply(200, {'revision': state['revision'], 'updatedAt': state['updatedAt'] or now})
        except (ValueError, KeyError, TypeError) as e:
            self.reply(400, {'error': str(e)})

def main():
    global PAGE
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--page', required=True); ap.add_argument('--port', type=int, default=8767)
    ap.add_argument('--dump', action='store_true', help='打印锦成版和改动历史后退出')
    a = ap.parse_args(); PAGE = Path(a.page).resolve()
    if a.dump:
        _, s = read()
        out = {'title': s['title'], 'revision': s['revision'], 'updatedAt': s['updatedAt'],
               'sections': [{'id': x['id'], 'title': x['title'], 'mine': x['mine'], 'note': x['note'], 'base': x.get('base', x['refs'].get('通用版', '')), 'history': x['history']} for x in s['sections']]}
        print(json.dumps(out, ensure_ascii=False, indent=1)); return
    srv = ThreadingHTTPServer(('127.0.0.1', a.port), H)
    print(f'对照页: http://127.0.0.1:{srv.server_port}/', flush=True); srv.serve_forever()

if __name__ == '__main__':
    main()
