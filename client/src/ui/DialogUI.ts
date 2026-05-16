import { room, interactionState } from '../network';
import { pushUIMode, popUIMode } from '../cameraControls';

let container: HTMLDivElement;
let textEl: HTMLElement;
let choicesEl: HTMLElement;

export function createDialogUI() {
    container = document.createElement('div');
    container.id = 'dialogue-panel';
    container.style.position = 'absolute';
    container.style.right = '20px';
    container.style.top = '40%';
    container.style.width = '300px';
    container.style.background = 'rgba(0,0,0,0.85)';
    container.style.color = 'white';
    container.style.padding = '16px';
    container.style.borderRadius = '8px';
    container.style.fontFamily = 'Arial, sans-serif';
    container.style.fontSize = '14px';
    container.style.display = 'none';
    container.style.zIndex = '1002';

    textEl = document.createElement('div');
    textEl.style.marginBottom = '12px';
    container.appendChild(textEl);

    choicesEl = document.createElement('div');
    container.appendChild(choicesEl);

    document.body.appendChild(container);
}

export function showDialog(npcId: string, npcName: string, text: string, choices: { text: string; action?: string; questId?: string }[]) {
    const wasHidden = container.style.display === 'none';
    console.log('[DIALOG] showDialog', { npcId, text, choicesCount: choices.length });
    textEl.textContent = `[${npcName}] ${text}`;
    choicesEl.innerHTML = '';
    choices.forEach((choice, index) => {
        const btn = document.createElement('button');
        btn.textContent = choice.text;
        btn.style.display = 'block';
        btn.style.width = '100%';
        btn.style.marginBottom = '6px';
        btn.style.padding = '8px';
        btn.style.background = '#333';
        btn.style.color = 'white';
        btn.style.border = '1px solid #555';
        btn.style.borderRadius = '4px';
        btn.style.cursor = 'pointer';
        btn.addEventListener('click', () => {
            if (!room) return;
            if (choice.action) {
                // Dynamic action (take/complete quest)
                room.send('dialogueChoice', {
                    npcId: interactionState.currentInteractNpcId,
                    action: choice.action,
                    questId: choice.questId,
                });
            } else {
                // Regular static choice – send index
                room.send('dialogueChoice', {
                    npcId: interactionState.currentInteractNpcId,
                    choiceIndex: index,
                });
            }
        });
        choicesEl.appendChild(btn);
    });
    container.style.display = 'block';
    if (wasHidden) pushUIMode();
}

export function hideDialog() {
    const wasVisible = container.style.display !== 'none';
    container.style.display = 'none';
    if (wasVisible) popUIMode();
}