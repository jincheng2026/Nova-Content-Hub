import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {runtimeMethodSourceFilter} from '../scripts/method-runtime-distribution.mjs';
import {businessSkillRegistry, businessSkillNames, productionSkillNames, allSkillNames, integrityPaths, skillCapabilities, validateSkills, resolveSkillReference} from '../scripts/build.mjs';

const source=fileURLToPath(new URL('../',import.meta.url));
const root=path.resolve(source,'..');

test('Skill reference mapping uses package paths on both POSIX and Windows filesystems',()=>{
    for(const [paths,repoRoot] of [[path.posix,'/repo'],[path.win32,'C:\\repo']]){
        const sourceRoot=paths.join(repoRoot,'plugin-src');
        const cases=[
            ['xindao-interview','SKILL.md','../../plugin-src/resources/business-skills-contract.md','plugin-src/resources/business-skills-contract.md',null],
            ['xindao-interview','SKILL.md','references/method.md','plugin-src/skills/xindao-interview/references/method.md',null],
            ['xindao-interview','references/method.md','checkpoint-templates.md','plugin-src/skills/xindao-interview/references/checkpoint-templates.md',null],
            ['nova-content-template-study','SKILL.md','references/contract.md','plugin-src/skills/nova-content-template-study/references/contract.md','plugin-src/references/contract.md'],
            ['nova-content-template-study','SKILL.md','schemas/template-design.schema.json','plugin-src/skills/nova-content-template-study/schemas/template-design.schema.json','plugin-src/schemas/template-design.schema.json'],
        ];
        for(const [name,relativeFile,target,local,generated] of cases){
            const file=paths.join(sourceRoot,'skills',name,...relativeFile.split('/'));
            const resolved=resolveSkillReference(file,target,name,{sourceRoot,repoRoot,paths});
            assert.equal(resolved.local,paths.join(repoRoot,...local.split('/')),paths.sep+': '+target);
            assert.equal(resolved.generated,generated?paths.join(repoRoot,...generated.split('/')):null,paths.sep+': '+target);
            assert.equal(resolved.installed,`skills/${name}/${relativeFile}`);
        }
    }
});

test('registered methods have real provenance, a bundled executor and complete installed dependencies', async()=>{
    await validateSkills();
    const hashed=new Set(integrityPaths());
    assert.equal(businessSkillRegistry.defaultPositioningSkill,'xindao-interview');
    for(const method of businessSkillRegistry.methods){
        assert.ok(productionSkillNames.includes(method.executor),method.id);
        assert.ok(method.source.files.length,method.id);
        for(const dependency of method.dependencies){
            assert.ok(hashed.has(dependency),dependency);
            const file=path.join(dependency.startsWith('skills/')?source:root,dependency);
            assert.ok(fs.statSync(file).isFile(),dependency);
        }
    }
    assert.equal(businessSkillRegistry.methods.find(method=>method.id==='xindao-xuanti').source.kind,'workspace-source');
    assert.equal(businessSkillRegistry.methods.find(method=>method.id==='nova-workbench-writing-method').source.kind,'complete-original-with-adapter');
    assert.equal(businessSkillRegistry.methods.find(method=>method.id==='jc-gongzuotai-write').bundleStatus,'complete-source-bundled');
});

test('business methods cannot acquire executor permission in either authorization mode',()=>{
    for(const mode of ['required','disabled']){
        const capabilities=skillCapabilities(mode);
        assert.deepEqual(Object.keys(capabilities),allSkillNames);
        for(const name of businessSkillNames){
            assert.equal(capabilities[name].role,'business-method');
            assert.equal(capabilities[name].executable,false);
            assert.equal(capabilities[name].executor,businessSkillRegistry.methods.find(method=>method.id===name).executor);
        }
        for(const name of productionSkillNames)assert.equal(capabilities[name].executable,mode==='disabled');
    }
    for(const item of [...businessSkillRegistry.unavailable,...businessSkillRegistry.disabled])assert.ok(!allSkillNames.includes(item.id),item.id);
});

test('all distributed business resources are covered by integrity; source-only evidence stays in the repository',()=>{
    const hashed=new Set(integrityPaths());
    const visit=directory=>{
        for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
            const file=path.join(directory,entry.name);
            if(entry.isDirectory()){visit(file);continue;}
            const relative=path.relative(source,file).split(path.sep).join('/');
            assert.equal(hashed.has(relative),runtimeMethodSourceFilter(file,source),relative);
            if(!relative.includes('/upstream/') && /\.(md|json|ya?ml|py|mjs|sh)$/.test(file))assert.doesNotMatch(fs.readFileSync(file,'utf8'),/\/Users\/(?:hejincheng|mac)\/|(?:~|\$HOME)\/AIJinCheng|VOLC_SPEECH_API_KEY\s*=/,relative);
        }
    };
    for(const name of [...businessSkillNames,...productionSkillNames])visit(path.join(source,'skills',name));
});
