export function getItemColor(item: any): string {
    const id = item?.id || '';
    if (id.includes('ore') || id === 'coal') return '#c87533';
    if (id.includes('bar')) return '#888888';
    if (id.includes('sword') || id.includes('helmet')) return '#44aa44';
    if (id.startsWith('potion_hp')) return '#ff5555';
    return '#55aaff';
}

export function createItemIcon(item: any, size: number = 40): HTMLElement {
    const container = document.createElement('div');
    const bg = getItemColor(item);
    const fontSize = Math.max(10, Math.round(size * 0.4));
    container.style.cssText = `
        width: ${size}px;
        height: ${size}px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        overflow: hidden;
        background: ${bg};
        font-size: ${fontSize}px;
        font-weight: bold;
        color: white;
        text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
        flex-shrink: 0;
        background-size: contain;
        background-position: center;
        background-repeat: no-repeat;
    `;

    const iconPath = item?.icon;
    const firstChar = item?.name?.charAt(0)?.toUpperCase() || '?';

    if (iconPath) {
        // Show text fallback initially; image will replace it on load
        container.textContent = firstChar;
        const img = new Image();
        img.onload = () => {
            container.textContent = '';
            container.style.backgroundImage = `url(${iconPath})`;
        };
        img.onerror = () => {
            // keep text fallback
        };
        img.src = iconPath;
    } else {
        container.textContent = firstChar;
    }
    return container;
}
