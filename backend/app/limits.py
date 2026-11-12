"""Limit streaming request bodies as well as Content-Length uploads."""

from fastapi import HTTPException
from .config import settings


class BodyLimitMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or not scope["path"].startswith("/api/"):
            return await self.app(scope, receive, send)
        received = 0

        async def bounded_receive():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > settings.max_upload + 1024 * 1024:
                    raise HTTPException(413, "Upload exceeds the maximum request size.")
            return message

        await self.app(scope, bounded_receive, send)
