import io
import unittest
from urllib.error import HTTPError, URLError

from research.providers.provider_validation.http import FetchError, fetch_json


class Response(io.BytesIO):
    def __init__(self, body: bytes, url: str = "https://api.example.test/item") -> None:
        super().__init__(body)
        self.url = url

    def geturl(self) -> str:
        return self.url

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


class Opener:
    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.calls = []

    def open(self, request, timeout):
        self.calls.append((request, timeout))
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


class HttpTests(unittest.TestCase):
    def test_rejects_non_https_origin(self):
        with self.assertRaisesRegex(FetchError, "HTTPS"):
            fetch_json("http://api.example.test/item", opener_factory=lambda _: None)

    def test_sends_exact_user_agent_and_timeout(self):
        opener = Opener([Response(b'{"ok":true}')])
        result = fetch_json("https://api.example.test/item", timeout=3.5, opener_factory=lambda _: opener)
        self.assertEqual({"ok": True}, result)
        request, timeout = opener.calls[0]
        self.assertEqual("PokeVault-provider-validation/1.0", request.get_header("User-agent"))
        self.assertEqual(3.5, timeout)

    def test_retries_one_transient_connection_error(self):
        opener = Opener([URLError("temporary"), Response(b'[]')])
        sleeps = []
        self.assertEqual([], fetch_json("https://api.example.test/item", opener_factory=lambda _: opener, sleep=sleeps.append))
        self.assertEqual(2, len(opener.calls))
        self.assertEqual([0.25], sleeps)

    def test_does_not_retry_http_404(self):
        error = HTTPError("https://api.example.test/item", 404, "missing", {}, None)
        opener = Opener([error])
        with self.assertRaises(FetchError):
            fetch_json("https://api.example.test/item", opener_factory=lambda _: opener)
        self.assertEqual(1, len(opener.calls))

    def test_redirect_policy_rejects_cross_host_and_downgrade(self):
        for redirected in ("https://other.test/item", "http://api.example.test/item"):
            opener = Opener([Response(b'{}', redirected)])
            with self.subTest(redirected=redirected), self.assertRaisesRegex(FetchError, "redirect"):
                fetch_json("https://api.example.test/item", opener_factory=lambda _: opener)

    def test_accepts_same_host_https_redirect(self):
        opener = Opener([Response(b'{"ok":1}', "https://api.example.test/v2/item")])
        self.assertEqual({"ok": 1}, fetch_json("https://api.example.test/item", opener_factory=lambda _: opener))

    def test_two_mibibyte_boundary_and_closure(self):
        limit = 2 * 1024 * 1024
        exact = Response(b'"' + b'x' * (limit - 2) + b'"')
        self.assertIsInstance(fetch_json("https://api.example.test/item", opener_factory=lambda _: Opener([exact])), str)
        self.assertTrue(exact.closed)
        oversized = Response(b'"' + b'x' * (limit - 1) + b'"')
        with self.assertRaisesRegex(FetchError, "size"):
            fetch_json("https://api.example.test/item", opener_factory=lambda _: Opener([oversized]))
        self.assertTrue(oversized.closed)

    def test_malformed_json_closes_response(self):
        response = Response(b'{broken')
        with self.assertRaisesRegex(FetchError, "JSON"):
            fetch_json("https://api.example.test/item", opener_factory=lambda _: Opener([response]))
        self.assertTrue(response.closed)


if __name__ == "__main__":
    unittest.main()
