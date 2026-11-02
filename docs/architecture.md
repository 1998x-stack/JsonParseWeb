# V0.2 architecture and decisions

## ADR-001: Local-first by default

JSON documents may contain access tokens, internal configuration and customer data. The browser handles paste, drag/drop, parsing, statistics and rendering without a network request. Neither local storage nor a server is used automatically.

## ADR-002: Explicit backend boundary

The optional Django REST API supports `/api/parse/`, `/api/upload/`, `/api/sample/`, and `/api/health/`. It is not on the primary browser interaction path. Upload is ephemeral; no file persists on disk. `parse` takes `{"source":"..."}` or a raw JSON body. JSON errors use `{success:false,error:{code,message,line?,column?}}`.

## ADR-003: DOM-safe rendering

All user-controlled JSON values are inserted with `textContent`; no JSON goes through `innerHTML`. The raw view displays the exact source text, including unsafe-number literals.

## ADR-004: explicit resource limits

Browser and Python service both limit the input to 2 MiB, 128 levels, 50,000 object keys, and 100,000 nodes. Browser tree shows up to 2,500 nodes; table shows up to 500 rows. Those budgets can be tuned after measured benchmarks.

## ADR-005: numeric fidelity limitation

JavaScript's native `JSON.parse` may round integers beyond `Number.MAX_SAFE_INTEGER`. V0.2 scans the source for unsafe integer literals, warns and disables formatting, while preserving the exact raw input for display/download. Tree/statistics continue to use JS values, so they are not a lossless representation of unsafe numbers. A token-preserving AST is deferred to V0.3. The backend retains Python integer precision, but a JSON response consumed by JS can still round it.

## V0.3 follow-ups

Introduce typed AST / lossless numbers and source ranges; full tokenizer and duplicate-key diagnostics on the frontend; worker parsing and indexed/virtualized trees; schema validation; stronger backpressure and distributed throttling for public deployments. For user-facing APIs that expose JSON responses, define a string-based contract for large numeric literals.
