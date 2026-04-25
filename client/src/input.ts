import * as THREE from 'three';
import { room } from './network';
import { camera } from './scene';
import { otherPlayers } from './player';

// ---------- КЛАВИШИ ----------
const keys: Record<string, boolean> = {};

window.addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup',   (e) => { keys[e.key.toLowerCase()] = false; });

export function getMovementInput(): { x: number; z: number } {
    let x = 0, z = 0;
    if (keys['w'] || keys['arrowup'] || keys['ц'])    z -= 1;
    if (keys['s'] || keys['arrowdown'] || keys['ы'])  z += 1;
    if (keys['a'] || keys['arrowleft'] || keys['ф'])  x -= 1;
    if (keys['d'] || keys['arrowright'] || keys['в']) x += 1;
    if (x !== 0 || z !== 0) {
        const len = Math.sqrt(x * x + z * z);
        x /= len; z /= len;
    }
    return { x, z };
}