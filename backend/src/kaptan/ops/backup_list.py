"""The panel's list of backups and the safe way back (Ayarlar · Yedekler).

The backup folder is mounted read-only into the API container (`BACKUP_MOUNT`, default `/yedek`). The files are
`kaptan-YYYYMMDDTHHMMSSZ.dump` (or `.dump.age`); their name says when they were taken. The app only LISTS them:
going back to one is done by `geri-yukle.ps1` on the computer, never from the web app (it stops KAPtan, swaps the
database and keeps today's data under another name). When the folder cannot be read the answer says so
(`available` false); it never shows an empty list as "no backups".
"""

from __future__ import annotations

import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Final

from kaptan.domain.schemas._base import iso_ms

NAME_RE: Final = re.compile(r"^kaptan-(\d{8}T\d{6}Z)\.dump(\.age)?$")
#: The nightly loop makes one a day: older than this, the person is warned.
STALE_AFTER_DAYS: Final = 2
SHOWN: Final = 30

STEPS_TR: Final[tuple[str, ...]] = (
    "Önce kontrol et: KAPtan klasöründe PowerShell aç ve .\\geri-yukle.ps1 -Kontrol yaz. "
    "Yedek ayrı bir yerde açılır, kayıtların sağlamlığı denetlenir, hemen silinir. Bugünkü verine dokunmaz.",
    "Gerçekten dönmek için .\\geri-yukle.ps1 yaz (belirli bir yedek için: -Dosya kaptan-…dump). "
    "KAPtan kısa süreliğine durur.",
    "Bugünkü verin silinmez: kaptan_eski_ ile başlayan bir adla kenara konur. Yedekten sonra yazılanlar yedekte olmaz.",
    "Bittiğinde .\\baslat.ps1 ile KAPtan’ı yeniden başlat. Bu uygulamadan geri yükleme yapılamaz: bilerek öyle.",
)


def taken_at(name: str) -> datetime | None:
    """When a backup file was taken, from its name; None for any other file."""
    m = NAME_RE.match(name)
    if m is None:
        return None
    try:
        return datetime.strptime(m.group(1), "%Y%m%dT%H%M%SZ").replace(tzinfo=UTC)
    except ValueError:
        return None


def warning_for(age_days: int | None) -> str | None:
    """The plain warning for the newest backup's age (None = fine)."""
    if age_days is None:
        return "Henüz yedek görünmüyor. Ayarlar’dan “Şimdi yedek al”a bas."
    if age_days >= STALE_AFTER_DAYS:
        return f"Son yedek {age_days} gün önce alındı. Yedek servisi çalışmıyor olabilir: “Şimdi yedek al”a bas."
    return None


def list_backups(folder: str, now: datetime) -> list[dict[str, Any]] | None:
    """Newest first, at most SHOWN; None when the folder cannot be read."""
    try:
        entries = [p for p in Path(folder).iterdir() if p.is_file()]
    except OSError:
        return None
    found: list[dict[str, Any]] = []
    for p in entries:
        at = taken_at(p.name)
        if at is None:
            continue
        try:
            size = p.stat().st_size
        except OSError:
            continue
        found.append(
            {"name": p.name, "at": iso_ms(at), "size_bytes": size, "age_days": max(0, (now - at).days), "_t": at}
        )
    found.sort(key=lambda f: f["_t"], reverse=True)
    return [{k: v for k, v in f.items() if k != "_t"} for f in found[:SHOWN]]


def backup_list(folder: str, shown_folder: str | None, now: datetime) -> dict[str, Any]:
    files = list_backups(folder, now)
    newest = files[0] if files else None
    age = None if newest is None else int(newest["age_days"])
    available = files is not None
    stale = available and (age is None or age >= STALE_AFTER_DAYS)
    return {
        "available": available,
        "folder": shown_folder,
        "last_at": None if newest is None else newest["at"],
        "age_days": age,
        "stale": stale,
        "warning_tr": warning_for(age) if available else None,
        "files": files or [],
        "steps_tr": list(STEPS_TR),
    }
