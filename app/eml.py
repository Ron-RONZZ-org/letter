import re
from email.message import EmailMessage
from email.utils import formataddr, formatdate
from html import escape
from html.parser import HTMLParser

from markdown_it import MarkdownIt

from .models import LetterRequest

_MD = MarkdownIt("commonmark", {"html": False, "linkify": False, "typographer": False})

_BLOCK_TAGS = {
    "p", "div", "li", "ul", "ol", "tr", "table",
    "h1", "h2", "h3", "h4", "h5", "h6", "blockquote",
}


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self._skip = 0

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag in {"script", "style"}:
            self._skip += 1
        elif tag == "br" or tag in _BLOCK_TAGS:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style"}:
            self._skip = max(0, self._skip - 1)
        elif tag in _BLOCK_TAGS:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if not self._skip:
            self.parts.append(data)


def html_to_text(html: str) -> str:
    parser = _TextExtractor()
    parser.feed(html)
    parser.close()
    text = "".join(parser.parts)
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in text.splitlines()]
    out: list[str] = []
    blank = 0
    for line in lines:
        if line:
            blank = 0
            out.append(line)
        else:
            blank += 1
            if blank <= 1:
                out.append("")
    return "\n".join(out).strip()


def _salutation(req: LetterRequest) -> str:
    if req.salutation:
        return req.salutation
    return "Madame, Monsieur," if req.style == "fr-formal" else "Dear Sir or Madam,"


def _closing(req: LetterRequest) -> str:
    if req.closing:
        return req.closing
    if req.style == "fr-formal":
        return "Veuillez agréer, Madame, Monsieur, l'expression de mes salutations distinguées."
    return "Yours faithfully,"


def _signature_lines(req: LetterRequest) -> list[str]:
    return [x for x in (req.sender.name, req.sender.title, req.sender.organization) if x]


def _html_body(req: LetterRequest) -> str:
    body_html = _MD.render(req.body)
    salutation = escape(_salutation(req))
    closing = escape(_closing(req))
    signature = "<br>".join(escape(x) for x in _signature_lines(req))
    return f"""<!doctype html>
<html><body style="margin:0;padding:0;background:#ffffff;">
<div style="max-width:640px;margin:0 auto;padding:8px 0;
 font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:1.55;color:#111111;">
<p style="margin:0 0 14px 0;">{salutation}</p>
<div>{body_html}</div>
<p style="margin:18px 0 0 0;">{closing}</p>
<p style="margin:16px 0 0 0;">{signature}</p>
</div>
</body></html>"""


def _plain_body(req: LetterRequest) -> str:
    body = html_to_text(_MD.render(req.body))
    parts = [_salutation(req), body, _closing(req), "\n".join(_signature_lines(req))]
    return "\n\n".join(x for x in parts if x).strip()


def render_eml(req: LetterRequest, pdf: bytes | None = None) -> bytes:
    msg = EmailMessage()
    msg["X-Unsent"] = "1"
    if req.recipient.email:
        msg["To"] = req.recipient.email
    if req.cc:
        msg["Cc"] = req.cc
    if req.sender.email:
        msg["From"] = formataddr((req.sender.name or req.sender.email, req.sender.email))
    msg["Subject"] = req.subject or "Letter"
    msg["Date"] = formatdate(localtime=True)
    msg.set_content(_plain_body(req))
    msg.add_alternative(_html_body(req), subtype="html")
    if pdf and req.attach_pdf:
        msg.add_attachment(
            pdf,
            maintype="application",
            subtype="pdf",
            filename=f"{filename(req)}.pdf",
        )
    return msg.as_bytes()


def filename(req: LetterRequest) -> str:
    base = (req.subject or req.recipient.name or req.sender.name or "letter").strip()
    base = re.sub(r"[^A-Za-z0-9._-]+", "-", base).strip("-._")[:60]
    return base or "letter"
