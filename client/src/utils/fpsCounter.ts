let fps = 0;
let lastTime = performance.now();
let frameCount = 0;

// Создаём элемент для отображения FPS
const fpsElement = document.createElement('div');
fpsElement.style.position = 'absolute';
fpsElement.style.top = '450px'; // под панелью игрока
fpsElement.style.left = '20px';
fpsElement.style.color = 'lime';
fpsElement.style.fontFamily = 'monospace';
fpsElement.style.fontSize = '14px';
fpsElement.style.zIndex = '9999';
fpsElement.style.background = 'rgba(0,0,0,0.5)';
fpsElement.style.padding = '2px 6px';
fpsElement.style.borderRadius = '4px';
document.body.appendChild(fpsElement);

export function updateFPS() {
    frameCount++;
    const now = performance.now();
    const delta = now - lastTime;

    if (delta >= 1000) {
        fps = Math.round((frameCount * 1000) / delta);
        fpsElement.textContent = `FPS: ${fps}`;
        lastTime = now;
        frameCount = 0;
    }
}