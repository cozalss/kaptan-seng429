"""The error envelope (API.md §3.2): every error is `{"detail": "<Turkish>", "code": "<machine>"}`.

Raise `ApiError(status, code, detail)` anywhere; the handlers turn validation errors, unknown
routes and crashes into the same envelope. `detail` is shown to the user as-is, so it never
contains internals (those go to the server log).
"""

from __future__ import annotations

import logging
from typing import Any, Final

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("kaptan.api")

#: Fallback texts by status (same as the panel's http client fallbacks).
STATUS_DETAIL: Final[dict[int, tuple[str, str]]] = {
    400: ("bad_request", "İstek geçersiz."),
    401: ("unauthenticated", "Oturumunuzun süresi doldu. Lütfen yeniden giriş yapın."),
    403: ("forbidden", "Bu işlem rolüne kapalı."),
    404: ("not_found", "Kayıt bulunamadı."),
    405: ("method_not_allowed", "Bu yöntem desteklenmiyor."),
    409: ("conflict", "Kayıt bu arada değişti ya da süresi doldu."),
    422: ("validation", "Girdi geçersiz."),
    429: ("rate_limited", "Çok fazla istek. Biraz sonra yeniden deneyin."),
    501: ("not_implemented", "Bu uç nokta henüz hazır değil."),
}
INTERNAL: Final = ("internal", "Sunucu hatası.")


class ApiError(Exception):
    """A typed, user-safe API error (`detail` is Turkish and displayable)."""

    def __init__(self, status: int, code: str, detail: str, headers: dict[str, str] | None = None) -> None:
        super().__init__(detail)
        self.status = status
        self.code = code
        self.detail = detail
        self.headers = headers


def unauthenticated(detail: str = "Oturum bulunamadı. Lütfen yeniden giriş yapın.") -> ApiError:
    return ApiError(401, "unauthenticated", detail, headers={"WWW-Authenticate": "Bearer"})


def not_implemented(endpoint: str) -> ApiError:
    return ApiError(501, "not_implemented", f"Bu uç nokta henüz hazır değil: {endpoint}")


def envelope(status: int, code: str, detail: str, headers: dict[str, str] | None = None) -> JSONResponse:
    return JSONResponse(status_code=status, content={"detail": detail, "code": code}, headers=headers)


def validation_detail(errors: list[Any]) -> str:
    """The first error, in Turkish: custom validator texts as-is, otherwise a generic sentence."""
    if not errors:
        return STATUS_DETAIL[422][1]
    first = errors[0]
    msg = str(first.get("msg", ""))
    if first.get("type") == "value_error":
        return msg.removeprefix("Value error, ")
    loc = [str(p) for p in first.get("loc", ()) if p not in ("body", "query", "path")]
    where = ".".join(loc)
    if first.get("type") == "missing":
        return f"Eksik alan: {where}." if where else "Eksik alan."
    if first.get("type") == "json_invalid":
        return "Gövde geçerli bir JSON değil."
    return f"Geçersiz değer: {where}." if where else STATUS_DETAIL[422][1]


async def _api_error(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, ApiError)
    return envelope(exc.status, exc.code, exc.detail, exc.headers)


async def _validation_error(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    return envelope(422, "validation", validation_detail(list(exc.errors())))


async def _http_error(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)
    code, detail = STATUS_DETAIL.get(exc.status_code, INTERNAL)
    headers = dict(exc.headers) if exc.headers else None
    return envelope(exc.status_code, code, detail, headers)


async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
    log.exception("unhandled error on %s %s", request.method, request.url.path, exc_info=exc)
    return envelope(500, *INTERNAL)


def install_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(ApiError, _api_error)
    app.add_exception_handler(RequestValidationError, _validation_error)
    app.add_exception_handler(StarletteHTTPException, _http_error)
    app.add_exception_handler(Exception, _unhandled)
