import type {ReactNode} from 'react';
import {PaginationBar} from './pagination-bar.tsx';
import {usePagedItems} from './use-paged-items.ts';

/** Compact nested previews omit controls only below the fixed default capacity.
 * Never compare against the selected size: selecting 50 must still allow 20. */
export function PagedItems<T>({items, resetKey, label, children, disabled=false, compact=false}: {
  items:T[]; resetKey:string; label:string; children:(items:T[])=>ReactNode; disabled?:boolean; compact?:boolean;
}) {
  const page=usePagedItems(items,resetKey);
  return <>{children(page.items)}{(!compact||items.length>20)&&<PaginationBar {...page.controls} label={label} disabled={disabled}/>}</>;
}
