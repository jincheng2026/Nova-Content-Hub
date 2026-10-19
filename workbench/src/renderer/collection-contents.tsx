import {useMemo, useState} from 'react';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import type {Content, DesktopResults} from '../shared/contracts.ts';
import type {WorkspaceLibraryCollection} from '../shared/workspace-contracts.ts';
import {ContentList} from './content-list.tsx';
import {CollectionEditor, MembersEditor, useWorkspaceMutation, type WorkspaceManagementProps} from './library-panels.tsx';

export function CollectionContents({collection, unavailable = false, workspace, props, query, setQuery, back, open}: {
    collection: WorkspaceLibraryCollection; workspace: DesktopResults['readWorkspace'] | null; props: WorkspaceManagementProps;
    unavailable?: boolean;
    query: string; setQuery(value: string): void; back(): void; open(item: Content, generate?: boolean): void;
}) {
    const [editor, setEditor] = useState<{kind: 'name' | 'members'; collection: WorkspaceLibraryCollection} | null>(null);
    const {mutate, notice} = useWorkspaceMutation(props);
    const members = useMemo(() => {const index = new Map(workspace?.contents.map(item => [item.id, item]) ?? []); return collection.memberIds.map(id => index.get(id)).filter(item => item !== undefined).filter(item => !item.deletedAt);}, [workspace, collection.memberIds]);
    return <section className="collection-contents" aria-label="合集内容列表" data-collection-id={collection.id} data-collection-state={unavailable ? 'unavailable' : 'available'}>
        <button className="back-to-contents" disabled={props.busy} onClick={back}>← 返回全部内容</button>
        {unavailable && <p className="danger-note" role="alert">此合集已被回收或暂时无法读取，页面保留上次读取的内容。未保存的填写仍保留，可复制名称；请明确关闭并放弃填写后返回，原内容不会删除。</p>}
        <ContentList contents={members} workspace={workspace} library={props.library} collection={collection} query={query} setQuery={setQuery} view="active" busy={props.busy || unavailable || editor !== null} blocked={props.busy || unavailable} ready={true} changeView={() => {}} open={open} recycle={item => {if (!unavailable) void mutate({op: 'setCollectionMembers', id: collection.id, editToken: collection.editToken, memberIds: collection.memberIds.filter(id => id !== item.id)});}} collectionActions={<>
            <Button id="manage-collection-members" disabled={props.busy || unavailable || editor !== null} onClick={() => setEditor({kind: 'members', collection})}>管理内容</Button>
            <Button id="rename-collection" disabled={props.busy || unavailable || editor !== null} onClick={() => setEditor({kind: 'name', collection})}>重命名</Button>
            <Button id="trash-collection" disabled={props.busy || unavailable || editor !== null} onClick={() => {if (!unavailable) void mutate({op: 'trashCollection', id: collection.id, editToken: collection.editToken}, back);}}>回收合集</Button>
        </>}/>
        <p role="status">{notice}</p>
        {editor?.kind === 'name' && <CollectionEditor collection={editor.collection} unavailable={unavailable} props={props} close={() => setEditor(null)}/>}
        {editor?.kind === 'members' && <MembersEditor collection={editor.collection} unavailable={unavailable} props={props} close={() => setEditor(null)}/>}
    </section>;
}
