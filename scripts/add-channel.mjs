import {createHash} from 'node:crypto';
import {readFile,writeFile,rename,appendFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {parseChannelUrl,validateConfig} from '../assets/js/model.js';
import {createApi,ApiError} from './sync-youtube.mjs';
export async function addChannel(subjects,channels,input,api,now=new Date().toISOString()) {
  validateConfig(subjects,channels);
  const parsed=parseChannelUrl(input.url.trim());
  const subject=input.subject.trim().toLowerCase();
  if(!subjects.some(s=>s.id===subject))throw new Error('Unknown subject. Use a configured subject ID, for example arabic or mathematics.');
  const {url,...query}=parsed;
  const response=await api('channels',{part:'snippet,contentDetails',...query});
  const metadata=response.items[0];
  if(!metadata || !/^UC[\w-]{22}$/.test(metadata.id) || !metadata.contentDetails?.relatedPlaylists?.uploads || typeof metadata.snippet?.title!=='string')throw new ApiError('channelNotFound');
  const existing=channels.find(c=>parseChannelUrl(c.url).url===url);
  const channel={id:existing?.id||'channel-'+createHash('sha256').update(url).digest('hex').slice(0,16),url,subject,teacher:input.teacher?.trim()||existing?.teacher||metadata.snippet.title,grade:input.grade?.trim()||'',enabled:true,order:existing?.order??Math.max(-1,...channels.map(c=>c.order))+1,dateAdded:existing?.dateAdded||now};
  const updated=existing?channels.map(c=>c.id===existing.id?channel:c):[...channels,channel];
  validateConfig(subjects,updated);return {channels:updated,channel};
}
async function main(){
  const key=process.env.YOUTUBE_API_KEY;
  if(!key)throw new Error('YOUTUBE_API_KEY secret is missing.');
  if(!process.env.CTRL_CHANNEL_URL)throw new Error('Channel URL is required.');
  const root=new URL('../data/',import.meta.url);
  const subjects=JSON.parse(await readFile(new URL('subjects.json',root),'utf8'));
  const channels=JSON.parse(await readFile(new URL('approved-channels.json',root),'utf8'));
  const result=await addChannel(subjects,channels,{url:process.env.CTRL_CHANNEL_URL,subject:process.env.CTRL_SUBJECT||'arabic',teacher:process.env.CTRL_TEACHER||'',grade:process.env.CTRL_GRADE||''},createApi(key));
  const path=new URL('approved-channels.json',root);const temp=new URL('approved-channels.json.tmp',root);
  await writeFile(temp,JSON.stringify(result.channels,null,2)+'\n');await rename(temp,path);
  if(process.env.GITHUB_OUTPUT)await appendFile(process.env.GITHUB_OUTPUT,`channel_key=${result.channel.id}\n`);
  console.log(`Approved channel ${result.channel.id} in subject ${result.channel.subject}.`);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message.includes(process.env.YOUTUBE_API_KEY||'\0')?'Channel registration failed.':e.message);process.exitCode=1});
