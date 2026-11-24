"""One meaning of "important", one plain line, one tone: the contract every reading screen and alert shares.

`describe` and `signals_between` are read-only. See `kaptan.signal.store` for the rules and `kaptan.signal.lines`
for how the line is made.
"""

from __future__ import annotations

from kaptan.signal.lines import Tone
from kaptan.signal.store import Mine, Signal, describe, signals_between

__all__ = ["Mine", "Signal", "Tone", "describe", "signals_between"]
