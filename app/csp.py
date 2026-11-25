import os
import re
from urllib.parse import urlsplit

COOKIE_NAME = "letter_dav_origin"

_HOST_RE = re.compile(
    r"^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$"
)


def _allow_http() -> bool:
    return os.environ.get("LETTER_ALLOW_HTTP_ORIGINS") == "1"


def normalize_origin(value: str | None) -> str | None:
    """Return a safe https origin, or None. Never returns user-controlled syntax."""
    if not value:
        return None
    value = value.strip()
    if len(value) > 300 or any(ch in value for ch in "\r\n;, \t"):
        return None
    parts = urlsplit(value)
    scheme = parts.scheme.lower()
    host = (parts.hostname or "").lower()
    if not host or not _HOST_RE.match(host):
        return None
    if parts.path not in ("", "/") or parts.query or parts.fragment:
        return None
    try:
        port = parts.port
    except ValueError:
        return None
    if port is not None and not 1 <= port <= 65535:
        return None

    is_local = host in {"localhost", "127.0.0.1"}
    if not (scheme == "https" or (_allow_http() and scheme == "http" and is_local)):
        return None

    suffix = f":{port}" if port is not None else ""
    return f"{scheme}://{host}{suffix}"


def build_csp(dav_origin: str | None) -> str:
    connect = "'self'" + (f" {dav_origin}" if dav_origin else "")
    return "; ".join(
        [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self'",
            "img-src 'self' data:",
            "font-src 'self'",
            "object-src 'none'",
            "base-uri 'none'",
            "frame-ancestors 'none'",
            "form-action 'self'",
            f"connect-src {connect}",
        ]
    )
