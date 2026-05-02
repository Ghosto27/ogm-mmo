import * as THREE from 'three';

export function createHpBar(): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 8;
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    const bar = new THREE.Sprite(material);
    bar.scale.set(1.5, 0.15, 1);
    bar.position.y = 0.5;
    return bar;
}

export function updateHpBarSprite(bar: THREE.Sprite, hp: number, maxHp: number) {
    const canvas = (bar.material as THREE.SpriteMaterial).map?.image as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#333';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const percent = hp / maxHp;
    ctx.fillStyle = percent > 0.5 ? '#0f0' : percent > 0.25 ? '#ff0' : '#f00';
    ctx.fillRect(0, 0, canvas.width * percent, canvas.height);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, canvas.width, canvas.height);
    (bar.material as THREE.SpriteMaterial).map!.needsUpdate = true;
}