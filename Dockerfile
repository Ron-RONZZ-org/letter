FROM python:3.12-slim

ARG TARGETARCH
ARG TYPST_VERSION=0.15.1

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOME=/tmp

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl xz-utils \
 && rm -rf /var/lib/apt/lists/*

RUN set -eux; \
    case "${TARGETARCH:-amd64}" in \
      amd64) arch=x86_64 ;; \
      arm64) arch=aarch64 ;; \
      *) echo "Unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    curl -fsSL --retry 3 -o /tmp/typst.tar.xz \
      "https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-${arch}-unknown-linux-musl.tar.xz"; \
    tar -xJf /tmp/typst.tar.xz -C /tmp --strip-components=1; \
    install -m 0755 /tmp/typst /usr/local/bin/typst; \
    rm -f /tmp/typst.tar.xz /tmp/typst

RUN pip install --no-cache-dir uv

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY app ./app
COPY templates ./templates
COPY web ./web
COPY fonts ./fonts

ENV TYPST_BIN=/usr/local/bin/typst \
    TYPST_FONT_PATH=/app/fonts

RUN useradd --uid 10001 --create-home --shell /usr/sbin/nologin letter \
 && chown -R 10001:10001 /app
USER 10001

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8000/healthz || exit 1

CMD ["/app/.venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
