export function getItemColor(item: any): string {
    const id = item?.id || '';
    if (id.includes('ore') || id === 'coal') return '#c87533';
    if (id.includes('bar')) return '#888888';
    if (id.includes('sword') || id.includes('helmet')) return '#44aa44';
    if (id === 'potion_hp_01') return '#ff5555';
    return '#55aaff';
}
