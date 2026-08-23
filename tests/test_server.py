import http.client
import importlib.util
import tempfile
import threading
import unittest
from pathlib import Path


EDITION = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("truck_driver_server", EDITION / "app" / "server.py")
SERVER_MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SERVER_MODULE)


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory()
        cls.root = Path(cls.temporary.name)
        (cls.root / "index.html").write_text("<h1>local app</h1>", encoding="utf-8")
        (cls.root / "sample.bin").write_bytes(b"0123456789")
        (cls.root / "manifest.webmanifest").write_text("{}", encoding="utf-8")
        (cls.root / ".secret").write_text("hidden", encoding="utf-8")
        (cls.root / "code.py").write_text("SECRET = True", encoding="utf-8")
        (cls.root / "empty-dir").mkdir()
        (cls.root / "nested").mkdir()
        (cls.root / "nested" / "index.html").write_text("nested", encoding="utf-8")
        cls.outside = cls.root.parent / "truck-driver-server-outside.txt"
        cls.outside.write_text("outside", encoding="utf-8")
        (cls.root / "outside-link.txt").symlink_to(cls.outside)

        cls.server = SERVER_MODULE.create_server("127.0.0.1", 0, cls.root)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.port = cls.server.server_address[1]

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=5)
        cls.outside.unlink(missing_ok=True)
        cls.temporary.cleanup()

    def request(self, method, path, headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        connection.request(method, path, headers=headers or {})
        response = connection.getresponse()
        body = response.read()
        result = response.status, {key.lower(): value for key, value in response.getheaders()}, body
        connection.close()
        return result

    def test_root_and_security_headers(self):
        status, headers, body = self.request("GET", "/")
        self.assertEqual(status, 200)
        self.assertEqual(body, b"<h1>local app</h1>")
        self.assertIn("default-src 'self'", headers["content-security-policy"])
        self.assertEqual(
            headers["permissions-policy"],
            "microphone=(self), camera=(), geolocation=(), payment=(), usb=()",
        )
        self.assertEqual(headers["x-content-type-options"], "nosniff")
        self.assertEqual(headers["x-frame-options"], "DENY")
        self.assertEqual(headers["cross-origin-resource-policy"], "same-origin")
        self.assertEqual(headers["cache-control"], "no-cache")

    def test_head_has_get_headers_without_body(self):
        status, headers, body = self.request("HEAD", "/sample.bin")
        self.assertEqual(status, 200)
        self.assertEqual(headers["content-length"], "10")
        self.assertEqual(headers["accept-ranges"], "bytes")
        self.assertEqual(body, b"")

        status, headers, body = self.request("HEAD", "/sample.bin", {"Range": "bytes=1-2"})
        self.assertEqual(status, 206)
        self.assertEqual(headers["content-range"], "bytes 1-2/10")
        self.assertEqual(headers["content-length"], "2")
        self.assertEqual(body, b"")

    def test_explicit_open_and_suffix_ranges(self):
        status, headers, body = self.request("GET", "/sample.bin", {"Range": "bytes=2-5"})
        self.assertEqual((status, body), (206, b"2345"))
        self.assertEqual(headers["content-range"], "bytes 2-5/10")
        self.assertEqual(headers["content-length"], "4")

        status, headers, body = self.request("GET", "/sample.bin", {"Range": "bytes=7-"})
        self.assertEqual((status, body), (206, b"789"))
        self.assertEqual(headers["content-range"], "bytes 7-9/10")

        status, headers, body = self.request("GET", "/sample.bin", {"Range": "bytes=-4"})
        self.assertEqual((status, body), (206, b"6789"))
        self.assertEqual(headers["content-range"], "bytes 6-9/10")

    def test_invalid_and_multiple_ranges_return_416(self):
        for value in ("bytes=99-100", "bytes=7-2", "bytes=0-1,4-5", "items=0-1"):
            with self.subTest(value=value):
                status, headers, body = self.request("GET", "/sample.bin", {"Range": value})
                self.assertEqual(status, 416)
                self.assertEqual(headers["content-range"], "bytes */10")
                self.assertEqual(body, b"")

    def test_dot_paths_traversal_and_python_source_are_not_served(self):
        paths = (
            "/.secret",
            "/%2esecret",
            "/%2e%2e/truck-driver-server-outside.txt",
            "/outside-link.txt",
            "/code.py",
            "/__pycache__/server.pyc",
        )
        for path in paths:
            with self.subTest(path=path):
                status, headers, body = self.request("GET", path)
                self.assertEqual(status, 404)
                self.assertIn("content-security-policy", headers)
                self.assertNotIn(b"outside", body)

    def test_directories_are_never_listed(self):
        status, _, body = self.request("GET", "/empty-dir/")
        self.assertEqual(status, 404)
        self.assertNotIn(b"Directory listing", body)

        status, headers, _ = self.request("GET", "/nested")
        self.assertEqual(status, 308)
        self.assertEqual(headers["location"], "/nested/")
        status, _, body = self.request("GET", "/nested/")
        self.assertEqual((status, body), (200, b"nested"))

    def test_manifest_mime_and_write_methods(self):
        status, headers, _ = self.request("GET", "/manifest.webmanifest")
        self.assertEqual(status, 200)
        self.assertEqual(headers["content-type"], "application/manifest+json")

        for method in ("POST", "PUT", "DELETE"):
            with self.subTest(method=method):
                status, headers, _ = self.request(method, "/sample.bin")
                self.assertEqual(status, 405)
                self.assertIn("permissions-policy", headers)


if __name__ == "__main__":
    unittest.main()
