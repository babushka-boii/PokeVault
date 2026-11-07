// Public catalog tests retain their original request assertions. Session
// restoration has its own endpoint and never consumes a catalog response.
export function withUnauthenticatedSession(request: (url: string, options?: RequestInit) => Promise<Response>) {
  return (url: string, options?: RequestInit) => new URL(url).pathname === "/api/v1/auth/me"
    ? Promise.resolve(new Response(null, { status: 401 }))
    : request(url, options);
}
