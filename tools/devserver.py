"""Local dev server: serves web/ and saves frames posted by window.oosShot(name) to tools/shots/.
Run: python tools/devserver.py 8137   (development only; the real site is plain static files)
Code written with an AI assistant (Claude Code, Anthropic), Nov 2026.
"""
import base64, http.server, os, sys, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, "web")
SHOTS = os.path.join(ROOT, "tools", "shots")
os.makedirs(SHOTS, exist_ok=True)


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=WEB, **k)

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        if u.path != "/__shot":
            self.send_error(404); return
        name = "".join(c for c in urllib.parse.parse_qs(u.query).get("name", ["shot"])[0] if c.isalnum() or c in "-_")[:60] or "shot"
        data = self.rfile.read(int(self.headers.get("Content-Length", 0))).decode()
        raw = base64.b64decode(data.split(",", 1)[1])
        with open(os.path.join(SHOTS, name + ".jpg"), "wb") as f:
            f.write(raw)
        self.send_response(204); self.end_headers()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8137
http.server.ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
