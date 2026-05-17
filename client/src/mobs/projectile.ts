import * as THREE from 'three';

interface Projectile {
    mesh: THREE.Mesh;
    startPos: THREE.Vector3;
    endPos: THREE.Vector3;
    startTime: number;
    duration: number;
}

const activeProjectiles: Projectile[] = [];
let projectileScene: THREE.Scene | null = null;

export function setProjectileScene(scene: THREE.Scene) {
    projectileScene = scene;
}

/**
 * Spawn a bone projectile with accuracy spread.
 * @param accuracy 0-1, chance to hit the target exactly. Default 0.6 (60%).
 *   On miss, the projectile deviates 2-3 units in random direction.
 */
export function spawnBoneProjectile(
    startX: number, startZ: number,
    endX: number, endZ: number,
    accuracy: number = 0.6
) {
    if (!projectileScene) return;

    // Apply accuracy spread
    let actualEndX = endX;
    let actualEndZ = endZ;

    if (Math.random() > accuracy) {
        // Miss! Random offset ~2-3 units in a random direction
        const missAngle = Math.random() * Math.PI * 2;
        const missDist = 2 + Math.random() * 1.5;
        actualEndX += Math.cos(missAngle) * missDist;
        actualEndZ += Math.sin(missAngle) * missDist;
    }

    // Elongated box geometry to look like a bone
    const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.3);
    const material = new THREE.MeshToonMaterial({ color: 0xcccccc });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(startX, 1.5, startZ);

    // Rotate towards actual target direction (even if spread changed it)
    const angle = Math.atan2(actualEndZ - startZ, actualEndX - startX);
    mesh.rotation.set(0, 0, angle);

    projectileScene.add(mesh);

    activeProjectiles.push({
        mesh,
        startPos: new THREE.Vector3(startX, 1.5, startZ),
        endPos: new THREE.Vector3(actualEndX, 1.5, actualEndZ),
        startTime: performance.now(),
        duration: 600, // ms
    });
}

export function updateProjectiles(deltaTime: number) {
    const now = performance.now();
    for (let i = activeProjectiles.length - 1; i >= 0; i--) {
        const p = activeProjectiles[i];
        const elapsed = now - p.startTime;
        const t = Math.min(elapsed / p.duration, 1.0);

        // Linear interpolation + arc (parabolic trajectory)
        p.mesh.position.lerpVectors(p.startPos, p.endPos, t);
        p.mesh.position.y += Math.sin(t * Math.PI) * 0.5; // arc height

        // Tumbling rotation
        p.mesh.rotation.x += 0.1;

        if (t >= 1.0) {
            projectileScene!.remove(p.mesh);
            p.mesh.geometry.dispose();
            (p.mesh.material as THREE.Material).dispose();
            activeProjectiles.splice(i, 1);
        }
    }
}
