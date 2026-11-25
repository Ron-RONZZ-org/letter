import logging
from pathlib import Path
from urllib.parse import unquote

from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .csp import COOKIE_NAME, build_csp, normalize_origin
from .eml import filename as output_name
from .eml import render_eml
from .errors import BusyError, RenderError
from .models import LetterRequest
from .render import WEB_DIR, render_pdf

logger = logging.getLogger("letter")
MAX_BODY_BYTES = 300_000

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
}


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    for key, value in SECURITY_HEADERS.items():
        response.headers.setdefault(key, value)
    return response


@app.middleware("http")
async def body_limit(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            size = int(content_length)
        except ValueError:
            return JSONResponse({"detail": "invalid content-length"}, status_code=400)
        if size > MAX_BODY_BYTES:
            return JSONResponse({"detail": "request too large"}, status_code=413)
    return await call_next(request)


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    errors = [
        {
            "loc": list(error.get("loc", [])),
            "msg": error.get("msg", "invalid value"),
            "type": error.get("type", ""),
        }
        for error in exc.errors()
    ]
    return JSONResponse({"detail": "invalid input", "errors": errors}, status_code=422)


@app.exception_handler(BusyError)
async def busy_handler(request: Request, exc: BusyError):
    return JSONResponse({"detail": "server busy, try again shortly"}, status_code=429)


@app.exception_handler(RenderError)
async def render_handler(request: Request, exc: RenderError):
    # Never log Typst stderr: it can contain the letter body as a source snippet.
    logger.error("render failed")
    return JSONResponse({"detail": "rendering failed"}, status_code=500)


@app.get("/")
def index(request: Request):
    origin = normalize_origin(unquote(request.cookies.get(COOKIE_NAME) or ""))
    html = (Path(__file__).parent / "index.html").read_text(encoding="utf-8")
    return Response(
        html,
        media_type="text/html",
        headers={
            "Content-Security-Policy": build_csp(origin),
            "Cache-Control": "no-store",
            "X-Robots-Tag": "noindex, nofollow",
        },
    )


@app.get("/healthz")
def healthz():
    return {"ok": True}


@app.get("/favicon.ico")
def favicon():
    return Response(status_code=204)


@app.post("/api/render/pdf")
def render_pdf_endpoint(req: LetterRequest):
    data = render_pdf(req)
    return Response(
        data,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{output_name(req)}.pdf"',
            "Cache-Control": "no-store",
        },
    )


@app.post("/api/render/eml")
def render_eml_endpoint(req: LetterRequest):
    pdf = render_pdf(req) if req.attach_pdf else None
    data = render_eml(req, pdf)
    return Response(
        data,
        media_type="message/rfc822",
        headers={
            "Content-Disposition": f'attachment; filename="{output_name(req)}.eml"',
            "Cache-Control": "no-store",
        },
    )


app.mount("/static", StaticFiles(directory=WEB_DIR), name="static")
