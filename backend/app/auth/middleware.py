"""Prevent authentication responses and callback query secrets from leaking."""

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send


class AuthenticationPrivacyMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not scope["path"].startswith("/api/v1/auth/"):
            await self.app(scope, receive, send)
            return

        async def private_send(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers["Cache-Control"] = "no-store"
                headers["Pragma"] = "no-cache"
                headers["Referrer-Policy"] = "no-referrer"
                # Uvicorn formats its access line while sending response.start.
                # Route parsing has finished, so remove the callback's secrets.
                scope["query_string"] = b""
            await send(message)

        try:
            await self.app(scope, receive, private_send)
        finally:
            # Also redact before an outer error handler/server logs a failed request.
            scope["query_string"] = b""
