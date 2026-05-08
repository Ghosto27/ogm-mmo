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
    "Tree_1": {
        type: 'cylinder',
        cylinderRadius: 0.5,    // половина ширины ствола при scale=1
        cylinderHeight: 1,     // высота от земли при scale=1
    },
    "Tree_2": {
        type: 'cylinder',
        cylinderRadius: 0.3,
        cylinderHeight: 1,
    },
    "Tree_3": {
        type: 'cylinder',
        cylinderRadius: 0.3,
        cylinderHeight: 1.0,
    },
    "Tree_11": {
        type: 'cylinder',
        cylinderRadius: 0.3,
        cylinderHeight: 1.0,
    },
    "Tree_14": {
        type: 'cylinder',
        cylinderRadius: 0.5,
        cylinderHeight: 1.0,
    },
    "Tree_10": {
        type: 'cylinder',
        cylinderRadius: 0.2,
        cylinderHeight: 1.0,
    },
    // Камни — по-прежнему автоматические сферы
};

export function getColliderConfig(modelName: string): ColliderConfig | null {
    const name = modelName.replace(/\.[^/.]+$/, "");
    return config[name] || null;
}