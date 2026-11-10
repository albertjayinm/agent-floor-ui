export type Surface = 'tile' | 'wood' | 'concrete' | 'carpet';

export interface FloorConfig {
  id: string;
  name: string;
  surface: Surface;
  wall: string;
  accent: string;
  desks: 2 | 4 | 6;
  meeting: boolean;
  lounge: boolean;
  lab: boolean;
  plants: boolean;
}

export const MAX_FLOORS = 12;
export const FLOORS_STORAGE_KEY = 'agent-floor-ui:floors';
export const surfaces: [Surface, string][] = [['tile', 'Studio tile'], ['wood', 'Warm oak'], ['concrete', 'Concrete'], ['carpet', 'Soft carpet']];
export const wallColors = ['#c4d2cc', '#d9cbb8', '#b8c7d9', '#d6bfc4', '#cfd4d6', '#c9c1dc'];
export const accentColors = ['#c1cbd4', '#b9cfc0', '#e2c4a6', '#d8b4b8', '#c9c3e0', '#a9c9cf'];

export const defaultFloors: FloorConfig[] = [
  { id: 'main', name: 'Main floor', surface: 'tile', wall: '#c4d2cc', accent: '#c1cbd4', desks: 4, meeting: true, lounge: true, lab: true, plants: true },
  { id: 'loft', name: 'Research loft', surface: 'wood', wall: '#d9cbb8', accent: '#b9cfc0', desks: 2, meeting: true, lounge: true, lab: true, plants: true },
];

const hex = (value: unknown) => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);

export function isFloorConfig(value: unknown): value is FloorConfig {
  if (!value || typeof value !== 'object') return false;
  const floor = value as Record<string, unknown>;
  return typeof floor.id === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(floor.id)
    && typeof floor.name === 'string' && floor.name.trim().length > 0 && floor.name.length <= 40
    && surfaces.some(([surface]) => surface === floor.surface)
    && hex(floor.wall) && hex(floor.accent) && [2, 4, 6].includes(floor.desks as number)
    && ['meeting', 'lounge', 'lab', 'plants'].every(key => typeof floor[key] === 'boolean');
}

export function createFloor(existing: FloorConfig[]): FloorConfig {
  let number = existing.length + 1;
  while (existing.some(floor => floor.id === `floor-${number}`)) number++;
  const index = existing.length;
  return {
    id: `floor-${number}`, name: `Floor ${number}`, surface: surfaces[index % surfaces.length][0],
    wall: wallColors[index % wallColors.length], accent: accentColors[index % accentColors.length],
    desks: 4, meeting: true, lounge: true, lab: true, plants: true,
  };
}

function validFloors(list: unknown) {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  return list.filter((floor): floor is FloorConfig => isFloorConfig(floor) && !seen.has(floor.id) && !!seen.add(floor.id)).slice(0, MAX_FLOORS);
}

export function loadFloors(fallback: FloorConfig[]) {
  try {
    const saved = validFloors(JSON.parse(localStorage.getItem(FLOORS_STORAGE_KEY) ?? 'null'));
    if (saved.length) return saved;
  } catch {}
  const initial = validFloors(fallback);
  return initial.length ? initial : defaultFloors;
}
