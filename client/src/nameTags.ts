import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import * as THREE from 'three';

// Создаёт HTML-элемент с именем и возвращает CSS2DObject
export function createNameTag(name: string): CSS2DObject {
    const div = document.createElement('div');
    div.textContent = name;
    div.style.color = 'white';
    div.style.fontFamily = 'Arial, sans-serif';
    div.style.fontSize = '12px';
    div.style.fontWeight = 'bold';
    div.style.textShadow = '1px 1px 2px black';
    div.style.background = 'rgba(0, 0, 0, 0.5)';
    div.style.padding = '2px 6px';
    div.style.borderRadius = '4px';
    div.style.pointerEvents = 'none'; // не мешает кликам по сцене

    const label = new CSS2DObject(div);
    label.position.set(0, 3, 0); // высота над моделью (подберём точнее)
    label.name = 'nameTag';
    return label;
}

// Добавляет метку к модели (просто добавляет в children)
export function attachNameTag(model: THREE.Object3D, tag: CSS2DObject) {
    model.add(tag);
}

// Удаляет метку из модели
export function detachNameTag(model: THREE.Object3D) {
    const tag = model.children.find(child => child.name === 'nameTag');
    if (tag) model.remove(tag);
}