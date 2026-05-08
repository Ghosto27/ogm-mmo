// EditorState.ts – глобальное состояние редактора

let editorActive = false;

export function setEditorActive(active: boolean) {
    editorActive = active;
}

export function isEditorActive(): boolean {
    return editorActive;
}