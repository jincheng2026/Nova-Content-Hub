export function createOperationQueue() {
    let tail = Promise.resolve();
    return <T,>(operation: () => T | Promise<T>): Promise<T> => {
        const next = tail.then(operation);
        tail = next.then(() => {}, () => {});
        return next;
    };
}
