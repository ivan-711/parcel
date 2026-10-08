"""Write a memo for every eval deal with the real model and save the ones that hold up.

    ANTHROPIC_API_KEY=... uv run python -m tests.domain.record_memos

Recordings land in tests/domain/memos/ and test_memo.py replays them through
the grounding check, so a prompt or figure change that would break them shows
up in the normal test run without calling the model.
"""

import asyncio
import sys
from pathlib import Path

from parcel.adapters.anthropic import ClaudeWriter
from parcel.domain import memo
from parcel.settings import get_settings

from .memo_cases import cases

OUT = Path(__file__).parent / "memos"


async def main() -> int:
    settings = get_settings()
    key = settings.anthropic_api_key.get_secret_value()
    if not key:
        print("Set ANTHROPIC_API_KEY first.")
        return 1
    writer = ClaudeWriter(key, settings.memo_model)
    OUT.mkdir(exist_ok=True)
    first_try = grounded = 0
    for case, deal in cases():
        retried = False
        async for step in memo.compose(writer, memo.brief(deal)):
            if isinstance(step, memo.Retry):
                retried = True
            elif isinstance(step, memo.Finished):
                if step.unmatched:
                    print(f"{case}: ungrounded {step.unmatched}")
                    continue
                grounded += 1
                first_try += not retried
                (OUT / f"{case}.md").write_text(step.body + "\n")
                print(f"{case}: ok{' after a rewrite' if retried else ''}")
    total = len(cases())
    print(f"\n{grounded}/{total} grounded, {first_try}/{total} on the first draft")
    return 0 if grounded == total else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
