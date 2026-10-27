import test from 'node:test';
import assert from 'node:assert/strict';
import {contentDirectoryCategory} from '../src/shared/content-directory-category.ts';
const empty = {hasPublication:false,hasCreation:true,body:'',running:false};
test('source published marker remains discoverable without inventing a platform receipt',()=>{
 assert.equal(contentDirectoryCategory({...empty,stage:'published'}),'published');
 assert.equal(contentDirectoryCategory({...empty,hasPublication:true,stage:'writing'}),'published');
 assert.equal(contentDirectoryCategory({...empty,stage:'ready',body:'可发布稿'}),'doing');
});
test('idea/material-only topics and active writing retain existing directory behavior',()=>{
 assert.equal(contentDirectoryCategory(empty),'topics');
 assert.equal(contentDirectoryCategory({...empty,analysis:'拆解'}),'doing');
 assert.equal(contentDirectoryCategory({...empty,running:true}),'doing');
 assert.equal(contentDirectoryCategory({...empty,body:'正文',hasCreation:false}),'topics');
});
