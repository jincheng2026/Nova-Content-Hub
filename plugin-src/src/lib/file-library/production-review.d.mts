import type {ProductionSuggestion} from './production.js';
export function quotePosition(body: string, quote: string): number;
export function reviewBodyHash(body: string): Promise<string>;
export function acceptReviewSuggestion(input: {body: string; suggestions: ProductionSuggestion[]; id: string}): Promise<{body: string; suggestions: ProductionSuggestion[]}>;
export function reviewParagraphs<T extends {id: string; quote: string}>(body: string, entries: T[]): {start: number; text: string; items: (T & {start: number})[]; parts: {text: string; ids: string[]}[]}[];
