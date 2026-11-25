from app.csp import build_csp, normalize_origin


def test_valid_origin():
    assert normalize_origin("https://dav.example.org") == "https://dav.example.org"
    assert normalize_origin("https://dav.example.org:8443") == "https://dav.example.org:8443"
    assert normalize_origin("HTTPS://DAV.Example.ORG") == "https://dav.example.org"


def test_invalid_origins():
    assert normalize_origin(None) is None
    assert normalize_origin("") is None
    assert normalize_origin("javascript:alert(1)") is None
    assert normalize_origin("https://x.org/../y") is None
    assert normalize_origin("https://x.org/?q=1") is None
    assert normalize_origin("https://x.org;script-src *") is None
    assert normalize_origin("https://x.org\r\nX: y") is None
    assert normalize_origin("https://" + "a" * 400 + ".org") is None


def test_http_only_allowed_in_dev(monkeypatch):
    monkeypatch.delenv("LETTER_ALLOW_HTTP_ORIGINS", raising=False)
    assert normalize_origin("http://localhost:9000") is None
    monkeypatch.setenv("LETTER_ALLOW_HTTP_ORIGINS", "1")
    assert normalize_origin("http://localhost:9000") == "http://localhost:9000"
    assert normalize_origin("http://example.org") is None


def test_build_csp():
    csp = build_csp(None)
    assert "connect-src 'self'" in csp
    csp = build_csp("https://dav.example.org")
    assert "connect-src 'self' https://dav.example.org" in csp
