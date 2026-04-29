export const villageData = [
  // --- Домики (увеличены координаты в 3 раза, масштаб тоже чуть увеличен) ---
  { id: "house_1", modelName: "cube", x: -18, z: -18, scaleX: 12, scaleY: 9, scaleZ: 12, color: "#8B5A2B" },
  { id: "house_2", modelName: "cube", x:  18, z: -18, scaleX: 12, scaleY: 9, scaleZ: 12, color: "#8B5A2B" },
  { id: "house_3", modelName: "cube", x:   0, z:  18, scaleX: 15, scaleY: 12, scaleZ: 15, color: "#A0522D" },

  // --- Забор (координаты увеличены, длина секций увеличена) ---
  { id: "fence_left_1",  modelName: "cube", x: -25,  z: -20,  scaleX: 0.6, scaleY: 4.5, scaleZ: 36, color: "#D2B48C" },
  { id: "fence_left_2",  modelName: "cube", x: -25,  z:   0,  scaleX: 0.6, scaleY: 4.5, scaleZ: 40, color: "#D2B48C" },
  { id: "fence_right_1", modelName: "cube", x:  25,  z: -20,  scaleX: 0.6, scaleY: 4.5, scaleZ: 36, color: "#D2B48C" },
  { id: "fence_right_2", modelName: "cube", x:  25,  z:   0,  scaleX: 0.6, scaleY: 4.5, scaleZ: 40, color: "#D2B48C" },
  { id: "fence_top_1",   modelName: "cube", x: -18,  z: -30,  scaleX: 36, scaleY: 4.5, scaleZ: 0.6, color: "#D2B48C" },
  { id: "fence_top_2",   modelName: "cube", x:  18,  z: -30,  scaleX: 36, scaleY: 4.5, scaleZ: 0.6, color: "#D2B48C" },

  // --- Колодец (оставлен в центре) ---
  { id: "well", modelName: "cylinder", x: 15, z: 0, scaleX: 1.5, scaleY: 1.2, scaleZ: 1.5, color: "#696969" },

  // --- Дорога к колодцу (удлинена) ---
  { id: "road_to_well", modelName: "plane", x: 0, z: 0, scaleX: 9, scaleY: 60, scaleZ: 1, color: "#A9A9A9", rotationY:Math.PI, rotationX: Math.PI / 2 }
];