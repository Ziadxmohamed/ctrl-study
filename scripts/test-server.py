"""Serve the repository under a GitHub Pages-like subpath for browser tests."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit
ROOT = Path(__file__).resolve().parent.parent
class Handler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass
    def translate_path(self, path):
        path = urlsplit(path).path
        if path.startswith('/repository/'):
            path = path[len('/repository/'):]
        else:
            path = '__missing__'
        result = (ROOT / path).resolve()
        return str(result) if result.is_relative_to(ROOT) else str(ROOT / '__missing__')
ThreadingHTTPServer(('127.0.0.1', 8081), Handler).serve_forever()
