import {useEffect, useRef, useState} from 'react';

/** Page the filtered, ordered collection; refreshes keep the current position. */
export function usePagedItems<T>(rows: T[], resetKey: string) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const previousKey = useRef(resetKey);
  useEffect(() => {
    if (previousKey.current !== resetKey) {
      previousKey.current = resetKey;
      setPage(1);
    }
  }, [resetKey]);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages);
  return {
    items: rows.slice((current - 1) * pageSize, current * pageSize),
    controls: {
      total: rows.length,
      page: current,
      pageSize,
      onPageChange: (value: number) => {if (Number.isFinite(value)) setPage(Math.max(1, Math.min(pages, Math.floor(value))));},
      onPageSizeChange: (value: number) => {if ([20, 50, 100].includes(value)) {setPageSize(value); setPage(1);}},
    },
  };
}
