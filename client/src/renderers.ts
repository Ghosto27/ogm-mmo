import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import * as THREE from 'three';

// Создаём один экземпляр CSS2DRenderer
export const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0px';
labelRenderer.domElement.style.pointerEvents = 'none'; // чтобы метки не перехватывали клики
document.body.appendChild(labelRenderer.domElement);

// Экспортируем функцию для вызова в игровом цикле
export function renderLabels(scene: THREE.Scene, camera: THREE.Camera) {
    labelRenderer.render(scene, camera);
}
window.addEventListener('resize', () => {
    labelRenderer.setSize(window.innerWidth, window.innerHeight);
});