# Third-party components

| Component | Version | License | Use |
|---|---|---|---|
| [Typst](https://github.com/typst/typst) | 0.15.1 | Apache-2.0 | PDF rendering |
| [cmarker](https://github.com/SabrinaJewson/cmarker.typ) | 0.1.10 | MIT | CommonMark → Typst |
| [vcf](https://github.com/jhermsmeier/node-vcf) | 2.1.2 | MIT | vCard parsing (browser bundle) |
| [Liberation fonts](https://github.com/liberationfonts/liberation-fonts) | 2.1.5 | SIL OFL 1.1 | bundled fonts (see `fonts/LICENSE`) |
| [FastAPI](https://fastapi.tiangolo.com/) | — | MIT | HTTP API |
| [Starlette](https://www.starlette.io/) | — | BSD-3-Clause | ASGI toolkit |
| [Pydantic](https://docs.pydantic.dev/) | — | MIT | request validation |
| [uvicorn](https://www.uvicorn.org/) | — | BSD-3-Clause | ASGI server |
| [markdown-it-py](https://github.com/executablebooks/markdown-it-py) | — | MIT | Markdown → HTML for `.eml` |

The browser bundle `web/vendor/vcf.js` is generated from `vcf` by `npm run bundle`; the source is MIT-licensed.
