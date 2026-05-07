export interface SpawnZone {
  centerX: number;
  centerZ: number;
  radius: number;
  count: number;   // количество волков в этой зоне
}

export interface VegetationZone {
  id: string;
  centerX: number;
  centerZ: number;
  width: number;      // размеры зоны
  depth: number;
  objectType: 'tree' | 'rock'; // тип объекта
  modelNames: string[];  // имя модели в папке public/models/
  count: number;      // количество объектов в зоне
  minScale: number;   // минимальный масштаб
  maxScale: number;   // максимальный масштаб
}

export const wolfSpawnZones: SpawnZone[] = [
  { centerX: -180, centerZ: 0, radius: 100, count: 10 },
  //{ centerX:  40, centerZ: -40, radius: 15, count: 3 },
  //{ centerX: -40, centerZ:  40, radius: 15, count: 2 },
  //{ centerX:  40, centerZ:  40, radius: 15, count: 3 },
  //{ centerX:   0, centerZ:  50, radius: 20, count: 1 },
];

export const forestZones: VegetationZone[] = [
  {
    id: "pine_forest_north",
    centerX: -180, centerZ: 0,   // координаты центра зоны
    width: 200, depth: 400,          // размеры зоны
    objectType: 'tree',
    modelNames: ['Tree_1', 'Tree_10', 'Tree_11', 'Tree_14'], // без расширения, будем добавлять позже
    count: 100,                      // 30 деревьев
    minScale: 1, maxScale: 5,
  },
  {
    id: "rocky_area_south",
    centerX: -180, centerZ: 0,
    width: 200, depth: 400,
    objectType: 'rock',
    modelNames: ['Rock_2', 'Rock_3', 'Rock_5', 'Rock_6', 'Rock_7', 'Rock_8'],
    count: 100,
    minScale: 1, maxScale: 3,
  }
];