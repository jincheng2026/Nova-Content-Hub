import {createElement, Fragment} from 'react';
import type {ReactNode} from 'react';
import './document-markdown.css';

/** Reading only: source strings are never normalized or passed back to the editor. */
export function DocumentMarkdown({text, className = '', title}: {text: string; className?: string; title?:string}) {
    return <div className={`document-markdown ${className}`.trim()}>{blocks(text.split(/\r\n?|\n/), 0, title)}</div>;
}

function safeLink(value: string): string | null {
    if (!/^https?:\/\//i.test(value) || /[\u0000-\u0020\u007f]/.test(value)) return null;
    try {const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? value : null;} catch {return null;}
}

function inline(text: string, depth = 0, links = true): ReactNode[] {
    if (depth > 10) return [text];
    const parts: ReactNode[] = [];
    // No HTML parsing, image fetching, or implicit local-file navigation.
    const tokens = /\\([\\`*_[\]{}()#+.!>|~-])|(?<!`)(`+)(?!`)([\s\S]*?)\2(?!`)|(!?)\[([^\]\n]+)\]\((<?(?:[^\s()]|\([^()]*\))*>?)(?:\s+["'][^\n]*?["'])?\)|(\*\*|__|~~)(?=\S)([^\n]+?)\7|([*_])(?=\S)([^\n]+?)\9|<(https?:\/\/[^<>\s]+)>|https?:\/\/[^\s<>]+/g;
    let previous = 0, match: RegExpExecArray | null;
    while ((match = tokens.exec(text))) {
        if (match.index > previous) parts.push(text.slice(previous, match.index));
        const key = parts.length;
        if (match[1]) parts.push(match[1]);
        else if (match[2]) parts.push(<code key={key}>{match[3].replace(/\n/g, ' ')}</code>);
        else if (match[5]) {
            const destination = match[6].replace(/^<|>$/g, ''), url = links && !match[4] ? safeLink(destination) : null;
            parts.push(url ? <span key={key} className="document-markdown-link">{inline(match[5], depth + 1, false)}（{url}）</span> : <span key={key}>{inline(match[5], depth + 1, false)}（{match[4] ? '图片：' : ''}{destination}）</span>);
        } else if (match[7]) parts.push(createElement(match[7] === '~~' ? 'del' : 'strong', {key}, ...inline(match[8], depth + 1, links)));
        else if (match[9]) parts.push(<em key={key}>{inline(match[10], depth + 1, links)}</em>);
        else {
            const original = match[11] ?? match[0], urlText = original.replace(/[.,;!?，。；！？、]+$/, ''), url = links ? safeLink(urlText) : null;
            parts.push(url ? <span key={key} className="document-markdown-link">{urlText}</span> : urlText);
            if (urlText.length < original.length) parts.push(original.slice(urlText.length));
        }
        previous = tokens.lastIndex;
    }
    if (previous < text.length) parts.push(text.slice(previous));
    return parts;
}

function cells(line: string): string[] {
    const value = line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '');
    const result: string[] = [];
    let current = '', escaped = false, codeFence = '';
    for (let index=0; index<value.length; index++) {
        const character=value[index];
        if (escaped) {current += `\\${character}`; escaped = false; continue;}
        if (character === '\\') {escaped = true; continue;}
        if (character === '`') {
            let end=index+1;while(value[end]==='`')end++;
            const run=value.slice(index,end);if(!codeFence)codeFence=run;else if(codeFence===run)codeFence='';
            current+=run;index=end-1;continue;
        }
        if (character === '|' && !codeFence) {result.push(current.trim()); current = '';} else current += character;
    }
    if (escaped) current += '\\';
    result.push(current.trim()); return result;
}
const listMarker = (line: string) => line.match(/^( *)([-+*]|\d+[.)])\s+(.*)$/);
const fenceMarker = (line: string) => line.match(/^ {0,3}(`{3,}|~{3,})([^\n]*)$/);
const tableDivider = (line: string) => line.includes('|') && cells(line).every(cell => /^:?-{3,}:?$/.test(cell));
function startsBlock(lines: string[], index: number): boolean {
    const line = lines[index];
    return !line.trim() || !!fenceMarker(line) || /^ {0,3}(?:#{1,6}\s|>\s?|(?:\*\s*){3,}$|(?:-\s*){3,}$|(?:_\s*){3,}$)/.test(line) || !!listMarker(line) || index + 1 < lines.length && tableDivider(lines[index + 1]);
}

function blocks(lines: string[], depth = 0, title?:string): ReactNode[] {
    if (depth > 12) return [<pre key="depth">{lines.join('\n')}</pre>];
    const result: ReactNode[] = [], firstContent = lines.findIndex(line=>!!line.trim());
    let index = 0;
    while (index < lines.length) {
        const line = lines[index], key = result.length;
        if (!line.trim()) {index++; continue;}
        const fence = fenceMarker(line);
        if (fence) {
            const code: string[] = []; index++;
            const close = new RegExp(`^ {0,3}${fence[1][0]}{${fence[1].length},}\\s*$`);
            while (index < lines.length && !close.test(lines[index])) code.push(lines[index++]);
            if (index < lines.length) index++;
            result.push(<pre key={key} tabIndex={0}><code>{code.join('\n')}</code></pre>); continue;
        }
        const heading = line.match(/^ {0,3}(#{1,6})\s+(.+?)\s*$/);
        if(heading)heading[2]=heading[2].replace(/\s+#+\s*$/, '');
        if (heading) {if(index!==firstContent||heading[2]!==title)result.push(createElement(`h${heading[1].length}`, {key}, ...inline(heading[2]))); index++; continue;}
        if (index + 1 < lines.length && /^ {0,3}(?:=+|-+)\s*$/.test(lines[index + 1]) && !listMarker(line)) {
            result.push(createElement(lines[index + 1].trim()[0] === '=' ? 'h1' : 'h2', {key}, ...inline(line))); index += 2; continue;
        }
        if (/^ {0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/.test(line)) {result.push(<hr key={key}/>); index++; continue;}
        if (/^ {0,3}>/.test(line)) {
            const quote: string[] = [];
            while (index < lines.length && /^ {0,3}>/.test(lines[index])) quote.push(lines[index++].replace(/^ {0,3}> ?/, ''));
            result.push(<blockquote key={key}>{blocks(quote, depth + 1)}</blockquote>); continue;
        }
        if (index + 1 < lines.length && line.includes('|') && tableDivider(lines[index + 1])) {
            const headings = cells(line), alignment = cells(lines[index + 1]).map(cell => cell.endsWith(':') ? cell.startsWith(':') ? 'center' : 'right' : 'left') as Array<'left'|'center'|'right'>;
            const rows: string[][] = []; index += 2;
            while (index < lines.length && lines[index].includes('|') && !startsBlock(lines,index)) rows.push(cells(lines[index++]));
            const columns = Array.from({length:rows.reduce((width,row)=>Math.max(width,row.length),headings.length)},(_,cellIndex)=>headings[cellIndex]??'');
            result.push(<div key={key} className="document-markdown-table" tabIndex={0} role="region" aria-label="资料表格，可横向滚动"><table><thead><tr>{columns.map((cell, cellIndex) => <th scope="col" key={cellIndex} style={{textAlign: alignment[cellIndex]}}>{inline(cell)}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{columns.map((_, cellIndex) => <td key={cellIndex} style={{textAlign: alignment[cellIndex]}}>{inline(row[cellIndex] ?? '')}</td>)}</tr>)}</tbody></table></div>); continue;
        }
        const marker = listMarker(line);
        if (marker) {
            const ordered = /^\d/.test(marker[2]), indent = marker[1].length, items: ReactNode[] = [];
            while (index < lines.length) {
                const item = listMarker(lines[index]);
                if (!item || item[1].length !== indent || /^\d/.test(item[2]) !== ordered) break;
                const body = [item[3]], contentIndent = item[0].length - item[3].length; index++;
                while (index < lines.length) {
                    const next = lines[index], nextMarker = listMarker(next);
                    if (nextMarker && nextMarker[1].length <= indent) break;
                    if (!next.trim()) {
                        if (index + 1 < lines.length && /^\s/.test(lines[index + 1])) {body.push(''); index++; continue;}
                        break;
                    }
                    const spaces = next.match(/^ */)![0].length;
                    if (spaces <= indent) break;
                    body.push(next.slice(Math.min(spaces, contentIndent))); index++;
                }
                const task = body[0].match(/^\[([ xX])\]\s+(.*)$/);
                if (task) body[0] = task[2];
                items.push(<li key={items.length}>{task && <input type="checkbox" checked={task[1] !== ' '} disabled aria-label={task[1] !== ' ' ? '已完成' : '未完成'}/ >}{blocks(body, depth + 1)}</li>);
                if (!lines[index]?.trim()) {
                    let next = index; while (next < lines.length && !lines[next].trim()) next++;
                    const candidate = listMarker(lines[next] ?? '');
                    if (candidate && candidate[1].length === indent && /^\d/.test(candidate[2]) === ordered) index = next; else break;
                }
            }
            result.push(ordered ? <ol key={key} start={Number.parseInt(marker[2], 10)}>{items}</ol> : <ul key={key}>{items}</ul>); continue;
        }
        const paragraph = [line]; index++;
        while (index < lines.length && !startsBlock(lines, index)) paragraph.push(lines[index++]);
        result.push(<p key={key}>{paragraph.map((value, lineIndex) => <Fragment key={lineIndex}>{lineIndex > 0 && <br/>}{inline(value)}</Fragment>)}</p>);
    }
    return result;
}
