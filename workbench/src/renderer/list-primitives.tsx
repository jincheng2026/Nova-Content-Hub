import type {ReactNode, Ref} from 'react';
import Input from '@douyinfe/semi-ui-19/lib/es/input';
import Table from '@douyinfe/semi-ui-19/lib/es/table';
import type {TableProps} from '@douyinfe/semi-ui-19/lib/es/table/interface';
import List from '@douyinfe/semi-ui-19/lib/es/list';
import {PaginationBar} from './pagination-bar.tsx';
import './list-primitives.css';

export function ListToolbar({search, children, actions, className = ''}: {search?: {label: string; placeholder?: string; value: string; change(value: string): void; disabled?: boolean; inputRef?: Ref<HTMLInputElement>}; children?: ReactNode; actions?: ReactNode; className?: string}) {
  return <div className={`list-toolbar ${className}`}>{search && <Input ref={search.inputRef} className="list-toolbar-search" type="search" aria-label={search.label} placeholder={search.placeholder ?? search.label} value={search.value} disabled={search.disabled} onEnterPress={event => event.preventDefault()} onChange={search.change}/>}<div className="list-toolbar-filters">{children}</div>{actions && <div className="management-actions list-toolbar-actions">{actions}</div>}</div>;
}

type DataTableProps<T extends object> = Pick<TableProps<T>, 'columns' | 'rowKey' | 'empty' | 'onRow' | 'showHeader' | 'rowSelection' | 'expandedRowKeys' | 'expandedRowRender' | 'onExpand' | 'hideExpandedColumn' | 'scroll'> & {rows: T[]; total: number; page: number; pageSize: number; onPageChange(page: number): void; onPageSizeChange(pageSize: number): void; label: string; className?: string; disabled?: boolean; id?: string};
export function DataTable<T extends object>({rows, total, page, pageSize, onPageChange, onPageSizeChange, label, className = '', disabled, id, ...table}: DataTableProps<T>) {
  return <div className={`data-table ${className}`} id={id}><div className="data-table-scroll"><Table<T> {...table} expandIcon={table.hideExpandedColumn ? false : undefined} rowKey={table.rowKey ?? 'id'} dataSource={rows} pagination={false} size="small" keepDOM={false}/></div><PaginationBar total={total} page={page} pageSize={pageSize} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} label={label} disabled={disabled}/></div>;
}

export function ImageList({children, className = ''}: {children: ReactNode; className?: string}) {
  return <List className={`image-list ${className}`} split={false}>{children}</List>;
}
export {List};
