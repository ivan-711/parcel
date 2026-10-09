# 5. Clerk for accounts, and a demo that needs none

Date: 2026-10-07

## Context

Accounts are not what Parcel is about, and the old hand rolled JWT cookie flow had a key rotation bug. At the same time the demo has to work for a recruiter in one click with no signup.

## Decision

Clerk issues session tokens and the API verifies them against Clerk's JWKS, refetching on an unknown key id. Users are created on first request from the Clerk subject. The demo is separate: the API mints its own short lived signed token scoped to a fresh copy of five sample deals, capped per IP per day and swept after a day. The web app loads Clerk only when a publishable key is configured, so the app runs demo only without it.

## Consequences

No passwords, no sessions table, and a demo that costs nothing to try. Demo tokens can only ever resolve to demo users, which closes the impersonation path the old bypass opened. Running the full app locally still needs a Clerk instance for sign in, which is a one time setup.
