import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseDocument} from 'yaml';
for(const name of ['sync-youtube','pages','test'])test(`${name} workflow parses and defines executable jobs`,async()=>{
 const doc=parseDocument(await readFile(new URL(`../.github/workflows/${name}.yml`,import.meta.url),'utf8'),{uniqueKeys:true});assert.deepEqual(doc.errors,[]);const workflow=doc.toJS();assert.ok(workflow.on);assert.ok(workflow.jobs);for(const job of Object.values(workflow.jobs)){assert.ok(job['runs-on']);assert.ok(Array.isArray(job.steps));}
 if(name==='sync-youtube'){assert.ok(workflow.on.schedule);assert.equal(workflow.permissions.contents,'write');assert.equal(workflow.jobs.sync.steps.find(s=>s.env)?.env.YOUTUBE_API_KEY,'${{ secrets.YOUTUBE_API_KEY }}');}
 if(name==='pages'){assert.equal(workflow.permissions.contents,'read');assert.equal(workflow.jobs.deploy.permissions.pages,'write');assert.ok(workflow.on.workflow_run);}
});
