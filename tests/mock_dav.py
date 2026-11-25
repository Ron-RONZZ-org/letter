"""Minimal CardDAV mock for the browser E2E test."""
import os
import xml.sax.saxutils as sx
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("MOCK_DAV_PORT", "8799"))
ORIGIN = os.environ.get("LETTER_E2E_ORIGIN", "http://127.0.0.1:8765")

VCARD = (
    "BEGIN:VCARD\r\n"
    "VERSION:3.0\r\n"
    "N:Smith;John;;;\r\n"
    "FN:John Smith\r\n"
    "ORG:Example Ltd\r\n"
    "ADR;TYPE=work:;;9 High St;London;;SW1A 1AA;United Kingdom\r\n"
    "EMAIL;TYPE=work:john@example.org\r\n"
    "TEL;TYPE=work,voice:+44 20 0000 0000\r\n"
    "UID:john-smith-1\r\n"
    "END:VCARD\r\n"
)

XML = f"""<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
  <d:response>
    <d:href>/addressbook/john.vcf</d:href>
    <d:propstat>
      <d:prop>
        <d:getetag>"1"</d:getetag>
        <card:address-data>{sx.escape(VCARD)}</card:address-data>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>
"""


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", ORIGIN)
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS, PROPFIND, REPORT")
        self.send_header(
            "Access-Control-Allow-Headers", "Authorization, Depth, Content-Type, Accept"
        )
        self.send_header("Access-Control-Expose-Headers", "DAV, ETag")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_PROPFIND(self):
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length:
            self.rfile.read(length)
        if self.path.startswith("/fail"):
            self.send_response(401)
            self._cors()
            self.end_headers()
            return
        body = XML.encode("utf-8")
        self.send_response(207)
        self._cors()
        self.send_header("Content-Type", "application/xml; charset=utf-8")
        self.send_header("DAV", "1, 2, 3, addressbook")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
