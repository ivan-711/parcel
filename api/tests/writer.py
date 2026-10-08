from collections.abc import AsyncIterator, Sequence

from parcel.adapters.anthropic import Turn, WriterError


class FakeWriter:
    """Plays back scripted memos in small pieces, the way a model streams."""

    model = "fake-writer"

    def __init__(self, *drafts: str, fail: bool = False) -> None:
        self.drafts = list(drafts)
        self.fail = fail
        self.calls: list[list[Turn]] = []
        self.system = ""

    async def stream(self, system: str, turns: Sequence[Turn]) -> AsyncIterator[str]:
        self.system = system
        self.calls.append(list(turns))
        if self.fail:
            raise WriterError("overloaded")
        draft = self.drafts.pop(0)
        for start in range(0, len(draft), 40):
            yield draft[start : start + 40]
