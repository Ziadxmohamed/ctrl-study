import test from 'node:test';
import assert from 'node:assert/strict';
import {addChannel} from '../scripts/add-channel.mjs';
const subjects=[{id:'arabic',name:{ar:'العربية',en:'Arabic'}},{id:'english',name:{ar:'الإنجليزية',en:'English'}}];
const api=async()=>({items:[{id:'UCYO_jab_esuFRV4b17AJtAw',snippet:{title:'Teacher from API'},contentDetails:{relatedPlaylists:{uploads:'UUtest'}}}]});
test('channel registration resolves metadata, assigns subject, preserves approvals',async()=>{
 const first=await addChannel(subjects,[],{url:'youtube.com/@teacher',subject:'arabic'},api,'2026-10-04T00:00:00Z');
 assert.equal(first.channel.teacher,'Teacher from API');assert.equal(first.channel.url,'https://www.youtube.com/@teacher');assert.match(first.channel.id,/^channel-[a-f0-9]{16}$/);
 const second=await addChannel(subjects,first.channels,{url:'youtube.com/@another',subject:'english',teacher:'Custom teacher',grade:'Year 1'},api);
 assert.equal(second.channels.length,2);assert.equal(second.channels[0].teacher,'Teacher from API');assert.equal(second.channel.grade,'Year 1');
});
test('adding same normalized URL updates existing approval without duplicates',async()=>{
 const first=await addChannel(subjects,[],{url:'youtube.com/@teacher',subject:'arabic',teacher:'Original'},api);
 const second=await addChannel(subjects,first.channels,{url:'youtube.com/@teacher/videos',subject:'english'},api);
 assert.equal(second.channels.length,1);assert.equal(second.channel.id,first.channel.id);assert.equal(second.channel.teacher,'Original');assert.equal(second.channel.dateAdded,first.channel.dateAdded);assert.equal(second.channel.subject,'english');
});
test('invalid URL or subject fails before making API calls',async()=>{
 let called=false;const guarded=()=>{called=true;return api()};
 await assert.rejects(addChannel(subjects,[],{url:'https://evil.com/@teacher',subject:'arabic'},guarded));
 await assert.rejects(addChannel(subjects,[],{url:'youtube.com/@teacher',subject:'missing'},guarded));assert.equal(called,false);
});
test('nonexistent channel is rejected rather than silently approved',async()=>{await assert.rejects(addChannel(subjects,[],{url:'youtube.com/@missing',subject:'arabic'},async()=>({items:[]})),/channelNotFound/)});
