"""Shared building blocks for the schemas: the base model and the timestamp type.

Timestamps travel as JavaScript `toISOString()` strings ("2027-01-11T10:40:00.000Z": UTC,
milliseconds), the same format the panel's mock and the audit chain use.
"""

from __future__ import annotations

import re
from datetime import UTC, date, datetime
from typing import Annotated, Any

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, PlainSerializer

_ISO_DT = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$")
_ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class KModel(BaseModel):
    """Immutable; unknown input keys are dropped (zod's default `z.object` behaviour)."""

    model_config = ConfigDict(frozen=True, extra="ignore", populate_by_name=True)


def iso_ms(value: datetime) -> str:
    """JavaScript `Date.prototype.toISOString()` for an aware datetime (UTC, millisecond precision)."""
    if value.tzinfo is None:
        raise ValueError("naive datetime")
    utc = value.astimezone(UTC)
    return utc.strftime("%Y-%m-%dT%H:%M:%S.") + f"{utc.microsecond // 1000:03d}Z"


def _parse_dt(value: Any) -> Any:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            raise ValueError("Saat dilimi olmayan zaman")
        return value
    if isinstance(value, str) and _ISO_DT.match(value):
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    raise ValueError("ISO-8601 zaman bekleniyor (ör. 2027-01-11T10:40:00.000Z)")


def _parse_date(value: Any) -> Any:
    if isinstance(value, datetime):
        raise ValueError("Tarih bekleniyor (YYYY-MM-DD)")
    if isinstance(value, date):
        return value
    if isinstance(value, str) and _ISO_DATE.match(value):
        return date.fromisoformat(value)
    raise ValueError("Tarih bekleniyor (YYYY-MM-DD)")


#: z.iso.datetime({ offset: true }) — aware datetime in, toISOString() out.
IsoDateTime = Annotated[datetime, BeforeValidator(_parse_dt), PlainSerializer(iso_ms, return_type=str)]
#: z.iso.date()
IsoDate = Annotated[date, BeforeValidator(_parse_date), PlainSerializer(lambda d: d.isoformat(), return_type=str)]

Ticker = Annotated[str, Field(pattern=r"^[A-Z0-9]{3,6}$")]
Sha256Hex = Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
Confidence = Annotated[float, Field(ge=0, le=1)]
NonNegInt = Annotated[int, Field(ge=0)]
PosInt = Annotated[int, Field(gt=0)]
NonNegFloat = Annotated[float, Field(ge=0)]
PosFloat = Annotated[float, Field(gt=0)]
