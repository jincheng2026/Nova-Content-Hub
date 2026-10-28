/** Read only a previously validated frozen cover request. This does not claim,
 * generate, submit, mutate a request, or resolve paths outside request inputs.
 * The caller still verifies requestHash/attempt through the existing protocol.
 */
export function resolveCoverMethodRuntimeContext(request, {requiresIdentity = true} = {}) {
    if (!request || request.format !== 'nova-cover-request' || ![1, 2, 3].includes(request.schemaVersion) || typeof request.requestId !== 'string' || !/^[a-f0-9]{64}$/.test(request.requestHash) || !Array.isArray(request.inputs)) throw Error('Require a validated frozen cover request');
    const photo = request.photo;
    const ownInputs = request.inputs.filter(input => input.role === 'own-photo');
    if (ownInputs.length > 1) throw Error('Ambiguous frozen request identity');
    const selected = photo && typeof photo.id === 'string' && /^[a-f0-9]{64}$/.test(photo.assetHash) && ownInputs.length === 1 && ownInputs[0].assetHash === photo.assetHash && ownInputs[0].photoId === photo.id;
    const identity = selected ? {id:photo.id, assetHash:photo.assetHash} : null;
    return {
        status:requiresIdentity && !identity ? 'waiting-user' : 'ready',
        ...(requiresIdentity && !identity ? {reason:'当前请求没有匹配的本人照片；请在工作台补充并重新冻结请求。'} : {}),
        identity,
        // A host may choose its available tool when no model is frozen. This is
        // not permission to adopt the historical author's model or preferences.
        model:null,
        modelSource:'host-capability-not-frozen-in-cover-request',
        ratio:request.ratio, pixels:request.pixels, count:request.count,
        outputFormat:request.outputFormat, prompt:request.prompt,
        templateDefinition:request.templateDefinition ?? null
    };
}
