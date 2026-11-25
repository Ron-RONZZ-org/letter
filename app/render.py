import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from threading import BoundedSemaphore

from .errors import BusyError, RenderError
from .models import LetterRequest

BASE_DIR = Path(__file__).resolve().parent.parent
TEMPLATES_DIR = BASE_DIR / "templates"
WEB_DIR = BASE_DIR / "web"
FONTS_DIR = Path(os.environ.get("TYPST_FONT_PATH", BASE_DIR / "fonts"))

STYLES = {
    "fr-formal": "fr-formal.typ",
    "en-formal": "en-formal.typ",
    "minimal": "minimal.typ",
}

_MAX_CONCURRENT = int(os.environ.get("LETTER_MAX_CONCURRENT_RENDERS", "2"))
_TIMEOUT = float(os.environ.get("LETTER_RENDER_TIMEOUT", "15"))
_SEMAPHORE = BoundedSemaphore(_MAX_CONCURRENT)


def _typst_bin() -> str:
    env = os.environ.get("TYPST_BIN")
    if env:
        return env
    vendored = BASE_DIR / "vendor" / "typst" / "typst"
    if vendored.exists():
        return str(vendored)
    found = shutil.which("typst")
    if found:
        return found
    raise RenderError("typst binary not found")


def render_pdf(req: LetterRequest) -> bytes:
    if not _SEMAPHORE.acquire(blocking=False):
        raise BusyError("too many concurrent renders")
    try:
        with tempfile.TemporaryDirectory(prefix="letter-") as tmpdir:
            tmp = Path(tmpdir)
            shutil.copytree(TEMPLATES_DIR / "vendor", tmp / "vendor")
            styles = tmp / "styles"
            styles.mkdir()
            style_file = STYLES[req.style]
            shutil.copy2(TEMPLATES_DIR / "styles" / style_file, styles / style_file)

            (tmp / "packages").mkdir()
            (tmp / "data.json").write_text(
                json.dumps(req.model_dump(), ensure_ascii=False), encoding="utf-8"
            )
            (tmp / "main.typ").write_text(
                f'#import "styles/{style_file}": letter\n'
                '#let data = json("data.json")\n'
                "#show: it => letter(data)\n",
                encoding="utf-8",
            )

            out = tmp / "out.pdf"
            cmd = [
                _typst_bin(),
                "compile",
                "--root",
                str(tmp),
                "--font-path",
                str(FONTS_DIR),
                "--ignore-system-fonts",
                str(tmp / "main.typ"),
                str(out),
            ]
            env = {
                "PATH": os.environ.get("PATH", ""),
                "HOME": str(tmp),
                "XDG_CACHE_HOME": str(tmp / ".cache"),
                "TYPST_PACKAGE_PATH": str(tmp / "packages"),
            }
            try:
                proc = subprocess.run(
                    cmd,
                    cwd=tmp,
                    env=env,
                    capture_output=True,
                    text=True,
                    timeout=_TIMEOUT,
                    check=False,
                )
            except subprocess.TimeoutExpired as exc:
                raise RenderError("typst timed out") from exc

            if proc.returncode != 0 or not out.exists():
                detail = (proc.stderr or proc.stdout or "").strip()[-2000:]
                raise RenderError(f"typst failed: {detail or 'unknown error'}")

            data = out.read_bytes()
            if not data.startswith(b"%PDF"):
                raise RenderError("typst produced a non-PDF output")
            return data
    finally:
        _SEMAPHORE.release()
