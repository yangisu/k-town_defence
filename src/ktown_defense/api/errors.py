"""Stable domain-to-HTTP error mapping."""

from dataclasses import dataclass

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError


@dataclass
class ApiError(Exception):
    status_code: int
    code: str
    message: str
    field: str | None = None


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def handle_api_error(_request: Request, error: ApiError) -> JSONResponse:
        body: dict[str, str] = {"code": error.code, "message": error.message}
        if error.field is not None:
            body["field"] = error.field
        return JSONResponse(status_code=error.status_code, content=body)

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        _request: Request, error: RequestValidationError
    ) -> JSONResponse:
        first = error.errors()[0]
        location = first.get("loc", ())
        field = str(location[-1]) if location else None
        body = {"code": "VALIDATION_ERROR", "message": "요청 값이 올바르지 않습니다."}
        if field is not None:
            body["field"] = field
        return JSONResponse(status_code=422, content=body)
