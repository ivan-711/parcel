# 4. Row level security for tenant isolation

Date: 2026-10-07

## Context

Every deal, memo and usage row belongs to one user. Scoping queries by hand works until the one query someone forgets, and the old codebase had a hardcoded demo email that bypassed scoping in four places.

## Decision

Postgres row level security is on for every tenant table, with FORCE so even the owner role obeys it. The API connects as a role with no bypass, and every request runs inside a transaction that sets the current user id before touching data. Repositories still filter by owner, but the database refuses to return another user's rows even if the application code is wrong.

## Consequences

Isolation is a property of the database, proven by tests that try to read another user's deal and get nothing. Shared reports and demo creation use a separate system session that is explicit in the code. Migrations have to remember the policies, which the first migration demonstrates.
