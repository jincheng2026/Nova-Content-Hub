import type {Page} from './workspace-pages.tsx';

const paths: Record<Page | 'library' | 'settings' | 'research', string> = {
    overview: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
    templates: 'M4 3h16v18H4z M4 9h16 M10 9v12',
    content: 'M5 3h10l4 4v14H5z M14 3v5h5 M9 12h6 M9 16h6',
    calendar: 'M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16 M8 14h2 M14 14h2 M8 17h2',
    prompts: 'M4 4h16v13H9l-5 4z M8 9h8 M8 13h5',
    accounts:'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M4 21v-3a8 5 0 0 1 16 0v3',
    research:'M4 20h16 M7 16v-5 M12 16V7 M17 16V3',
    reports:'M5 3h10l4 4v14H5z M14 3v5h5 M9 11h6 M9 15h6 M9 18h4',
    radar:'M12 3a9 9 0 1 0 9 9 M12 7a5 5 0 1 0 5 5 M12 12l8-8 M11 12h2',
    tasks:'M4 4h16v16H4z M8 8h8 M8 12h8 M8 16h5',
    library: 'M3 7h7l2 2h9v11H3z M3 7V4h7l2 3h7v2',
    settings: 'M10 3h4l.6 2.4 1.8 1 2.4-.7 2 3.5-1.8 1.7v2.2l1.8 1.7-2 3.5-2.4-.7-1.8 1L14 21h-4l-.6-2.4-1.8-1-2.4.7-2-3.5L5 13.1v-2.2L3.2 9.2l2-3.5 2.4.7 1.8-1z M15 12a3 3 0 1 0-6 0 3 3 0 0 0 6 0'
};

export function NavigationIcon({name}: {name: keyof typeof paths}) {
    return <svg className="nav-symbol" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name]}/></svg>;
}
