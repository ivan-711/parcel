# Parcel

Know if a property makes money.

Live at **https://parceldesk.io**. "Open the demo" loads five sample deals with no account and nothing to install.

Parcel turns an address into a plain answer. Paste the address, say what you would do with it (rent it, flip it, BRRRR it, wholesale it, or take over the seller's loan), and it tells you in a sentence whether the deal works, what it depends on, and what would break it. Every number can be traced back to where it came from.

![The landing page](docs/screenshots/landing.png)

## What it does

- **One model for five strategies.** A deal is a month by month cash flow ledger. Rental, BRRRR, flip, wholesale and creative finance are presets on top of it, so they report the same numbers and compare fairly.
- **Plain answers first.** "$308 a month in your pocket, and your money grows 15.5% a year." Tap any number and it explains itself and lights up the inputs it depends on. IRR, DSCR and cap rate are there, one tap deeper.
- **Every input has a source.** Rent and value from RentCast, taxes from the Census, the loan rate from Freddie Mac, or a labeled estimate. Parcel never fills a cost with zero because it doesn't know it.
- **What if.** Work backwards from the return you want. See what moves the return most. Run ten thousand versions of the deal and find out how often it loses money.
- **A memo that can't make things up.** A one page summary is written by a language model, then every figure in it is checked against the engine before you see it.
- **Pipeline, portfolio, compare, share.** Move deals through stages, record what actually came in against the plan, read up to four deals side by side, and share a report anyone can open and print.

![The deal workspace](docs/screenshots/workspace.png)

![What if](docs/screenshots/whatif.png)

## How it's built

```
api/   FastAPI, SQLAlchemy async, Postgres with row level security
       engine/  pure Python and numpy: the ledger, metrics, solvers, sensitivity, Monte Carlo
web/   React 19, Vite, TanStack Router and Query, a client typed from the API's OpenAPI schema
docs/  decision records and the screenshots above
```

The API runs as a Docker image on Railway (`api/Dockerfile`, `api/railway.toml`) and the web app on Vercel, with the public pages prerendered. Accounts are Clerk, billing is Stripe in test mode, and the memo calls Anthropic's API.

A few choices worth knowing about, each written up in [docs/decisions](docs/decisions):

- The engine is pure and vectorized. One analysis takes about 0.3 ms; a ten thousand run simulation about 150 ms.
- Reverse solving ("what price gives me 12%?") is root finding on the forward model, so the two can never disagree.
- Postgres does everything: provider caches, usage limits, demo sandboxes. No Redis, no worker.
- Tenant isolation is enforced by the database with forced row level security, and proven by tests.
- The browser computes nothing financial. It asks the API, which answers in a few milliseconds, and turns the figures into words.
- The interface is dark first with a light theme that follows the device until you pick one: Inter, one blue accent for the numbers you can trace, CSS modules, no component library.

### Boundaries

- `api/src/parcel/engine/` does the math and nothing else: no database, no network, no clock. Inputs go in, a ledger and its metrics come out ([0001](docs/decisions/0001-one-ledger-for-every-strategy.md), [0002](docs/decisions/0002-solve-backwards-on-the-forward-model.md)).
- `domain/` holds the rules (lookups, memos, billing, usage limits) and talks to the database. `adapters/` is where calls to outside services live: RentCast, the Census geocoder and ACS, HUD, FRED, Geoapify, Clerk, Stripe and Anthropic. `http/routes/` turns requests into domain calls.
- The web app owns words, not numbers. Every figure on screen comes from the API, and the client's types are generated from the API's OpenAPI schema, so a renamed field fails the typecheck ([0008](docs/decisions/0008-no-finance-math-in-the-browser.md)).

### Who owns the data

- Postgres holds all of Parcel's state in seven tables, changed only through Alembic migrations (`api/src/parcel/db/`, [0003](docs/decisions/0003-postgres-does-everything.md)).
- A user's deals, actuals and memos belong to that user, and the database enforces it. Row level security is forced on the tenant tables, the API connects as a role that can't bypass it, and every request sets the current user inside its transaction (`db/session.py`, [0004](docs/decisions/0004-row-level-security.md)). `tests/api/test_isolation.py` shows a planted write for another user failing in the database itself.
- Clerk owns identities and Stripe owns payments. Parcel keeps a user row keyed by the Clerk subject and the plan it reads from Stripe's events ([0005](docs/decisions/0005-clerk-for-accounts-and-a-demo-without-it.md)).
- Provider answers are cached with their source and date, and that label follows the number onto the screen.

### Repeats, retries and idempotency

- Stripe can deliver a webhook more than once and out of order. Each event id is recorded once (`on conflict do nothing`), so a repeat does nothing, and events are applied by Stripe's own timestamp per user rather than by arrival (`domain/billing.py`).
- Writes that set state carry the new value instead of toggling it. `PUT /v1/deals/{id}/stage` names the stage and `PUT /v1/deals/{id}/actuals/{month}` replaces that month, so sending either twice leaves the same result.
- A memo is stored with a hash of the deal's inputs. Asking again for an unchanged deal returns the saved memo without calling the model ([0007](docs/decisions/0007-a-memo-that-cannot-invent-numbers.md)).
- Usage limits (lookups, memos, demo sessions) are counters in Postgres, taken inside the request's transaction.

### When something fails

- A missing cost is never treated as zero. If a required cost is unknown, the analysis is blocked and the page lists what it still needs.
- A data provider that fails returns nothing rather than a guess, and the lookup says what didn't come back. RentCast is rationed per user per day and across all users per month; when either budget is spent or RentCast fails, rent comes from HUD Fair Market Rent with a note saying so (`domain/lookup.py`).
- The memo's figures are checked against the engine. A mismatch gets one rewrite; if it still doesn't match, the memo is shown with the unmatched figures listed ([0007](docs/decisions/0007-a-memo-that-cannot-invent-numbers.md)).
- If the model call itself fails, the memo stream ends with an error the page shows. A failure that passes with time (rate limit, overload, server error, dropped connection) is retried twice with backoff by the Anthropic SDK, then the page says to try again in a minute. A failure that won't pass on its own (a rejected key, no credit, an unknown model) isn't retried: the page says memos aren't available and the API logs the cause at error level (`adapters/anthropic.py`, `http/routes/memo.py`).
- Production refuses to start without its secrets and database URL, instead of falling back to development defaults (`settings.py`).

### What you can see from outside

- Every request writes one structured log line: method, route, status and milliseconds, with share tokens removed from paths. A request id is returned in `x-request-id` and bound to every log line for that request (`app.py`).
- Exceptions go to Sentry with local variables off and tokens scrubbed (`app.py`, `redact.py`).
- `/healthz` answers if the process is up; `/readyz` also checks the database and is the deploy health check (`api/railway.toml`).
- Not there yet: nothing alerts on failed lookups or failed memos. They show up in the logs and on the page, and someone has to look.

### Left out on purpose

- No Redis, queue or background worker. Caches, counters and demo sandboxes are rows in Postgres, and the memo streams from the request that asked for it ([0003](docs/decisions/0003-postgres-does-everything.md)).
- No services to split. One API (two uvicorn workers by default, sharing nothing but Postgres) and one database.
- No finance math in the browser, and no component library or CSS framework ([0008](docs/decisions/0008-no-finance-math-in-the-browser.md), [0009](docs/decisions/0009-plain-css-and-the-system-font.md)).
- No document uploads or file storage in this version.
- Income taxes, depreciation, 1031 exchanges, rent control and partial month proration aren't modeled. The [methodology page](https://parceldesk.io/methodology) lists what the math leaves out.

## Running it

You need Python 3.13 with [uv](https://docs.astral.sh/uv/), Node 24 with pnpm, and Docker for Postgres.

```sh
make db                      # Postgres on port 5433
cp api/.env.example api/.env # ENVIRONMENT=development is enough to start
make dev                     # migrations, then the API on :8000
make web                     # the app on :5173, proxying /v1 to the API
```

Open http://localhost:5173 and click "Open the demo". The demo uses recorded figures for a few Sheboygan, WI addresses, so it never spends API calls. Real lookups need keys in `api/.env` (RentCast, Geoapify, FRED, HUD); accounts need a Clerk instance; the memo needs an Anthropic key; billing needs Stripe test keys. Each is optional and the app says plainly when a feature is off.

## Tests and CI

```sh
make check          # ruff, mypy strict, pytest against Postgres with a 95% coverage floor
cd web && pnpm lint && pnpm typecheck && pnpm test   # ESLint strict, tsc, vitest
cd web && pnpm e2e  # Playwright through the demo, with axe accessibility checks (API must be running)
k6 run api/loadtest/analyze.js   # the workspace's paths under load
```

GitHub Actions (`.github/workflows/ci.yml`) runs four jobs on every push to `main` and every pull request: `api` (ruff, mypy strict, pytest against Postgres 17 with the 95% floor), `web` (ESLint, tsc, Vitest, a production build), `e2e` (Playwright against a local API) and `image` (the Docker build). As of October 2026 the suite is 313 pytest tests at 97.5% line and branch coverage, 160 Vitest tests in 24 files, and 25 Playwright end-to-end tests plus the Clerk sign-in setup step, which Playwright's summary counts as a 26th. Five of the Playwright spec files run axe accessibility scans. The signed-in specs need a Clerk development instance; CI reads its keys and test accounts from repository secrets.

The engine's tests check every formula on the [methodology page](web/src/features/methodology/methodology.tsx) against worked examples, and property tests confirm that solving backwards then forwards lands where it started. An offline set of twenty deals exercises the memo check.

## Numbers

Measured on 2026-10-09 on a laptop, API running two workers, 20 virtual users for 30 seconds:

| Request | p50 | p95 |
|---|---|---|
| Recalculate a deal (`POST /v1/analyze`, monthly ledger) | 8 ms | 15 ms |
| List deals with their summaries | 12 ms | 25 ms |
| Sensitivity (tornado and grid) | 24 ms | 54 ms |

192 requests a second with no failures. Before the analysis cache and the second worker (PR #5), the same load test measured a p95 of 166 ms for recalculating a deal and 252 ms for the deal list. Two things to know when reading these: the script requests the monthly ledger, whose cache holds only 8 entries, and varies rent across about 400 values, so most of those calls were computed rather than cached; and a single uncontended request took 5.6 ms end to end. Measured from Wisconsin against production on 2026-10-23, the same call took about 270 to 430 ms, most of it network: the empty health check alone took about 200 ms.

The web app's main bundle is about 95 KB gzipped; the public pages are prerendered.

## Decision records

1. [One ledger for every strategy](docs/decisions/0001-one-ledger-for-every-strategy.md)
2. [Solve backwards on the forward model](docs/decisions/0002-solve-backwards-on-the-forward-model.md)
3. [Postgres does everything](docs/decisions/0003-postgres-does-everything.md)
4. [Row level security for tenant isolation](docs/decisions/0004-row-level-security.md)
5. [Clerk for accounts, and a demo that needs none](docs/decisions/0005-clerk-for-accounts-and-a-demo-without-it.md)
6. [Dollars as decimals, rounded at the edge](docs/decisions/0006-dollars-as-decimals-rounded-at-the-edge.md)
7. [A memo that cannot invent numbers](docs/decisions/0007-a-memo-that-cannot-invent-numbers.md)
8. [No finance math in the browser](docs/decisions/0008-no-finance-math-in-the-browser.md)
9. [Plain CSS and the system font](docs/decisions/0009-plain-css-and-the-system-font.md) (amended: the interface was rebuilt dark first with Inter the same day)

## How AI was used

Parcel was built with AI coding agents, mainly Claude Code, under Ivan's direction. Ivan decided what to build, chose between designs and rejected the ones that didn't work, and made the call on each merge. The agents wrote most of the code, tests and documentation. Reviews were run by agents as well (Claude's code review and OpenAI's Codex, read only), and each confirmed finding was fixed with a test that failed first. The test suite and CI are how the work was checked. The commits from the October build are authored by Ivan with no AI co-author trailers, so read the whole history as AI-assisted. In the running app, the only model call is the deal memo, and its numbers are checked against the engine before anyone sees them.

## License

MIT. See [LICENSE](LICENSE).
