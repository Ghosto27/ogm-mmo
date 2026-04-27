import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import * as THREE from 'three';

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
    div.style.pointerEvents = 'none';

    const label = new CSS2DObject(div);
    label.position.set(0, 3.2, 0);
    label.name = 'nameTag';
    return label;
}

export function attachNameTag(model: THREE.Object3D, tag: CSS2DObject) {
    model.add(tag);
}

export function removeNameTag(model: THREE.Object3D) {
    const tag = model.getObjectByName('nameTag') as CSS2DObject | undefined;
    if (tag) {
        // Удаляем из родителя (модели)
        model.remove(tag);
        // Принудительно удаляем DOM-элемент из labelRenderer
        if (tag.element && tag.element.parentNode) {
            tag.element.parentNode.removeChild(tag.element);
        }
    }
}