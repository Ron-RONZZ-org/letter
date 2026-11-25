import subprocess
from email import policy
from email.parser import BytesParser

import pytest


def test_index_sets_csp(client):
    response = client.get("/")
    assert response.status_code == 200
    csp = response.headers["content-security-policy"]
    assert "script-src 'self'" in csp
    assert "connect-src 'self'" in csp
    assert "dav.example.org" not in csp
    assert response.headers["x-frame-options"] == "DENY"
    assert "{{ASSET_VERSION}}" not in response.text
    assert "/static/app.js?v=" in response.text


def test_index_uses_dav_origin_cookie(client):
    client.cookies.set("letter_dav_origin", "https%3A%2F%2Fdav.example.org")
    response = client.get("/")
    csp = response.headers["content-security-policy"]
    assert "connect-src 'self' https://dav.example.org" in csp


def test_index_ignores_invalid_cookie(client):
    client.cookies.set("letter_dav_origin", "https%3A%2F%2Fevil.com%3B%20script-src%20*")
    response = client.get("/")
    csp = response.headers["content-security-policy"]
    assert "evil.com" not in csp


def test_pdf(client, sample, tmp_path):
    response = client.post("/api/render/pdf", json=sample)
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF")
    assert "no-store" in response.headers["cache-control"]

    pdf = tmp_path / "letter.pdf"
    pdf.write_bytes(response.content)
    try:
        text = subprocess.run(
            ["pdftotext", str(pdf), "-"], check=True, capture_output=True, text=True
        ).stdout
    except FileNotFoundError:
        pytest.skip("pdftotext is not installed")
    assert "Rong Zhou" in text
    assert "Demande de rendez-vous" in text
    assert "Madame la Directrice" in text


def test_all_styles_render(client, sample):
    for style in ("fr-formal", "en-formal", "minimal"):
        response = client.post("/api/render/pdf", json={**sample, "style": style})
        assert response.status_code == 200, (style, response.text)
        assert response.content.startswith(b"%PDF")


def test_eml(client, sample):
    response = client.post("/api/render/eml", json=sample)
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "message/rfc822"
    message = BytesParser(policy=policy.default).parsebytes(response.content)
    assert message["X-Unsent"] == "1"
    assert message["To"] == "direction@example.fr"
    assert message["Subject"] == "Demande de rendez-vous"
    assert message.is_multipart()
    plain = message.get_body(("plain",))
    assert plain is not None
    assert "Madame la Directrice" in plain.get_content()
    attachments = [p for p in message.iter_attachments()]
    assert len(attachments) == 1
    assert attachments[0].get_content_type() == "application/pdf"


def test_eml_without_attachment(client, sample):
    response = client.post("/api/render/eml", json={**sample, "attach_pdf": False})
    assert response.status_code == 200
    message = BytesParser(policy=policy.default).parsebytes(response.content)
    assert not list(message.iter_attachments())


def test_validation_does_not_echo_input(client, sample):
    payload = {**sample, "body": "", "subject": "SECRET-SUBJECT"}
    response = client.post("/api/render/pdf", json=payload)
    assert response.status_code == 422
    assert "SECRET-SUBJECT" not in response.text


def test_oversized_body_rejected(client):
    response = client.post(
        "/api/render/pdf",
        content=b"x" * 400_000,
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 413


def test_unknown_style_rejected(client, sample):
    response = client.post("/api/render/pdf", json={**sample, "style": "nope"})
    assert response.status_code == 422
