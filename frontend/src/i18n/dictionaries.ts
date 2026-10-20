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
    description: "La navegación por especies y cartas llegará en la Iteración 4.",
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
    description: "Species and card browsing will arrive in Iteration 4.",
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
