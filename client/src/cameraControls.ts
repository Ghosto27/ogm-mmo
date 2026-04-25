import * as THREE from 'three';
import { camera, renderer } from './scene';

// --- Храним состояние камеры в сферических координатах относительно игрока ---
let minDistance = 2;
let maxDistance = 20;
let theta = Math.PI / 2;    // начинаем строго позади персонажа (вид со спины)
let distance = 12;          // чуть отодвинем для лучшего обзора
let phi = Math.PI / 4;       // вертикальный угол (от 0 до PI)

const rotationSpeed = 0.005; // чувствительность мыши
const zoomSpeed = 0.5;       // скорость зума колёсиком
const targetPosition = new THREE.Vector3(); // позиция игрока (цель)

// Флаги и переменные для управления мышью
export let isRightDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

// --- Привязка событий мыши к элементу рендерера ---
const canvas = renderer.domElement;

// Отключаем стандартное контекстное меню
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('mousedown', (e) => {
    if (e.button === 2) { // ПКМ
        isRightDragging = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    }
});

window.addEventListener('mouseup', (e) => {
    if (e.button === 2) {
        isRightDragging = false;
    }
});

window.addEventListener('mousemove', (e) => {
    if (!isRightDragging) return;

    const deltaX = e.clientX - lastMouseX;
    const deltaY = e.clientY - lastMouseY;

    // Вращение: горизонтальное (влево-вправо) и вертикальное (вверх-вниз)
    theta += deltaX * rotationSpeed;
    phi -= deltaY * rotationSpeed;

    // Ограничиваем вертикальный угол, чтобы камера не переворачивалась
    const EPS = 0.01;
    phi = Math.max(EPS, Math.min(Math.PI - EPS, phi));

    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
});

canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    // Зум колёсиком: изменяем дистанцию
    distance += e.deltaY * 0.01 * zoomSpeed;
    distance = Math.max(minDistance, Math.min(maxDistance, distance));
}, { passive: false });

// --- Установить цель камеры (обычно позиция игрока) ---
export function setCameraTarget(x: number, y: number, z: number) {
    targetPosition.set(x, y, z);
}

// --- Обновление камеры (вызывать каждый кадр) ---
export function updateCamera() {
    // Вычисляем позицию камеры на основе сферических координат и цели
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);

    const offset = new THREE.Vector3(
        distance * sinPhi * cosTheta,
        distance * cosPhi,
        distance * sinPhi * sinTheta
    );

    // Камера всегда смотрит на цель
    const camPos = targetPosition.clone().add(offset);
    camera.position.copy(camPos);
    camera.lookAt(targetPosition);
}