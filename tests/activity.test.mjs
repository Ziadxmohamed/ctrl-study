import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecord,PlaybackTracker,coverage,watchedEnough} from '../assets/js/activity.js';
const sample=(t,time,wall,state=1,rate=1)=>t.sample({time,wall,state,rate,duration:100,at:wall});
test('normal and double speed playback add unique coverage; buffering is not a pause',()=>{
 const r=createRecord(),t=new PlaybackTracker(r);sample(t,0,0);sample(t,1,1000);sample(t,2,2000,3);sample(t,2,2500,1);sample(t,3,3500,1);sample(t,3,4000,2);sample(t,3,4500,2);assert.equal(r.pauses,1);assert.equal(r.forward,0);assert.equal(r.plays,1);assert.equal(coverage(r),3);
 t.resetSample();sample(t,0,5000,1,2);sample(t,2,6000,1,2);assert.equal(coverage(r),3);assert.equal(r.forward,0);
});
test('large jump near end is recorded and never counted as completed viewing',()=>{
 const r=createRecord(),t=new PlaybackTracker(r);sample(t,0,0);sample(t,1,1000);sample(t,98,1500);sample(t,99,2500);sample(t,100,3500,0);assert.equal(r.forward,1);assert.equal(r.largeForward,1);assert.equal(r.ends,1);assert.equal(r.events.find(e=>e.type==='forward').nearEnd,true);assert.equal(coverage(r),3);assert.equal(watchedEnough(r),false);
});
test('rewatch does not inflate coverage; 90 percent is based on actually played ranges',()=>{
 const r=createRecord(),t=new PlaybackTracker(r);sample(t,0,0);for(let n=1;n<=90;n++)sample(t,n,n*1000);assert.equal(watchedEnough(r),true);sample(t,5,90500);assert.equal(r.backward,1);sample(t,6,91500);assert.equal(coverage(r),90);
});
test('resume baseline and background gaps are not logged as skips or watched time',()=>{
 const r=createRecord(),t=new PlaybackTracker(r);sample(t,70,0);sample(t,90,20000);assert.equal(r.forward,0);assert.equal(coverage(r),0);t.resetSample();sample(t,10,21000);assert.equal(r.backward,0);
});
test('background baseline reset does not invent pause or play transitions',()=>{
 const r=createRecord(),t=new PlaybackTracker(r);sample(t,0,0);sample(t,1,1000,2);t.resetSample();sample(t,1,2000,2);assert.equal(r.pauses,1);assert.equal(r.plays,1);sample(t,1,2500,1);t.resetSample();sample(t,1,3000,1);assert.equal(r.plays,2);
});
