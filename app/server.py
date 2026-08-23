#!/usr/bin/env python3
"""Small, locked-down static server for the local Truck Driver English app."""

import argparse
import email.utils
import functools
import mimetypes
import os
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit


APP_ROOT = Path(__file__).resolve().parent
RANGE_RE = re.compile(r"bytes=(\d*)-(\d*)\Z")
SECURITY_HEADERS = {
    "Content-Security-Policy": (
        "default-src 'self'; base-uri 'none'; object-src 'none'; "
        "frame-ancestors 'none'; form-action 'self'; script-src 'self'; "
        "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
        "font-src 'self'; media-src 'self' blob:; connect-src 'self'; "
        "worker-src 'self'; manifest-src 'self'"
    ),
    "Permissions-Policy": (
        "microphone=(self), camera=(), geolocation=(), payment=(), usb=()"
    ),
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
}


class TruckDriverEnglishHandler(SimpleHTTPRequestHandler):
    """Serve only regular app files, with byte ranges and secure defaults."""

    server_version = "TruckDriverEnglish"
    sys_version = ""
    protocol_version = "HTTP/1.1"

    def end_headers(self):
        for name, value in SECURITY_HEADERS.items():
            self.send_header(name, value)
        super().end_headers()

    def version_string(self):
        return self.server_version

    def list_directory(self, path):
        self.send_error(404, "Not found")
        return None

    def do_GET(self):
        self._serve_file(send_body=True)

    def do_HEAD(self):
        self._serve_file(send_body=False)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Allow", "GET, HEAD, OPTIONS")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_POST(self):
        self.send_error(405, "Method not allowed")

    def do_PUT(self):
        self.send_error(405, "Method not allowed")

    def do_DELETE(self):
        self.send_error(405, "Method not allowed")

    def _decoded_path(self):
        try:
            return unquote(urlsplit(self.path).path, errors="strict")
        except (UnicodeDecodeError, ValueError):
            return None

    def _resolve_request_path(self):
        decoded = self._decoded_path()
        if decoded is None or "\x00" in decoded or "\\" in decoded:
            return None

        segments = [segment for segment in decoded.split("/") if segment]
        if any(segment.startswith(".") for segment in segments):
            return None
        if any(segment == "__pycache__" for segment in segments):
            return None

        root = Path(self.directory).resolve()
        candidate = (root / decoded.lstrip("/")).resolve()
        try:
            common = Path(os.path.commonpath((str(root), str(candidate))))
        except ValueError:
            return None
        if common != root:
            return None
        if candidate.suffix.lower() in {".py", ".pyc"}:
            return None
        return decoded, candidate

    def _serve_file(self, send_body):
        resolved = self._resolve_request_path()
        if resolved is None:
            self.send_error(404, "Not found")
            return
        decoded, candidate = resolved

        if candidate.is_dir():
            index = candidate / "index.html"
            if not index.is_file():
                self.send_error(404, "Not found")
                return
            if not decoded.endswith("/"):
                parsed = urlsplit(self.path)
                location = parsed.path + "/"
                if parsed.query:
                    location += "?" + parsed.query
                self.send_response(308)
                self.send_header("Location", location)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            candidate = index

        if not candidate.is_file():
            self.send_error(404, "Not found")
            return

        try:
            source = candidate.open("rb")
        except OSError:
            self.send_error(404, "Not found")
            return

        try:
            stat = os.fstat(source.fileno())
            size = stat.st_size
            byte_range = self._parse_range(self.headers.get("Range"), size)
            if byte_range is False:
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{size}")
                self.send_header("Accept-Ranges", "bytes")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return

            content_type = mimetypes.guess_type(str(candidate))[0]
            if candidate.suffix == ".webmanifest":
                content_type = "application/manifest+json"
            if content_type is None:
                content_type = "application/octet-stream"

            start, end = byte_range if byte_range is not None else (0, size - 1)
            length = max(0, end - start + 1)
            self.send_response(206 if byte_range is not None else 200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(length))
            self.send_header("Last-Modified", email.utils.formatdate(stat.st_mtime, usegmt=True))
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Cache-Control", "no-cache")
            if byte_range is not None:
                self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            self.end_headers()

            if send_body and length:
                source.seek(start)
                self._copy_exact(source, self.wfile, length)
        finally:
            source.close()

    @staticmethod
    def _parse_range(header, size):
        if header is None:
            return None
        if "," in header:
            return False
        match = RANGE_RE.fullmatch(header.strip())
        if match is None or size <= 0:
            return False

        first, last = match.groups()
        if not first and not last:
            return False
        if not first:
            suffix = int(last)
            if suffix <= 0:
                return False
            return max(0, size - suffix), size - 1

        start = int(first)
        if start >= size:
            return False
        end = size - 1 if not last else min(int(last), size - 1)
        if end < start:
            return False
        return start, end

    @staticmethod
    def _copy_exact(source, target, remaining):
        while remaining:
            block = source.read(min(64 * 1024, remaining))
            if not block:
                break
            target.write(block)
            remaining -= len(block)


class LocalThreadingHTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def make_handler(directory):
    return functools.partial(TruckDriverEnglishHandler, directory=str(Path(directory).resolve()))


def create_server(bind="127.0.0.1", port=8002, directory=APP_ROOT):
    root = Path(directory).resolve()
    if not root.is_dir():
        raise ValueError(f"App directory does not exist: {root}")
    return LocalThreadingHTTPServer((bind, port), make_handler(root))


def main():
    parser = argparse.ArgumentParser(description="Serve Truck Driver English locally")
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8002)
    parser.add_argument("--directory", type=Path, default=APP_ROOT)
    args = parser.parse_args()

    try:
        server = create_server(args.bind, args.port, args.directory)
    except ValueError as error:
        parser.error(str(error))

    host, port = server.server_address[:2]
    print(f"Truck Driver English is available at http://{host}:{port}/index.html", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
