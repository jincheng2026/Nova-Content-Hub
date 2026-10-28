import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require = createRequire(new URL('../package.json', import.meta.url));
const React = require('react'), {renderToStaticMarkup} = require('react-dom/server');
const {rolldown} = await import(require.resolve('rolldown'));
const bundle = await rolldown({input:new URL('../src/renderer/jincheng-stage-actions.tsx',import.meta.url).pathname, external:id => !id.endsWith('/jincheng-stage-actions.tsx')});
const generated = await bundle.generate({format:'cjs'}); await bundle.close();
const module = {exports:{}};
let taskInvocations = 0;
const primitive = tag => ({children, ...props}) => React.createElement(tag, {disabled:props.disabled}, children);
vm.runInNewContext(generated.output.find(item => item.type === 'chunk').code, {module,exports:module.exports,require:id => {
 if (id === 'react' || id === 'react/jsx-runtime') return require(id);
 if (id.endsWith('/button')) return primitive('button');
 if (id.endsWith('/input/textarea')) return primitive('textarea');
 if (id.endsWith('/banner')) return primitive('aside');
 if (id.endsWith('production-dialog.tsx')) return {ProductionDialog:({title,children}) => React.createElement('section',{'aria-label':title,role:'dialog'},children)};
 if (id.endsWith('semi-controls.tsx')) return {PopupSelect:primitive('select')};
 if (id.endsWith('library-panels.tsx')) return {useManagedDraftGuard:() => {}};
 if (id.endsWith('client.ts')) return {invoke:() => {taskInvocations++; throw new Error('Rendering may not start tasks');}};
 return {};
}});
const render = props => renderToStaticMarkup(React.createElement(module.exports.JinchengStageActions,{contentId:'content',actions:['writing'],...props}));

test('the explicit new creation entry opens the existing writing dialog without launching a task', () => {
 const html = render({initialAction:'writing'});
 assert.match(html,/role="dialog"/);
 assert.match(html,/aria-label="共创口播稿"/);
 assert.match(html,/jc-content-writer/);
 assert.match(html,/交给助手继续/);
 assert.equal(taskInvocations,0);
});
test('existing stage menus stay closed until the author chooses a method', () => {
 assert.doesNotMatch(render({}),/role="dialog"/);
 assert.equal(taskInvocations,0);
});
