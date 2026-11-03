"""Who holds the shares in an E2 attachment: a legal entity or a person. The kind only, never the name (KVKK).

Two real shapes (tests/fixtures/kap_attachments):
    Ad Soyad / Ticaret Ünvanı : <holder>                       MKK's form
    Tüzel Kişi Adına Bildirimi Yapanın Adı Soyadı : <person>   filled only when the holder is a legal entity
    Görevi : <the holder's duty, or the person signing for an entity>
and the filer's own PDF, whose first person is a company:
    "... şirketimiz tarafından ...", then "Ticaret Unvanı: FMR LLC" or "Şirket: Bank of America Corporation"

"Unvan" on the filer's own PDF is the signatory's title ("Vice President"): it says nothing about the holder.
"""

from __future__ import annotations

import re
from typing import Final, Literal

_MKK_HOLDER: Final = re.compile(r"Ad Soyad\s*/\s*Ticaret Ünvanı\s*:[ \t]*(\S[^\n]*)")
_MKK_SIGNING_FOR_ENTITY: Final = re.compile(r"Tüzel Kişi Adına Bildirimi Yapanın Adı Soyadı\s*:[ \t]*\S")
_LEGAL_FORM: Final = re.compile(
    r"\b(?:A\.?Ş\.?|LTD\.?|LLC|INC\.?|CORP\w*|PLC|GMBH|N\.V\.|S\.A\.|B\.V\.|FUND|FONU|PORTFÖY|HOLDİNG)(?!\w)", re.I
)
_OWN_FORM_COMPANY: Final = re.compile(r"^[ \t]*(?:Şirket|Ticaret[ \t]+Unvanı|Company)[ \t]*:[ \t]*\S", re.M)
_CORPORATE_FIRST_PERSON: Final = re.compile(r"şirketimiz|ortaklığımız|our company", re.I)


def holder_kind(text: str) -> Literal["entity", "person"] | None:
    """None: the form does not say, so nothing may be concluded from this."""
    if _OWN_FORM_COMPANY.search(text) and _CORPORATE_FIRST_PERSON.search(text):
        return "entity"
    holder = _MKK_HOLDER.search(text)
    if holder is None:
        return None
    return "entity" if _MKK_SIGNING_FOR_ENTITY.search(text) or _LEGAL_FORM.search(holder.group(1)) else "person"


__all__ = ["holder_kind"]
