import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {parseChannelUrl,validateConfig,VIDEO_ID,safeThumbnail} from '../assets/js/model.js';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
export class ApiError extends Error {constructor(code){super(code);this.code=code}}
export function createApi(key,fetcher=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms))) {
  return async function api(resource,params){
    const url=new URL(`https://www.googleapis.com/youtube/v3/${resource}`);for(const [k,v]of Object.entries({...params,key}))if(v!==undefined)url.searchParams.set(k,v);
    for(let attempt=0;attempt<3;attempt++){
      let res;try{res=await fetcher(url,{signal:AbortSignal.timeout(30000)})}catch{if(attempt<2){await sleep(1000*2**attempt);continue}throw new ApiError('networkFailure')}
      let body;try{body=await res.json()}catch{throw new ApiError('invalidApiResponse')}
      if(res.ok){if(!Array.isArray(body.items))throw new ApiError('invalidApiResponse');return body}
      const reason=body.error?.errors?.[0]?.reason;
      if((res.status===429||res.status>=500)&&attempt<2){await sleep(1000*2**attempt);continue}
      throw new ApiError(['quotaExceeded','dailyLimitExceeded','keyInvalid','accessNotConfigured','channelNotFound','playlistNotFound','channelForbidden'].includes(reason)?reason:`apiHttp${res.status}`);
    }
  };
}
export function seconds(iso){const m=/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso||'');return m?Number(m[1]||0)*86400+Number(m[2]||0)*3600+Number(m[3]||0)*60+Number(m[4]||0):0}
export async function syncChannel(config,api,{maxPages=200}={}) {
  const parsed=parseChannelUrl(config.url);const {url:sourceUrl,...query}=parsed;
  const result=await api('channels',{part:'snippet,contentDetails',...query});const ch=result.items[0];
  if(!ch || !/^UC[\w-]{22}$/.test(ch.id)||!ch.contentDetails?.relatedPlaylists?.uploads)throw new ApiError('channelNotFound');
  const meta={id:config.id,channelId:ch.id,name:ch.snippet.title,sourceUrl,thumbnail:safeThumbnail(ch.snippet.thumbnails?.medium?.url||ch.snippet.thumbnails?.default?.url),status:'ok'};
  const ids=new Set();let pageToken;let pages=0;const tokens=new Set();
  do{
    if(++pages>maxPages)throw new ApiError('channelTooLarge');
    const batch=await api('playlistItems',{part:'contentDetails',playlistId:ch.contentDetails.relatedPlaylists.uploads,maxResults:50,pageToken});
    batch.items.forEach(i=>{if(VIDEO_ID.test(i.contentDetails?.videoId))ids.add(i.contentDetails.videoId)});
    pageToken=batch.nextPageToken;if(pageToken){if(tokens.has(pageToken))throw new ApiError('invalidApiPagination');tokens.add(pageToken)}
  }while(pageToken);
  const videos=[];const all=[...ids];
  for(let i=0;i<all.length;i+=50){
    const result=await api('videos',{part:'snippet,contentDetails,status',id:all.slice(i,i+50).join(',')});
    for(const v of result.items){if(!ids.has(v.id)||v.snippet?.channelId!==ch.id||v.status?.privacyStatus!=='public'||!v.status?.embeddable||v.snippet.liveBroadcastContent==='upcoming'||!Number.isFinite(Date.parse(v.snippet.publishedAt)))continue;
      videos.push({id:v.id,channelKey:config.id,channelId:ch.id,channelName:meta.name,subject:config.subject,title:v.snippet.title,thumbnail:safeThumbnail(v.snippet.thumbnails?.medium?.url||v.snippet.thumbnails?.default?.url),publishedAt:v.snippet.publishedAt,durationSeconds:seconds(v.contentDetails.duration),embedUrl:`https://www.youtube-nocookie.com/embed/${v.id}`});
    }
  }
  videos.sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt));return {channel:meta,videos};
}
export async function synchronize(subjects,config,previous,api,now=new Date().toISOString()) {
  validateConfig(subjects,config);const channels=[],videos=[],results=[];let quotaExhausted=false;
  for(const c of config.filter(c=>c.enabled)){
    const sourceUrl=parseChannelUrl(c.url).url;
    const old=previous.channels.find(x=>x.id===c.id&&x.sourceUrl===sourceUrl);
    try{
      if(quotaExhausted)throw new ApiError('quotaExceeded');
      const next=await syncChannel(c,api);channels.push(next.channel);videos.push(...next.videos);results.push({id:c.id,status:'ok',videoCount:next.videos.length,lastSuccessAt:now});
    }catch(e){
      const code=e instanceof ApiError?e.code:'syncFailure';
      if(['quotaExceeded','dailyLimitExceeded','keyInvalid','accessNotConfigured'].includes(code))quotaExhausted=true;
      const unavailable=['channelNotFound','channelForbidden','playlistNotFound'].includes(code);
      if(old){channels.push({...old,status:unavailable?'unavailable':'stale'});if(!unavailable)videos.push(...previous.videos.filter(v=>v.channelKey===c.id&&v.channelId===old.channelId).map(v=>({...v,subject:c.subject})))}
      results.push({id:c.id,status:unavailable?'unavailable':'error',error:code,lastSuccessAt:previous.status?.channels?.find(x=>x.id===c.id)?.lastSuccessAt||null});
    }
  }
  videos.sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt));
  const ok=results.every(r=>r.status==='ok');
  return {channels,videos,status:{demo:false,lastAttemptAt:now,lastSuccessAt:ok?now:previous.status?.lastSuccessAt||null,status:ok?'ok':'partial',channels:results}};
}
async function json(name,fallback){try{return JSON.parse(await readFile(resolve(ROOT,'data',name+'.json'),'utf8'))}catch(e){if(e.code==='ENOENT'&&fallback!==undefined)return fallback;throw new Error(`Invalid or missing data/${name}.json`)}}
async function atomic(name,data){const path=resolve(ROOT,'data',name+'.json');await writeFile(path+'.tmp',JSON.stringify(data,null,name==='videos'?undefined:2)+'\n');await rename(path+'.tmp',path)}
async function main(){const key=process.env.YOUTUBE_API_KEY;if(!key)throw new Error('Set the YOUTUBE_API_KEY GitHub Secret or environment variable.');
  const subjects=await json('subjects'),config=await json('approved-channels');
  const previous={channels:await json('channels',[]),videos:await json('videos',[]),status:await json('sync-status',{})};
  const api=createApi(key);let requests=0;
  const countedApi=async(resource,params)=>{const result=await api(resource,params);if(++requests%50===0)console.log(`Completed ${requests} YouTube list requests.`);return result};
  const result=await synchronize(subjects,config,previous,countedApi);
  await mkdir(resolve(ROOT,'data'),{recursive:true});await atomic('channels',result.channels);await atomic('videos',result.videos);await atomic('sync-status',result.status);
  console.log(`Synchronized ${result.status.channels.filter(x=>x.status==='ok').length}/${result.status.channels.length} approved channels; ${result.videos.length} videos.`);
  for(const r of result.status.channels.filter(x=>x.status!=='ok'))console.warn(`${r.id}: ${r.error}`);
  if(process.env.GITHUB_STEP_SUMMARY)await writeFile(process.env.GITHUB_STEP_SUMMARY,`## CTRL Study synchronization\n\n${result.status.channels.map(r=>`- ${r.id}: ${r.status}${r.error?' ('+r.error+')':''}`).join('\n')}\n`);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message.includes(process.env.YOUTUBE_API_KEY||'\0')?'Synchronization failed.':e.message);process.exitCode=1});
