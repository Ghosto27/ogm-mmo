export interface SpawnZone {
  centerX: number;
  centerZ: number;
  radius: number;
  count: number;   // количество волков в этой зоне
}

export const wolfSpawnZones: SpawnZone[] = [
  { centerX: -100, centerZ: -100, radius: 15, count: 1 },
  //{ centerX:  40, centerZ: -40, radius: 15, count: 3 },
  //{ centerX: -40, centerZ:  40, radius: 15, count: 2 },
  //{ centerX:  40, centerZ:  40, radius: 15, count: 3 },
  //{ centerX:   0, centerZ:  50, radius: 20, count: 1 },
];