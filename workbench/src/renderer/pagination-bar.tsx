import {useEffect, useRef} from 'react';
import ConfigProvider from '@douyinfe/semi-ui-19/lib/es/configProvider';
import Pagination from '@douyinfe/semi-ui-19/lib/es/pagination';
import './pagination-bar.css';

export function PaginationBar({total, page, pageSize, onPageChange, onPageSizeChange, label = '列表分页', disabled = false}: {total: number; page: number; pageSize: number; onPageChange(page: number): void; onPageSizeChange(pageSize: number): void; label?: string; disabled?: boolean}) {
  const pages = Math.max(1, Math.ceil(total / pageSize)), current = Math.max(1, Math.min(page, pages));
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = nav.current;
    if (!element) return;
    const syncAccessibility = () => {
      element.querySelector('.semi-page-quickjump input')?.setAttribute('aria-label', `${label}：跳至页码`);
      element.querySelector('.semi-page-switch .semi-select')?.setAttribute('aria-label', `${label}：每页数量`);
      element.querySelectorAll<HTMLElement>('.semi-page-item[aria-label]').forEach(item => {
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
  const popupContainer = () => {
    const dialog = nav.current?.closest('dialog');
    if (!dialog) return document.body;
    let host = dialog.querySelector<HTMLDivElement>(':scope > .semi-dialog-popup-host');
    if (!host) {host = document.createElement('div'); host.className = 'semi-dialog-popup-host'; dialog.append(host);}
    return host;
  };
  return <nav ref={nav} onKeyPress={event => {if (event.key === 'Enter') event.preventDefault();}} onKeyDown={event => {if ((event.key === 'Enter' || event.key === ' ') && event.target instanceof HTMLElement && event.target.matches('.semi-page-item[role=button]')) {event.preventDefault(); event.target.click();}}} className={`pagination-bar${pages === 1 ? ' pagination-bar-single' : ''}`} aria-label={label}><span role="status">共 {total} 项 · {total ? (current - 1) * pageSize + 1 : 0}–{Math.min(current * pageSize, total)} 项</span><ConfigProvider getPopupContainer={popupContainer}><Pagination total={total} currentPage={current} pageSize={pageSize} onPageChange={value => {if (!disabled) onPageChange(value);}} disabled={disabled} showSizeChanger pageSizeOpts={[20, 50, 100]} preventPageChangeOnPageSizeChange onPageSizeChange={value => {if (!disabled) {onPageSizeChange(value); onPageChange(1);}}} showQuickJumper={pages > 1} prevText={<span aria-label={`${label}：上一页`}>上一页</span>} nextText={<span aria-label={`${label}：下一页`}>下一页</span>}/></ConfigProvider></nav>;
}
