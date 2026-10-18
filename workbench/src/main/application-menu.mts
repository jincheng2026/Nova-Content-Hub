import type {MenuItemConstructorOptions} from 'electron';

export function applicationMenu(platform: NodeJS.Platform, name: string): MenuItemConstructorOptions[] {
    const mac = platform === 'darwin';
    return [
        ...(mac ? [{label: name, submenu: [
            {label: `关于${name}`, role: 'about'},
            {type: 'separator'},
            {label: '服务', role: 'services'},
            {type: 'separator'},
            {label: `隐藏${name}`, role: 'hide'},
            {label: '隐藏其他应用', role: 'hideOthers'},
            {label: '显示全部', role: 'unhide'},
            {type: 'separator'},
            {label: `退出${name}`, role: 'quit'}
        ]} satisfies MenuItemConstructorOptions] : []),
        {label: '文件', submenu: [
            {label: '关闭窗口', role: 'close'},
            ...(!mac ? [{type: 'separator'}, {label: '退出', role: 'quit'}] as MenuItemConstructorOptions[] : [])
        ]},
        {label: '编辑', submenu: [
            {label: '撤销', role: 'undo'},
            {label: '重做', role: 'redo'},
            {type: 'separator'},
            {label: '剪切', role: 'cut'},
            {label: '复制', role: 'copy'},
            {label: '粘贴', role: 'paste'},
            {label: '粘贴并匹配样式', role: 'pasteAndMatchStyle'},
            {label: '删除', role: 'delete'},
            {label: '全选', role: 'selectAll'}
        ]},
        {label: '显示', submenu: [
            {label: '实际大小', role: 'resetZoom'},
            {label: '放大', role: 'zoomIn'},
            {label: '缩小', role: 'zoomOut'},
            {type: 'separator'},
            {label: '切换全屏', role: 'togglefullscreen'}
        ]},
        {label: '窗口', role: 'windowMenu', submenu: [
            {label: '最小化', role: 'minimize'},
            {label: '缩放窗口', role: 'zoom'},
            ...(mac ? [{type: 'separator'}, {label: '前置全部窗口', role: 'front'}] as MenuItemConstructorOptions[] : [])
        ]},
        ...(!mac ? [{label: '关于', submenu: [{label: `关于${name}`, role: 'about'}]} satisfies MenuItemConstructorOptions] : [])
    ];
}
