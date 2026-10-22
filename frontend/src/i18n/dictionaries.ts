export const spanish = {
  nav: {
    home: "Inicio",
    boxes: "Cajas",
    pokedex: "Pokédex",
    profile: "Perfil",
    label: "Navegación principal",
  },
  languageAction: "English",
  home: {
    title: "Estado del sistema",
    description: "Comprueba la conexión entre PokéVault, su API y PostgreSQL.",
  },
  boxes: {
    title: "Cajas",
    description: "La experiencia de cajas clásicas llegará en la Iteración 4.",
  },
  pokedex: {
    title: "Pokédex",
    description: "Explora los primeros 20 Pokémon de la Pokédex Nacional.",
    loading: "Cargando Pokémon…",
    empty: "No hay Pokémon disponibles.",
    error: "No se pudo cargar la Pokédex. Inténtalo de nuevo.",
    noSprite: "Sprite no disponible",
    types: "Tipos",
  },
  pokemonTypes: {
    normal: "Normal",
    fire: "Fuego",
    water: "Agua",
    electric: "Eléctrico",
    grass: "Planta",
    ice: "Hielo",
    fighting: "Lucha",
    poison: "Veneno",
    ground: "Tierra",
    flying: "Volador",
    psychic: "Psíquico",
    bug: "Bicho",
    rock: "Roca",
    ghost: "Fantasma",
    dragon: "Dragón",
    dark: "Siniestro",
    steel: "Acero",
    fairy: "Hada",
  },
  profile: {
    title: "Perfil",
    description: "Las preferencias y la autenticación se implementarán más adelante.",
  },
  status: {
    title: "Estado de servicios",
    loading: "Comprobando conexiones…",
    apiHealthy: "API disponible",
    databaseHealthy: "PostgreSQL disponible",
    databaseUnavailable: "PostgreSQL no disponible",
    unreachable: "No se pudo contactar con la API de PokéVault.",
    retry: "Reintentar",
  },
} as const;

type WidenStrings<Value> = Value extends string
  ? string
  : { [Key in keyof Value]: WidenStrings<Value[Key]> };

export type Dictionary = WidenStrings<typeof spanish>;

export const english: Dictionary = {
  nav: {
    home: "Home",
    boxes: "Boxes",
    pokedex: "Pokédex",
    profile: "Profile",
    label: "Main navigation",
  },
  languageAction: "Español",
  home: {
    title: "System status",
    description: "Check the connection between PokéVault, its API, and PostgreSQL.",
  },
  boxes: {
    title: "Boxes",
    description: "The classic box experience will arrive in Iteration 4.",
  },
  pokedex: {
    title: "Pokédex",
    description: "Explore the first 20 Pokémon in the National Pokédex.",
    loading: "Loading Pokémon…",
    empty: "No Pokémon available.",
    error: "The Pokédex could not be loaded. Please try again.",
    noSprite: "Sprite unavailable",
    types: "Types",
  },
  pokemonTypes: {
    normal: "Normal",
    fire: "Fire",
    water: "Water",
    electric: "Electric",
    grass: "Grass",
    ice: "Ice",
    fighting: "Fighting",
    poison: "Poison",
    ground: "Ground",
    flying: "Flying",
    psychic: "Psychic",
    bug: "Bug",
    rock: "Rock",
    ghost: "Ghost",
    dragon: "Dragon",
    dark: "Dark",
    steel: "Steel",
    fairy: "Fairy",
  },
  profile: {
    title: "Profile",
    description: "Preferences and authentication will be implemented later.",
  },
  status: {
    title: "Service status",
    loading: "Checking connections…",
    apiHealthy: "API available",
    databaseHealthy: "PostgreSQL available",
    databaseUnavailable: "PostgreSQL unavailable",
    unreachable: "PokéVault API could not be reached.",
    retry: "Retry",
  },
};

export const dictionaries = { es: spanish, en: english } as const;
