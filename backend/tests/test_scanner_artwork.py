"""Visual lookup may fetch only bounded canonical public artwork."""

import asyncio

import httpx2 as httpx
import pytest

from app.cards.provider import CardProvider, CardsUnavailable
from app.cards.set_schemas import SetCard


def card(base="https://assets.tcgdex.net/en/sv/sv03.5/025"):
    return SetCard(
        id="sv03.5-025",
        local_id="025",
        name="Pikachu",
        language="en",
        image_url=None,
        thumbnail_url=None,
        image_language="en",
        image_sources=[{"base_url": base, "language": "en"}],
    )


def test_artwork_fetch_uses_anonymous_bounded_provider_cache():
    requests = []
    clock = [0.0]

    def handle(request):
        requests.append(request)
        assert (
            str(request.url) == "https://assets.tcgdex.net/en/sv/sv03.5/025/high.webp"
        )
        assert (
            "cookie" not in request.headers and "authorization" not in request.headers
        )
        return httpx.Response(
            200, content=b"reference", headers={"content-type": "image/webp"}
        )

    provider = CardProvider(
        transport=httpx.MockTransport(handle), clock=lambda: clock[0]
    )

    async def run():
        assert await provider.scanner_artwork(card(), "sv03.5") == b"reference"
        assert await provider.scanner_artwork(card(), "sv03.5") == b"reference"
        assert len(requests) == 1
        clock[0] = 301
        assert await provider.scanner_artwork(card(), "sv03.5") == b"reference"

    asyncio.run(run())
    assert len(requests) == 2


@pytest.mark.parametrize(
    "url",
    [
        "https://example.com/en/sv/sv03.5/025",
        "http://assets.tcgdex.net/en/sv/sv03.5/025",
        "https://assets.tcgdex.net:444/en/sv/sv03.5/025",
        "https://user:pass@assets.tcgdex.net/en/sv/sv03.5/025",
        "https://assets.tcgdex.net/en/sv/sv03.5/025?token=secret",
        "https://assets.tcgdex.net/en/sv/sv03.5/025#fragment",
        "https://assets.tcgdex.net/en/sv/sv03.5/026",
        "https://assets.tcgdex.net/en/sv/another/025",
        "https://assets.tcgdex.net/en/tcgp/sv03.5/025",
        "https://assets.tcgdex.net/en/sv/sv03.5/025%2Fother",
    ],
)
def test_untrusted_or_conflicting_artwork_does_not_reach_network(url):
    def handle(request):
        raise AssertionError("Untrusted URL reached transport")

    provider = CardProvider(transport=httpx.MockTransport(handle))
    with pytest.raises(CardsUnavailable):
        asyncio.run(provider.scanner_artwork(card(url), "sv03.5"))


@pytest.mark.parametrize(
    "status,headers,body",
    [
        (302, {"location": "https://example.com/"}, b""),
        (200, {"content-type": "text/html"}, b"invalid"),
        (200, {"content-type": "image/webp", "content-length": "1048577"}, b"small"),
        (200, {"content-type": "image/webp"}, b"x" * 1048577),
        (200, {"content-type": "image/webp"}, b""),
    ],
    ids=["redirect", "mime", "declared-size", "stream-size", "empty"],
)
def test_bad_artwork_response_is_sanitized(status, headers, body):
    requests = []

    def handle(request):
        requests.append(request)
        return httpx.Response(status, headers=headers, content=body)

    provider = CardProvider(transport=httpx.MockTransport(handle))
    with pytest.raises(CardsUnavailable):
        asyncio.run(provider.scanner_artwork(card(), "sv03.5"))
    assert len(requests) == 1


def test_artwork_cancellation_propagates_and_does_not_fill_cache():
    entered = asyncio.Event()

    async def handle(request):
        entered.set()
        await asyncio.Event().wait()

    provider = CardProvider(transport=httpx.MockTransport(handle))

    async def run():
        task = asyncio.create_task(provider.scanner_artwork(card(), "sv03.5"))
        await entered.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

    asyncio.run(run())
