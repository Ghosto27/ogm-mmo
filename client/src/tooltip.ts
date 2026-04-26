let tooltipElement: HTMLDivElement | null = null;

export function showTooltip(x: number, y: number, item: any) {
    hideTooltip();
    
    tooltipElement = document.createElement('div');
    tooltipElement.style.position = 'fixed';
    tooltipElement.style.left = (x + 15) + 'px';
    tooltipElement.style.top = (y + 15) + 'px';
    tooltipElement.style.background = 'rgba(0, 0, 0, 0.9)';
    tooltipElement.style.color = '#fff';
    tooltipElement.style.padding = '6px 10px';
    tooltipElement.style.borderRadius = '4px';
    tooltipElement.style.fontSize = '12px';
    tooltipElement.style.zIndex = '3000';
    tooltipElement.style.pointerEvents = 'none';
    tooltipElement.innerHTML = `
        <strong>${item.name}</strong><br>
        <span style="color: #ccc;">${item.description}</span>
    `;
    document.body.appendChild(tooltipElement);
}

export function hideTooltip() {
    if (tooltipElement) {
        document.body.removeChild(tooltipElement);
        tooltipElement = null;
    }
}