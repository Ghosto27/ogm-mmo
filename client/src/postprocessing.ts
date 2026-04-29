import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { scene, camera, renderer } from './scene';

// 1. Настраиваем цветовое пространство рендерера (важно!)
renderer.outputColorSpace = THREE.SRGBColorSpace;

export const composer = new EffectComposer(renderer);
composer.setSize(window.innerWidth, window.innerHeight);

const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// Наш кастомный шейдер для toon
const toonColorPass = new ShaderPass({
    uniforms: {
        tDiffuse: { value: null },
        levels: { value: 9.0 } // Чем меньше число, тем более "мультяшным" будет эффект
    },
    vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform sampler2D tDiffuse;
        uniform float levels;
        void main() {
            vec4 color = texture2D(tDiffuse, vUv);
            // Волшебная формула: уменьшаем количество цветов
            color.rgb = floor(color.rgb * levels) / levels;
            gl_FragColor = color;
        }
    `
});
composer.addPass(toonColorPass);

// Обводка
export const outlinePass = new OutlinePass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    scene,
    camera
);
outlinePass.edgeStrength = 3.0;
outlinePass.edgeGlow = 0.0;
outlinePass.edgeThickness = 1.0;
outlinePass.pulsePeriod = 0;
outlinePass.visibleEdgeColor.set('#000000');
outlinePass.hiddenEdgeColor.set('#000000');
composer.addPass(outlinePass);

window.addEventListener('resize', () => {
    composer.setSize(window.innerWidth, window.innerHeight);
});