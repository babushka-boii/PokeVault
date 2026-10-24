// Keep page/search mocks focused on their contracts while supplying the new
// selected-only detail boundary with valid responses.
export function withPokemonDetails(request: (url: string, options?: RequestInit) => Promise<Response>) {
  return (url: string, options?: RequestInit) => {
    const match = new URL(url).pathname.match(/\/api\/v1\/pokemon\/(\d+)$/);
    if (!match) return request(url, options);
    const number = Number(match[1]);
    const language = new URL(url).searchParams.get('language') ?? 'es';
    return Promise.resolve(new Response(JSON.stringify({
      national_dex_number: number, name: number === 559 ? 'scraggy' : `pokemon-${number}`,
      types: ['grass'], sprite_url: null, name_language: language,
      height_m: .7, weight_kg: 6.9, abilities: [], description: null, description_language: null,
    })));
  };
}
