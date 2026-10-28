import {renderReferenceCard} from './comment-report.mjs';
import {renderMarkdownReport} from '../vault/resources.mjs';

/** Keep the validated L2 original; HTML is only a static reading representation. */
export function renderReferenceCardDelivery(payload) {
    const markdown = renderReferenceCard(payload);
    const reading = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
    return {markdown, html: renderMarkdownReport(reading, payload.title + ' · 参考洞察卡')};
}
