import test from 'node:test';
import assert from 'node:assert/strict';
import {applicationMenu} from '../src/main/application-menu.mts';

function items(menu) {
    return menu.flatMap(item => [item, ...items(item.submenu ?? [])]);
}

test('Chinese macOS menu retains native editing, window and application roles', () => {
    const menu = applicationMenu('darwin', '自媒体工作台');
    assert.deepEqual(menu.map(item => item.label), ['自媒体工作台', '文件', '编辑', '显示', '窗口']);
    const all = items(menu);
    for (const role of ['about', 'services', 'hide', 'hideOthers', 'unhide', 'quit', 'undo', 'redo', 'cut', 'copy', 'paste', 'selectAll', 'close', 'minimize', 'togglefullscreen', 'front']) {
        const item = all.find(item => item.role === role);
        assert.ok(item, `missing native ${role} behavior`);
        assert.match(item.label, /[\u4e00-\u9fff]/);
        assert.equal(item.click, undefined, `${role} must use Electron's native behavior and shortcuts`);
    }
    assert.equal(all.some(item => item.role === 'help'), false);
    assert.equal(all.some(item => ['reload', 'forceReload', 'toggleDevTools'].includes(item.role)), false);
});

test('Windows and Linux keep editing and exit without macOS application actions', () => {
    for (const platform of ['win32', 'linux']) {
        const menu = applicationMenu(platform, '自媒体工作台'), all = items(menu);
        assert.equal(menu[0].label, '文件');
        assert.equal(all.filter(item => item.role === 'quit').length, 1);
        assert.ok(all.some(item => item.role === 'copy'));
        assert.ok(all.some(item => item.role === 'about'));
        assert.equal(all.some(item => ['hide', 'hideOthers', 'unhide', 'services', 'front'].includes(item.role)), false);
    }
});
