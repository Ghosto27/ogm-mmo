let selectedTargetId: string | null = null;

export function setSelectedTarget(id: string | null) {
    selectedTargetId = id;
}

export function getSelectedTarget(): string | null {
    return selectedTargetId;
}