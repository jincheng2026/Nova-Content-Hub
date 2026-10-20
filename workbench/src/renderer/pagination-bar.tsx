import {useEffect, useRef} from 'react';
import Pagination from '@douyinfe/semi-ui-19/lib/es/pagination';
import './pagination-bar.css';

export function PaginationBar({total, page, pageSize, onPageChange, label = '列表分页', disabled = false}: {total: number; page: number; pageSize: number; onPageChange(page: number): void; label?: string; disabled?: boolean}) {
  const pages = Math.max(1, Math.ceil(total / pageSize)), current = Math.max(1, Math.min(page, pages));
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = nav.current;
    if (!element) return;
    const syncAccessibility = () => {
      element.querySelector('input')?.setAttribute('aria-label', `${label}：跳至页码`);
      element.querySelectorAll<HTMLElement>('li[aria-label]').forEach(item => {
        const unavailable = disabled || item.classList.contains('semi-page-prev') && current === 1 || item.classList.contains('semi-page-next') && current === pages;
        item.setAttribute('role', 'button');
        item.setAttribute('aria-disabled', String(unavailable));
        item.tabIndex = unavailable ? -1 : 0;
      });
    };
    // Semi adds its numeric items after mount and replaces them after page changes.
    const observer = new MutationObserver(syncAccessibility);
    observer.observe(element, {childList: true, subtree: true});
    syncAccessibility();
    return () => observer.disconnect();
  }, [total, current, pages, disabled, label]);
  return <nav ref={nav} onKeyPress={event => {if (event.key === 'Enter') event.preventDefault();}} onKeyDown={event => {if ((event.key === 'Enter' || event.key === ' ') && event.target instanceof HTMLElement && event.target.matches('li[role=button]')) {event.preventDefault(); event.target.click();}}} className="pagination-bar" aria-label={label}><span role="status">共 {total} 项 · {total ? (current - 1) * pageSize + 1 : 0}–{Math.min(current * pageSize, total)} 项</span>{pages > 1 && <Pagination total={total} currentPage={current} pageSize={pageSize} onPageChange={value => {if (!disabled) onPageChange(value);}} disabled={disabled} showQuickJumper prevText={<span aria-label={`${label}：上一页`}>上一页</span>} nextText={<span aria-label={`${label}：下一页`}>下一页</span>}/>}</nav>;
}
