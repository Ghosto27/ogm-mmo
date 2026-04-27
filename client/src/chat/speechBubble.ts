import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

const bubbles: { [id: string]: CSS2DObject } = {};
const timers: { [id: string]: number } = {};

export function showSpeechBubble(model: THREE.Object3D, text: string, id: string) {
    // Удаляем предыдущее облачко и его таймер
    hideSpeechBubble(id);

    const div = document.createElement('div');
    div.textContent = text;
    div.style.color = 'white';
    div.style.fontFamily = 'Arial, sans-serif';
    div.style.fontSize = '12px';
    div.style.fontWeight = 'bold';
    div.style.textShadow = '1px 1px 2px black';
    div.style.background = 'rgba(0, 0, 0, 0.7)';
    div.style.padding = '4px 8px';
    div.style.borderRadius = '12px';
    div.style.whiteSpace = 'nowrap';
    div.style.pointerEvents = 'none';

    const bubble = new CSS2DObject(div);
    bubble.position.set(0, 2.8, 0);
    bubble.name = 'speechBubble';
    model.add(bubble);
    bubbles[id] = bubble;

    timers[id] = window.setTimeout(() => {
        hideSpeechBubble(id);
    }, 5000);
}

export function hideSpeechBubble(id: string) {
    const bubble = bubbles[id];
    if (bubble) {
        if (bubble.parent) bubble.parent.remove(bubble);
        delete bubbles[id];
    }
    if (timers[id]) {
        clearTimeout(timers[id]);
        delete timers[id];
    }
}