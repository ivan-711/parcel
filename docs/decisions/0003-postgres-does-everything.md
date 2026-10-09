# 3. Postgres does everything

Date: 2026-10-07

## Context

The usual stack for an app like this adds Redis for caching and rate limits and a worker for background jobs. Parcel's background work is small: cache provider responses for a month, count lookups and memos per day, and expire demo sandboxes.

## Decision

One Postgres database handles all of it. Provider responses live in a cache table with a TTL, usage counters are rows keyed by user and day and are taken inside the request transaction, and demo sandboxes are ordinary users with an expiry that gets swept when the next demo starts. The deal memo streams from the request that asked for it, so there is nothing to queue.

## Consequences

One process and one database to run, back up and reason about. Usage limits are transactional, so two concurrent requests cannot both slip under a limit. If Parcel ever needs real background work the first candidate is Postgres again, with a jobs table, before anything new is added.
