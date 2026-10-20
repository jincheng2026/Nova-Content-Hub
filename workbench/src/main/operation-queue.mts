export function createOperationQueue() {
    const foreground: (() => Promise<void>)[] = [], background: (() => Promise<void>)[] = [];
    let running = false, closed = false;
    let finish!: () => void;
    const drained = new Promise<void>(resolve => { finish = resolve; });
    const next = () => {
        const operation = foreground.shift() ?? background.shift();
        if (operation) void operation().then(next);
        else {
            running = false;
            if (closed) finish();
        }
    };
    const run = <T,>(operation: () => T | PromiseLike<T>, priority: 'foreground' | 'background' = 'foreground'): Promise<T> =>
        new Promise<T>((resolve, reject) => {
            if (closed) { reject(Object.assign(new Error('应用正在关闭，任务将在下次启动时核验。'), {code: 'WORKER_STOPPED'})); return; }
            (priority === 'background' ? background : foreground).push(() => Promise.resolve().then(operation).then(resolve, reject));
            if (!running) {
                running = true;
                next();
            }
        });
    return Object.assign(run, {close() {
        closed = true;
        if (!running) finish();
        return drained;
    }});
}
