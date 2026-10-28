import {useState} from 'react';
import type {DesktopResults} from '../shared/contracts.ts';
import type {WorkspaceLibrarySnapshot} from '../shared/workspace-contracts.ts';
import './collection-preview.css';

export function CollectionPreview({memberIds, workspace, library}: {memberIds: string[]; workspace: DesktopResults['readWorkspace'] | null; library: WorkspaceLibrarySnapshot | null}) {
    const [failed, setFailed] = useState<string[]>([]);
    const members = new Map(workspace?.contents.map(item => [item.id, item]));
    const details = new Map(library?.contentDetails.map(item => [item.id, item]));
    const urls: string[] = [];
    for (const id of memberIds) {
        const member = members.get(id), detail = details.get(id);
        if (!member || member.deletedAt || !detail || detail.deletedAt) continue;
        const url = detail.candidates.find(candidate => candidate.id === member.selectedCandidateId)?.url;
        if (url && !failed.includes(url) && !urls.includes(url)) urls.push(url);
        if (urls.length === 2) break;
    }
    return <span className="collection-preview" data-images={urls.length} aria-hidden="true">{urls.length ? urls.map(url => <span className="collection-preview-sheet" key={url}><img src={url} alt="" loading="eager" onError={() => setFailed(previous => [...previous, url])}/></span>) : <span className="collection-preview-empty">▤</span>}</span>;
}
