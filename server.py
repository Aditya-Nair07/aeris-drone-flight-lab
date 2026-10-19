"""Local-only simulation server; no cloud services, telemetry or API keys."""
import argparse
import csv
import io
import json
import threading
import time
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from simulator import DroneSim, DT

ROOT = Path(__file__).resolve().parent
sim = DroneSim()
lock = threading.RLock()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'web'), **kwargs)

    def log_message(self, *args): pass

    def send_data(self, data, kind='application/json'):
        body = data.encode()
        self.send_response(200)
        self.send_header('Content-Type', kind)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == '/api/state':
            with lock: data = sim.state()
            self.send_data(json.dumps(data))
        elif self.path == '/api/export':
            with lock: rows = list(sim.rows)
            out = io.StringIO()
            writer = csv.DictWriter(out, fieldnames=rows[0].keys())
            writer.writeheader()
            writer.writerows(rows)
            self.send_data(out.getvalue(), 'text/csv')
        else: super().do_GET()

    def do_POST(self):
        if self.path != '/api/command':
            self.send_error(404)
            return
        try:
            size = int(self.headers.get('Content-Length',0))
            if size > 4096: raise ValueError('Command too large')
            data = json.loads(self.rfile.read(size))
            action = data.get('action')
            if action not in ('start','pause','reset','gust','disconnect','land','target'): raise ValueError('Unknown action')
            with lock:
                sim.command(action, data)
                result = sim.state()
            self.send_data(json.dumps(result))
        except (ValueError, TypeError) as exc:
            self.send_error(400, str(exc))


def physics_loop():
    last = time.perf_counter()
    accumulator = 0.
    while True:
        now = time.perf_counter()
        accumulator += min(now-last, .1)
        last = now
        with lock:
            while accumulator >= DT:
                sim.step()
                accumulator -= DT
        time.sleep(.002)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port',type=int,default=8765)
    args = parser.parse_args()
    threading.Thread(target=physics_loop, daemon=True).start()
    print(f'Drone Flight Lab ready: http://127.0.0.1:{args.port}', flush=True)
    ThreadingHTTPServer(('127.0.0.1', args.port), Handler).serve_forever()
