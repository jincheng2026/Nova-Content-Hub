/** A source-stage marker is useful navigation, but never a platform publication receipt. */
export function contentDirectoryCategory(input: {
    hasPublication: boolean;
    stage?: string;
    body: string;
    analysis?: string;
    narrative?: string;
    hasCreation: boolean;
    running: boolean;
}): 'topics'|'doing'|'published' {
    if (input.hasPublication || input.stage === 'published') return 'published';
    return !input.hasCreation || !input.body.trim() && !input.analysis?.trim() && !input.narrative?.trim() && !input.running ? 'topics' : 'doing';
}
