# 1. One ledger for every strategy

Date: 2026-10-07

## Context

The old version of Parcel had a separate calculator per strategy. Each one had its own formulas and its own bugs: the flip calculator left holding costs out of profit, the BRRRR one appreciated from the purchase price instead of the repaired value, and the two reverse solvers disagreed with their forward calculators. Comparing a flip against a rental meant comparing two different models.

## Decision

A deal is a month by month cash flow ledger: an acquisition, financing legs that fund and retire on given months, operations with separate growth rates, and an exit. The five strategies are presets that compile their plain inputs into that one model. Every metric is read off the ledger. The engine is pure Python and numpy with no I/O, and it runs many scenarios at once by giving every line a (runs, months) shape.

## Consequences

Every strategy reports the same numbers, so the compare page is honest. Fixing a rule fixes it everywhere. Sensitivity and Monte Carlo come almost for free, since the ledger is already vectorized. The cost is that each strategy's inputs have to be translated into loans and events, which is where the strategy specific care now lives, in one file.
