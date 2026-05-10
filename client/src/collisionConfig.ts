export type ColliderType = 'sphere' | 'cylinder';

export interface ColliderConfig {
    type: ColliderType;
    // Для сферы (базовые, без учёта scale)
    radius?: number;            // если не задан — вычисляется как modelWidth/2
    yOffset?: number;           // смещение центра от земли (без scale)
    // Для цилиндра (базовые, scale=1)
    cylinderRadius?: number;    
    cylinderHeight?: number;
}

const config: Record<string, ColliderConfig> = {
    "Tree_1": {type: 'cylinder', cylinderRadius: 0.5, cylinderHeight: 1.0},
    "Tree_2": {type: 'cylinder', cylinderRadius: 0.3, cylinderHeight: 1.0},
    "Tree_3": {type: 'cylinder', cylinderRadius: 0.3, cylinderHeight: 1.0},
    "Tree_11": {type: 'cylinder', cylinderRadius: 0.3, cylinderHeight: 1.0},
    "Tree_14": {type: 'cylinder', cylinderRadius: 0.5, cylinderHeight: 1.0},
    "Tree_10": {type: 'cylinder', cylinderRadius: 0.2, cylinderHeight: 1.0},
    "Tree_19": {type: 'cylinder', cylinderRadius: 0.5, cylinderHeight: 1.0},
    "Tree_12": {type: 'cylinder', cylinderRadius: 0.5, cylinderHeight: 1.0},
    "Tree_13": {type: 'cylinder', cylinderRadius: 0.6, cylinderHeight: 1.0},
    "Tree_17": {type: 'cylinder', cylinderRadius: 0.6, cylinderHeight: 1.0},
    "Tree_18": {type: 'cylinder', cylinderRadius: 0.7, cylinderHeight: 1.0},
    // Камни (сферы) — можно дополнять
    "Rock_1": { type: 'sphere', radius: 4.3, yOffset: 0.0 },
    "Rock_2": { type: 'sphere', radius: 1, yOffset: 0.0 },
    /* "Rock_5": { type: 'sphere', radius: 0.9, yOffset: 0.4 }, */
    /* "Rock_6": { type: 'sphere', radius: 0.8, yOffset: 0.3 }, */
    /* "Rock_7": { type: 'sphere', radius: 1.1, yOffset: 0.5 }, */
    /* "Rock_8": { type: 'sphere', radius: 1.3, yOffset: 0.7 }, */
};

export function getColliderConfig(modelName: string): ColliderConfig | null {
    const name = modelName.replace(/\.[^/.]+$/, "");
    return config[name] || null;
}