// debugState.ts — лёгкий модуль без зависимостей от main

let showCollisionDebug = false;

export function isCollisionDebugVisible(): boolean {
    return showCollisionDebug;
}

export function toggleCollisionDebug(): boolean {
    showCollisionDebug = !showCollisionDebug;
    console.log(`Collision debug: ${showCollisionDebug ? 'ON' : 'OFF'}`);
    return showCollisionDebug;
}