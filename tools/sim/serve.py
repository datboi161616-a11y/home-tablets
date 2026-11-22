"""python tools/sim/serve.py [port]

Serves the site from this project for trying changes out: in a browser on this PC, or on
a real tablet plugged in over USB (adb reverse tcp:5173 tcp:5173, then start the app
with --es site http://localhost:5173/).

Unlike "python -m http.server" it tells the browser never to keep copies. With copies
allowed, a reload right after an edit quietly reuses the old files (the browser treats
them as still fresh), and you end up testing code that is no longer on disk.
"""
import functools
import http.server
import os
import sys


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
    # The project itself, or another folder given as the second word (the built site, "_site").
    root = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    # This PC only: nothing else on the network needs to reach it.
    server = http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(Handler, directory=root))
    print(f'Serving {root} at http://localhost:{port}/ (no caching)', flush=True)
    server.serve_forever()


if __name__ == '__main__':
    main()
