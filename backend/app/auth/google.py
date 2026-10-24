"""Google's fixed OIDC endpoints, Authlib OAuth and joserfc signature validation."""

import httpx2
from authlib.integrations.base_client.errors import OAuthError
from authlib.integrations.httpx_client import AsyncOAuth2Client
from authlib.oidc.core import CodeIDToken
from joserfc import jwt
from joserfc.errors import JoseError
from joserfc.jwk import KeySet
from joserfc.jws import JWSRegistry

from app.core.config import Settings

AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
JWKS_ENDPOINT = "https://www.googleapis.com/oauth2/v3/certs"


class InvalidIdentity(Exception):
    """An ID token did not establish a verified Google identity."""


class ProviderUnavailable(Exception):
    """Google's token or public key endpoint is unavailable."""


class GoogleOIDCClient:
    def __init__(
        self,
        settings: Settings,
        *,
        transport: httpx2.AsyncBaseTransport | None = None,
    ) -> None:
        self.settings = settings
        self.transport = transport

    def client(self) -> AsyncOAuth2Client:
        return AsyncOAuth2Client(
            self.settings.google_client_id,
            self.settings.google_client_secret.get_secret_value(),
            scope="openid email profile",
            redirect_uri=self.settings.google_redirect_uri,
            code_challenge_method="S256",
            token_endpoint_auth_method="client_secret_post",
            timeout=10,
            transport=self.transport,
            follow_redirects=False,
        )

    def authorization_url(self, state: str, nonce: str, verifier: str) -> str:
        # URL creation is local and does not acquire network resources.
        client = self.client()
        url, _ = client.create_authorization_url(
            AUTHORIZATION_ENDPOINT, state=state, nonce=nonce, code_verifier=verifier
        )
        return url

    async def identity(self, code: str, nonce: str, verifier: str) -> dict:
        try:
            async with self.client() as client:
                token = await client.fetch_token(
                    TOKEN_ENDPOINT,
                    grant_type="authorization_code",
                    code=code,
                    code_verifier=verifier,
                )
                response = await client.request(
                    "GET", JWKS_ENDPOINT, withhold_token=True
                )
                response.raise_for_status()
                keys = response.json()
        except (httpx2.HTTPError, OAuthError, ValueError, KeyError) as error:
            raise ProviderUnavailable from error
        try:
            encoded = token.get("id_token")
            if not isinstance(encoded, str):
                raise InvalidIdentity
            decoded = jwt.decode(
                encoded,
                KeySet.import_key_set(keys),
                registry=JWSRegistry(algorithms=["RS256"], strict_check_header=False),
            )
            claims = CodeIDToken(
                decoded.claims,
                decoded.header,
                options={
                    "iss": {
                        "essential": True,
                        "values": [
                            "https://accounts.google.com",
                            "accounts.google.com",
                        ],
                    },
                    "aud": {"essential": True, "value": self.settings.google_client_id},
                },
                params={
                    "nonce": nonce,
                    "client_id": self.settings.google_client_id,
                    "access_token": token.get("access_token"),
                },
            )
            claims.validate(leeway=30)
            subject = claims.get("sub")
            if not isinstance(subject, str) or not subject or len(subject) > 255:
                raise InvalidIdentity
            return dict(claims)
        except (JoseError, ValueError, TypeError, KeyError) as error:
            raise InvalidIdentity from error
