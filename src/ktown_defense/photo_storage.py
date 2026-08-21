"""Private, bounded check-in photo storage."""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import os
from pathlib import Path
import tempfile
from uuid import UUID, uuid4

from fastapi import UploadFile

from .api.errors import ApiError


MAX_PHOTO_BYTES = 10 * 1024 * 1024


@dataclass(frozen=True)
class StoredPhoto:
    storage_key: str
    content_type: str
    size_bytes: int
    sha256: str


class PrivatePhotoStorage:
    def __init__(self, root: Path) -> None:
        self.root = root.resolve()

    async def store(self, session_id: UUID, upload: UploadFile) -> StoredPhoto:
        content_type = upload.content_type or ""
        suffixes = {
            "image/jpeg": ".jpg",
            "image/png": ".png",
            "image/webp": ".webp",
        }
        if content_type not in suffixes:
            raise ApiError(422, "INVALID_PHOTO", "JPEG, PNG 또는 WebP 사진이 필요합니다.")
        relative = Path("checkins") / str(session_id) / f"{uuid4()}{suffixes[content_type]}"
        target = (self.root / relative).resolve()
        if self.root not in target.parents:
            raise ApiError(422, "INVALID_PHOTO", "사진 저장 경로가 올바르지 않습니다.")
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary_path: Path | None = None
        digest = hashlib.sha256()
        size = 0
        header = b""
        try:
            with tempfile.NamedTemporaryFile(
                dir=target.parent, prefix="upload-", suffix=".tmp", delete=False
            ) as temporary:
                temporary_path = Path(temporary.name)
                while chunk := await upload.read(64 * 1024):
                    size += len(chunk)
                    if size > MAX_PHOTO_BYTES:
                        raise ApiError(413, "PHOTO_TOO_LARGE", "사진은 10MiB 이하여야 합니다.")
                    if len(header) < 16:
                        header += chunk[: 16 - len(header)]
                    digest.update(chunk)
                    temporary.write(chunk)
            if size == 0 or not self._matches_magic(content_type, header):
                raise ApiError(422, "INVALID_PHOTO", "사진 형식과 파일 내용이 일치하지 않습니다.")
            os.replace(temporary_path, target)
            temporary_path = None
            return StoredPhoto(relative.as_posix(), content_type, size, digest.hexdigest())
        finally:
            await upload.close()
            if temporary_path is not None:
                temporary_path.unlink(missing_ok=True)
                self._remove_empty_parents(temporary_path.parent)

    def delete(self, storage_key: str) -> None:
        target = (self.root / storage_key).resolve()
        if self.root in target.parents:
            target.unlink(missing_ok=True)
            self._remove_empty_parents(target.parent)

    def _remove_empty_parents(self, directory: Path) -> None:
        while directory != self.root and self.root in directory.parents:
            try:
                directory.rmdir()
            except OSError:
                return
            directory = directory.parent

    @staticmethod
    def _matches_magic(content_type: str, header: bytes) -> bool:
        if content_type == "image/jpeg":
            return header.startswith(b"\xff\xd8\xff")
        if content_type == "image/png":
            return header.startswith(b"\x89PNG\r\n\x1a\n")
        return len(header) >= 12 and header.startswith(b"RIFF") and header[8:12] == b"WEBP"
