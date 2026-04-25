import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { ToonShader1 } from 'three/examples/jsm/shaders/ToonShader.js';
import { scene, camera, renderer } from './scene';

// 1. Настраиваем цветовое пространство рендерера (важно!)
renderer.outputColorSpace = THREE.SRGBColorSpace;

export const composer = new EffectComposer(renderer);
composer.setSize(window.innerWidth, window.innerHeight);

const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// 2. Используем ToonShader1
const toonPass = new ShaderPass(ToonShader1);
toonPass.uniforms['uDirLightPos'].value = new THREE.Vector3(10, 20, 5);
toonPass.uniforms['uDirLightColor'].value = new THREE.Color(0xffffff);
toonPass.uniforms['uAmbientLightColor'].value = new THREE.Color(0x606060);
//composer.addPass(toonPass);


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