import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import * as THREE from 'three';
import { scene } from './scene';

/**
 * Create and animate a floating damage number at a given 3D position.
 * The number floats upward and fades out over ~1 second.
 */
export function showFloatingDamage(
    position: THREE.Vector3,
    damage: number,
    isCrit: boolean = false,
    isHeal: boolean = false
) {
    const div = document.createElement('div');
    div.textContent = isHeal ? `+${damage}` : `-${damage}`;

    // Style based on type
    if (isHeal) {
        div.style.color = '#44ff44';
        div.style.fontSize = '18px';
        div.style.fontWeight = 'bold';
        div.style.textShadow = '1px 1px 3px rgba(0,0,0,0.8)';
    } else if (isCrit) {
        div.textContent = `CRIT! -${damage}`;
        div.style.color = '#ff4444';
        div.style.fontSize = '28px';
        div.style.fontWeight = '900';
        div.style.textShadow = '2px 2px 4px rgba(0,0,0,0.9), 0 0 10px rgba(255,50,50,0.5)';
        div.style.fontFamily = 'Arial, sans-serif';
    } else {
        div.style.color = '#ffaa00';
        div.style.fontSize = '20px';
        div.style.fontWeight = 'bold';
        div.style.textShadow = '1px 1px 3px rgba(0,0,0,0.8)';
    }

    div.style.fontFamily = 'Arial, sans-serif';
    div.style.pointerEvents = 'none';
    div.style.whiteSpace = 'nowrap';

    const label = new CSS2DObject(div);
    label.position.copy(position);
    label.position.y += 1.5; // above target

    // Add a small random horizontal offset so numbers don't stack exactly
    label.position.x += (Math.random() - 0.5) * 0.5;
    label.position.z += (Math.random() - 0.5) * 0.5;

    scene.add(label);

    // Animate: float up and fade out over ~1 second
    const startY = label.position.y;
    const duration = isCrit ? 1200 : 900;
    const startTime = performance.now();
    let animFrameId: number;

    function animateDamage() {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Float upward
        label.position.y = startY + progress * 1.8;

        // Fade out
        label.element.style.opacity = String(1 - progress);

        if (progress < 1) {
            animFrameId = requestAnimationFrame(animateDamage);
        } else {
            scene.remove(label);
            if (label.element.parentNode) {
                label.element.parentNode.removeChild(label.element);
            }
        }
    }

    // Slight delay before starting to fade (stay visible briefly)
    setTimeout(() => {
        animateDamage();
    }, 100);
}
