import test from 'node:test';
import assert from 'node:assert/strict';
import {parseChannelUrl,validateConfig,approvedVideos,filterVideos,safeThumbnail} from '../assets/js/model.js';
import {syncChannel,synchronize,createApi,ApiError,seconds} from '../scripts/sync-youtube.mjs';
const cid='UCYO_jab_esuFRV4b17AJtAw';
const subject=[{id:'math',name:{en:'Math',ar:'رياضيات'}}];
const config={id:'teacher',url:'https://www.youtube.com/@teacher',subject:'math',teacher:'Teacher',grade:'10',order:0,enabled:true,dateAdded:'2026-01-01T00:00:00Z'};
const video={id:'abcdefghijk',channelKey:'teacher',channelId:cid,channelName:'Teacher',title:'Fractions',publishedAt:'2026-01-01T00:00:00Z',subject:'math'};
const channel={id:'teacher',channelId:cid,name:'Teacher',sourceUrl:config.url,status:'ok'};
function apiFactory({fail=false,pages=2,privateVideo=false}={}){return async(resource,p)=>{
 if(fail)throw new ApiError('quotaExceeded');
 if(resource==='channels')return {items:[{id:cid,snippet:{title:'Teacher',thumbnails:{}},contentDetails:{relatedPlaylists:{uploads:'UUtest'}}}]};
 if(resource==='playlistItems')return {items:[{contentDetails:{videoId:p.pageToken?'lmnopqrstuv':'abcdefghijk'}}],nextPageToken:pages>1&&!p.pageToken?'next':undefined};
 if(resource==='videos')return {items:p.id.split(',').map(id=>({id,snippet:{channelId:cid,title:'Fractions',publishedAt:'2026-01-01T00:00:00Z',liveBroadcastContent:'none',thumbnails:{}},contentDetails:{duration:'PT10M2S'},status:{privacyStatus:privateVideo?'private':'public',embeddable:true}}))};
 throw new Error('Unexpected API endpoint');
}}
test('resolves handles, IDs, username; rejects unsafe and nonchannel URLs',()=>{
 assert.equal(parseChannelUrl('youtube.com/@teacher/videos').forHandle,'@teacher');
 assert.equal(parseChannelUrl('https://www.youtube.com/channel/'+cid).id,cid);
 assert.equal(parseChannelUrl('youtube.com/user/teacher').forUsername,'teacher');
 for(const u of ['https://youtube.com.evil/@test','https://evil.com/@test','https://user:pass@youtube.com/@test','http://youtube.com/@test','youtube.com/watch?v=abcdefghijk','youtube.com/c/legacy','youtube.com/@teacher/unknown','youtube.com/shorts/abcdefghijk'])assert.throws(()=>parseChannelUrl(u));
});
test('validates references, duplicate IDs and required fields',()=>{
 assert.ok(validateConfig(subject,[config]));assert.throws(()=>validateConfig(subject,[config,config]));assert.throws(()=>validateConfig(subject,[{...config,subject:'unknown'}]));assert.throws(()=>validateConfig(subject,[{...config,enabled:'true'}]));
});
test('all upload pages collected, verified videos only, duration parsed',async()=>{
 const result=await syncChannel(config,apiFactory());assert.equal(result.videos.length,2);assert.equal(result.videos[0].durationSeconds,602);assert.equal(result.channel.sourceUrl,config.url);
 assert.equal((await syncChannel(config,apiFactory({privateVideo:true}))).videos.length,0);
 assert.equal(seconds('P1DT2H3M4S'),93784);
});
test('does not publish truncated channel when pagination exceeds bound',async()=>{await assert.rejects(syncChannel(config,apiFactory(),{maxPages:1}),/channelTooLarge/)});
test('one broken channel does not break healthy channels',async()=>{
 const bad={...config,id:'bad',url:'https://www.youtube.com/@bad'};
 const api=apiFactory();const result=await synchronize(subject,[bad,config],{channels:[],videos:[],status:{}},async(r,p)=>{if(p.forHandle==='@bad')throw new ApiError('channelNotFound');return api(r,p)});
 assert.equal(result.status.status,'partial');assert.equal(result.videos.length,2);assert.equal(result.status.channels[0].status,'unavailable');
});
test('quota failure retains previous data and avoids remaining API calls',async()=>{
 let calls=0;const result=await synchronize(subject,[config,{...config,id:'second'}],{channels:[channel],videos:[video],status:{}},async()=>{calls++;throw new ApiError('quotaExceeded')});
 assert.equal(calls,1);assert.equal(result.videos.length,1);assert.equal(result.channels[0].status,'stale');assert.equal(result.status.channels[1].error,'quotaExceeded');
});
test('deleted channel removes videos, successful empty refresh removes old videos',async()=>{
 const old={channels:[channel],videos:[video],status:{}};
 const deleted=await synchronize(subject,[config],old,async()=>({items:[]}));assert.equal(deleted.videos.length,0);assert.equal(deleted.channels[0].status,'unavailable');
 const api=apiFactory();const empty=await synchronize(subject,[config],old,async(r,p)=>r==='playlistItems'?{items:[]}:api(r,p));assert.equal(empty.videos.length,0);
});
test('changed channel URL cannot inherit previous channel videos during errors',async()=>{
 const result=await synchronize(subject,[{...config,url:'https://www.youtube.com/@different'}],{channels:[channel],videos:[video],status:{}},apiFactory({fail:true}));assert.equal(result.videos.length,0);
});
test('disabled/deleted approvals and changed identities fail closed in frontend',()=>{
 assert.equal(approvedVideos(subject,[config],[channel],[video]).length,1);
 assert.equal(approvedVideos(subject,[{...config,enabled:false}],[channel],[video]).length,0);
 assert.equal(approvedVideos(subject,[],[channel],[video]).length,0);
 assert.equal(approvedVideos(subject,[{...config,url:'https://www.youtube.com/@other'}],[channel],[video]).length,0);
 assert.equal(approvedVideos(subject,[config],[channel],[{...video,channelId:'wrong'}]).length,0);
 assert.equal(approvedVideos(subject,[config],[channel],[null,{...video,publishedAt:'invalid'}]).length,0);
});
test('search and filters operate only on provided approved library',()=>{
 const list=approvedVideos(subject,[config],[channel],[video]);assert.equal(filterVideos(list,{query:'fractions',grade:'10'}).length,1);assert.equal(filterVideos(list,{query:'trending'}).length,0);assert.equal(filterVideos(list,{subject:'other'}).length,0);
});
test('thumbnail allowlist rejects arbitrary hosts and javascript',()=>{assert.equal(safeThumbnail('javascript:alert(1)'),'');assert.equal(safeThumbnail('https://example.com/x'),'');assert.ok(safeThumbnail('https://i.ytimg.com/x'))});
test('API retries transient requests, redacts API errors and does not leak key',async()=>{
 let calls=0;const api=createApi('secret',async()=>{calls++;if(calls<3)return {ok:false,status:503,json:async()=>({error:{message:'secret'}})};return {ok:true,json:async()=>({items:[]})}},async()=>{});assert.deepEqual(await api('channels',{}),{items:[]});assert.equal(calls,3);
 const failed=createApi('secret',async()=>({ok:false,status:403,json:async()=>({error:{message:'secret',errors:[{reason:'quotaExceeded'}]}})}));await assert.rejects(failed('channels',{}),e=>e.message==='quotaExceeded');
});
