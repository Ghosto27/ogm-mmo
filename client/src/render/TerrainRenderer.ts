import * as THREE from 'three';
import { scene } from '../scene';

let terrainMesh: THREE.Mesh | null = null;

export function updateTerrain(terrain: any) {
    if (!terrain) return;

    // Если уже есть меш – удаляем
    if (terrainMesh) {
        scene.remove(terrainMesh);
        terrainMesh = null;
    }

    // Создаём геометрию с нужным количеством сегментов
    const geometry = new THREE.PlaneGeometry(terrain.width, terrain.depth, terrain.segments, terrain.segments);
    // Вращаем плоскость горизонтально (по умолчанию она вертикальна)
    geometry.rotateX(-Math.PI / 2);

    // Загружаем изображение высот и применяем его к вершинам
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
        // Создаём canvas для чтения пикселей
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(image, 0, 0);
        const data = ctx.getImageData(0, 0, image.width, image.height).data;

        const vertices = geometry.attributes.position.array;
        for (let i = 0; i < vertices.length; i += 3) {
            // Получаем UV-координаты текущей вершины
            const uvIndex = Math.floor(i / 3);
            const u = (uvIndex % (terrain.segments + 1)) / terrain.segments;
            const v = Math.floor(uvIndex / (terrain.segments + 1)) / terrain.segments;

            // Вычисляем пиксель на изображении
            const px = Math.floor(u * (image.width - 1));
            const py = Math.floor((1 - v) * (image.height - 1)); // инвертируем V для изображения
            const pixelIndex = (py * image.width + px) * 4;
            const r = data[pixelIndex]; // яркость красного канала (0-255)

            // Масштабируем высоту
            vertices[i + 2] = (r / 255) * terrain.maxHeight; // в PlaneGeometry высота – ось Z после поворота
        }

        geometry.attributes.position.needsUpdate = true;
        geometry.computeVertexNormals();

        // Материал для ландшафта (можно будет заменить текстурой)
        const material = new THREE.MeshStandardMaterial({
            color: 0x3a9d23,
            roughness: 0.8,
            metalness: 0.1,
            flatShading: true
        });

        terrainMesh = new THREE.Mesh(geometry, material);
        terrainMesh.receiveShadow = true;
        scene.add(terrainMesh);
    };
    image.src = terrain.heightmapPath;
}