# JSONParseWeb v0.2 — local-first JSON Developer Workbench

JSONParseWeb is a standalone browser application for JSON validation and exploration with an optional Django API. **Pasted or uploaded JSON remains in the browser by default.** No bundler, frontend dependency, database, account or analytics service is necessary.

## Start frontend

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

The page supports JSON top-level primitives (`false`, `0`, `null`, `""`), tree/raw/table views, formatting, export, drag/drop, keyboard shortcut `Ctrl/⌘ + Enter`, structural counters and warnings on unsafe integer precision. Format is blocked on unsafe integers; raw view and download preserve the source.

## Run checks

```bash
node --version  # >=20
npm test
python3 -m pytest tests/python/test_service.py -q
```

Optional Django backend:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
export DJANGO_DEBUG=1 # supply secrets through your runtime environment
DJANGO_DEBUG=1 python manage.py check
DJANGO_DEBUG=1 pytest -q
DJANGO_DEBUG=1 python manage.py runserver 127.0.0.1:8000
```

The browser UI does **not** call Django. Opt-in example: `curl -s -H 'Content-Type: application/json' -d '{"source":"{\"ok\":true}"}' http://127.0.0.1:8000/api/parse/`.

### Backend endpoints

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/parse/` | POST | Parse and analyze JSON text |
| `/api/upload/` | POST | Process an uploaded `.json` file without persisting |
| `/api/sample/` | GET | Small public example |
| `/api/health/` | GET | Basic process liveness |

## Project layout

- `src/core`: independent JSON analyzer and sample data
- `src/ui`: DOM-safe visualizations
- `src/app.mjs`: browser controller and revision-based state invalidation
- `server/config`: standard Django project entrypoints and settings
- `server/processor`: optional backend API and pure Python JSON processor
- `tests/js`, `tests/python`: regression and contract tests
- `.github/workflows/ci.yml`: CI quality gates
- `docs/architecture.md`: ADRs, limits and V0.3 scope

## Limitations and privacy

- Native JavaScript parsing is not lossless for some decimal and large numeric literals. V0.2 explicitly warns on unsafe integer literals and preserves their original text; a complete lossless AST is planned for V0.3.
- Browser output is bounded to 2,500 tree nodes and 500 table rows. This is a preview, not a virtualized large-dataset viewer.
- The anonymous optional API is not intended for unbounded internet exposure. For production use configure a reverse proxy with request/time limits, authentication if needed, and distributed throttling. Set `DJANGO_SECRET_KEY` and `DJANGO_ALLOWED_HOSTS`; `DEBUG` defaults to false.
- Browser E2E should be run on a local HTTP server; the core Node tests and Django integration tests are exercised in CI.
