import * as THREE from 'three';

export class AnimationStateMachine {
    public currentStateName: string | null = null;
    private mixer: THREE.AnimationMixer;
    private actions: Record<string, THREE.AnimationAction>;

    constructor(mixer: THREE.AnimationMixer, playerActions: Record<string, THREE.AnimationAction>) {
        this.mixer = mixer;
        this.actions = playerActions;
    }

    transitionTo(stateName: string, fadeDuration = 0.2, onFinished?: () => void): void {
        if (this.currentStateName === stateName) return;

        const targetAction = this.actions[stateName];
        if (!targetAction) return;

        const currentAction = this.currentStateName ? this.actions[this.currentStateName] : null;

        if (currentAction && currentAction.isRunning() && currentAction !== targetAction) {
            // Устанавливаем вес целевого действия в 1 перед кроссфейдом
            targetAction.setEffectiveWeight(1);
            currentAction.crossFadeTo(targetAction, fadeDuration, false);
        } else {
            targetAction.reset().play();
        }

        targetAction.setLoop(THREE.LoopRepeat, Infinity);
        targetAction.clampWhenFinished = false;
        this.currentStateName = stateName;
    }

    playOneShot(stateName: string, fadeDuration = 0.1, onFinished?: () => void): void {
        const action = this.actions[stateName];
        if (!action || (action.isRunning() && action.loop === THREE.LoopOnce)) return;

        // Приостанавливаем циклические действия
        Object.values(this.actions).forEach(a => {
            if (a && a.isRunning() && a.loop === THREE.LoopRepeat) a.paused = true;
        });

        // Если анимация слишком быстрая, можно изменить timeScale
        // if (stateName === 'death') action.timeScale = 0.5; // пример

        action.reset();
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.play();

        const onFinishedLocal = () => {
            this.mixer.removeEventListener('finished', onFinishedLocal);
            if (stateName === 'death') {
                // Полный сброс после смерти
                Object.values(this.actions).forEach(a => a?.stop());
            }
            onFinished?.();
        };
        this.mixer.addEventListener('finished', onFinishedLocal);
    }

    resetToIdle() {
        Object.values(this.actions).forEach(a => a?.stop());
        const idleAction = this.actions['idle'] || this.actions['idle_weapon'] || this.actions['idle_attacking'];
        if (idleAction) {
            idleAction.reset().play();
            this.currentStateName = 'idle';
        }
    }
}