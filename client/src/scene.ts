import * as THREE from 'three';

// Создаём сцену
export const scene = new THREE.Scene();
(window as any).scene = scene;
scene.background = new THREE.Color(0x87CEEB); // небесно-голубой

// Камера
export const camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);
camera.position.set(0, 6, 5);
camera.lookAt(0, 0, 0);

// Рендерер
export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace; // ← вот ключевая строка!
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.getElementById('app')!.appendChild(renderer.domElement);

// Освещение
scene.add(new THREE.AmbientLight(0xffffff, 1.5));
const dirLight = new THREE.DirectionalLight(0xffffff, 2.9);
dirLight.position.set(10, 20, 5);
scene.add(dirLight);

// Пол (зелёная плоскость)
/* const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: 0x3a9d23 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.5;
scene.add(floor); */

// Вспомогательная сетка
/* const grid = new THREE.GridHelper(200, 200, 0x000000, 0x333333);
grid.position.y = -0.49;
scene.add(grid); */

// Реакция на изменение размера окна
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});