import json
import time
from collections.abc import Callable
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, OpenerDirector, Request, build_opener


USER_AGENT = "PokeVault-provider-validation/1.0"


class FetchError(RuntimeError):
    """Raised when provider evidence cannot be retrieved safely."""


class _SameOriginHttpsRedirectHandler(HTTPRedirectHandler):
    def __init__(self, origin_url: str) -> None:
        self._origin_host = urlparse(origin_url).hostname

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        target = urlparse(newurl)
        if target.scheme != "https" or target.hostname != self._origin_host:
            raise FetchError("redirect must remain on the original HTTPS host")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def build_https_opener(origin_url: str) -> OpenerDirector:
    return build_opener(_SameOriginHttpsRedirectHandler(origin_url))


def fetch_json(
    url: str,
    *,
    timeout: float = 10.0,
    attempts: int = 2,
    max_bytes: int = 2 * 1024 * 1024,
    opener_factory: Callable[[str], OpenerDirector] = build_https_opener,
    sleep: Callable[[float], None] = time.sleep,
) -> object:
    origin = urlparse(url)
    if origin.scheme != "https" or not origin.hostname:
        raise FetchError("provider URL must use HTTPS")
    if attempts < 1:
        raise FetchError("attempts must be at least one")

    opener = opener_factory(url)
    request = Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(attempts):
        try:
            with opener.open(request, timeout=timeout) as response:
                final = urlparse(response.geturl())
                if final.scheme != "https" or final.hostname != origin.hostname:
                    raise FetchError("redirect must remain on the original HTTPS host")
                body = response.read(max_bytes + 1)
                if len(body) > max_bytes:
                    raise FetchError("response exceeds size limit")
                try:
                    return json.loads(body.decode("utf-8"))
                except (UnicodeDecodeError, json.JSONDecodeError) as error:
                    raise FetchError("response is not valid UTF-8 JSON") from error
        except HTTPError as error:
            raise FetchError(f"provider returned HTTP {error.code}") from error
        except FetchError:
            raise
        except (URLError, TimeoutError, OSError) as error:
            if attempt + 1 == attempts:
                raise FetchError("provider request failed after retry budget") from error
            sleep(0.25 * (attempt + 1))
    raise AssertionError("unreachable")
