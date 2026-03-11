#!/usr/bin/env python3

import sys
from http.server import test  # type:ignore
from http.server import HTTPServer, SimpleHTTPRequestHandler


class CORSRequestHandler(SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        SimpleHTTPRequestHandler.end_headers(self)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f" -> http://localhost:{port}/")

    test(
        CORSRequestHandler,
        HTTPServer,
        port=port,
    )
