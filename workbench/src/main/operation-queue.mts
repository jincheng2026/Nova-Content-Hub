export function createOperationQueue() {
    const foreground: (() => Promise<void>)[] = [], background: (() => Promise<void>)[] = [];
    let running = false;
    const next = () => {
        const operation = foreground.shift() ?? background.shift();
        if (operation) void operation().then(next);
        else running = false;
    };
    return <T,>(operation: () => T | PromiseLike<T>, priority: 'foreground' | 'background' = 'foreground'): Promise<T> =>
        new Promise<T>((resolve, reject) => {
            (priority === 'background' ? background : foreground).push(() => Promise.resolve().then(operation).then(resolve, reject));
            if (!running) {
                running = true;
                next();
            }
        });
}
