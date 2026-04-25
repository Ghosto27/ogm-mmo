import * as THREE from 'three';

export class AnimationStateMachine {
    public currentStateName: string | null = null;
    private mixer: THREE.AnimationMixer;
    private actions: Record<string, THREE.AnimationAction>;
    private id: string;

    constructor(mixer: THREE.AnimationMixer, playerActions: Record<string, THREE.AnimationAction>, id: string = 'unknown') {
        this.mixer = mixer;
        this.actions = playerActions;
        this.id = id;
    }

    private log(msg: string, data?: any) {
        console.log(`[FSM ${this.id}] ${msg}`, data || '');
    }

    transitionTo(stateName: string, fadeDuration = 0.2): void {
        this.log(`transitionTo("${stateName}"), current="${this.currentStateName}"`);

        if (this.currentStateName === stateName) {
            this.log(`  -> already in state, skip`);
            return;
        }

        const targetAction = this.actions[stateName];
        if (!targetAction) {
            this.log(`  -> action "${stateName}" not found in`, Object.keys(this.actions));
            return;
        }

        const currentAction = this.currentStateName ? this.actions[this.currentStateName] : null;
        this.log(`  -> currentAction=${!!currentAction}, isRunning=${currentAction?.isRunning()}`);

        // Готовим целевое действие (без сброса, чтобы не сломать кроссфейд)
        targetAction.setLoop(THREE.LoopRepeat, Infinity);
        targetAction.clampWhenFinished = false;

        if (currentAction && currentAction.isRunning() && currentAction !== targetAction) {
            // Запускаем целевое действие с весом 0
            targetAction.play();
            targetAction.weight = 0;
            // Плавный переход
            currentAction.crossFadeTo(targetAction, fadeDuration, false);
            this.log(`  -> crossFadeTo with target weight 0 -> 1`);
        } else {
            targetAction.reset();
            targetAction.play();
            targetAction.weight = 1;
            this.log(`  -> direct play`);
        }

        this.currentStateName = stateName;
        this.log(`  -> state set to "${stateName}"`);
    }

    playOneShot(stateName: string, fadeDuration = 0.1, onFinished?: () => void): void {
        this.log(`playOneShot("${stateName}")`);

        const action = this.actions[stateName];
        if (!action) {
            this.log(`  -> action not found`);
            return;
        }

        if (action.isRunning() && action.loop === THREE.LoopOnce) {
            this.log(`  -> already playing once, skip`);
            return;
        }

        const prevState = this.currentStateName;
        this.currentStateName = null; // сбрасываем, чтобы не мешать

        Object.values(this.actions).forEach(a => {
            if (a && a.isRunning() && a.loop === THREE.LoopRepeat) a.stop();
        });

        action.reset();
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.play();

        const onFinishedLocal = () => {
            this.mixer.removeEventListener('finished', onFinishedLocal);
            this.log(`playOneShot finished: "${stateName}"`);

            if (stateName === 'death') {
                Object.values(this.actions).forEach(a => a?.stop());
                onFinished?.();
            } else {
                if (prevState) {
                    this.transitionTo(prevState, 0.3);
                } else {
                    this.transitionTo('idle', 0.3);
                }
                onFinished?.();
            }
        };
        this.mixer.addEventListener('finished', onFinishedLocal);
    }

    resetToIdle() {
        this.transitionTo('idle');
    }
}