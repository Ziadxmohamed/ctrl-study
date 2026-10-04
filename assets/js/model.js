export const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
export function parseChannelUrl(input) {
  const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  if (url.protocol !== 'https:' || !['youtube.com','www.youtube.com','m.youtube.com'].includes(url.hostname) || url.username || url.password || url.port) throw new Error('Use a valid HTTPS YouTube channel URL.');
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0]?.startsWith('@') && parts[0].length > 1 && !/[\/?#\s%]/.test(parts[0]) && (parts.length === 1 || ['videos','featured','playlists','about','shorts','streams'].includes(parts[1]) && parts.length === 2)) return {forHandle: parts[0], url:`https://www.youtube.com/${encodeURI(parts[0])}`};
  if (parts[0] === 'channel' && /^UC[A-Za-z0-9_-]{22}$/.test(parts[1]) && (parts.length === 2 || parts.length === 3 && ['videos','featured','playlists','about','shorts','streams'].includes(parts[2]))) return {id:parts[1], url:`https://www.youtube.com/channel/${parts[1]}`};
  if (parts[0] === 'user' && /^[\w.-]+$/.test(parts[1]) && parts.length === 2) return {forUsername:parts[1],url:`https://www.youtube.com/user/${parts[1]}`};
  throw new Error('Use /@handle, /channel/UC… or /user/username. For legacy /c/ URLs, copy the channel handle from YouTube.');
}
export function validateConfig(subjects, channels) {
  if (!Array.isArray(subjects) || !Array.isArray(channels)) throw new Error('Subjects and channels must be JSON arrays.');
  const ids = new Set();
  for (const s of subjects) {
    if (!s || !/^[a-z0-9-]+$/.test(s.id) || ids.has(s.id) || !s.name?.ar || !s.name?.en || typeof s.name.ar !== 'string' || typeof s.name.en !== 'string') throw new Error('Each subject needs a unique slug ID and Arabic/English names.');
    ids.add(s.id);
  }
  const cids = new Set();
  for (const c of channels) {
    if (!c || !/^[a-z0-9-]+$/.test(c.id) || cids.has(c.id) || !ids.has(c.subject) || typeof c.teacher !== 'string' || !c.teacher.trim() || typeof c.enabled !== 'boolean' || (c.grade !== undefined && typeof c.grade !== 'string') || !Number.isFinite(c.order) || !Number.isFinite(Date.parse(c.dateAdded))) throw new Error('Each channel needs a unique slug ID, valid subject, teacher, status, order and date.');
    parseChannelUrl(c.url); cids.add(c.id);
  }
  return true;
}
export function approvedVideos(subjects, config, channels, videos) {
  const subjectsSet = new Set(subjects.map(s=>s.id));
  const allow = new Map(config.filter(c=>c.enabled && subjectsSet.has(c.subject)).map(c=>[c.id,c]));
  const resolved = new Map(channels.map(c=>[c.id,c]));
  const seen = new Set();
  return videos.filter(v=>{
    if(!v || typeof v!=='object')return false;
    const c=allow.get(v.channelKey), r=resolved.get(v.channelKey);
    if (!v || typeof v.title!=='string' || typeof v.channelName!=='string' || typeof v.publishedAt!=='string' || !Number.isFinite(Date.parse(v.publishedAt)) || !c || !r || r.status === 'unavailable' || r.sourceUrl !== parseChannelUrl(c.url).url || !VIDEO_ID.test(v.id) || v.channelId !== r.channelId || seen.has(v.channelKey+v.id)) return false;
    seen.add(v.channelKey+v.id); return true;
  }).map(v=>({...v,subject:allow.get(v.channelKey).subject,teacher:allow.get(v.channelKey).teacher,grade:allow.get(v.channelKey).grade || ''}));
}
export function filterVideos(videos, {query='',subject='',teacher='',grade='',channel='',sort='newest'}={}) {
  const q=query.trim().toLocaleLowerCase();
  return videos.filter(v=>(!subject || v.subject===subject) && (!teacher || v.teacher===teacher) && (!grade || v.grade===grade) && (!channel || v.channelKey===channel) && (!q || `${v.title} ${v.teacher} ${v.channelName}`.toLocaleLowerCase().includes(q))).sort((a,b)=>sort==='oldest'?a.publishedAt.localeCompare(b.publishedAt):b.publishedAt.localeCompare(a.publishedAt));
}
export function safeThumbnail(url) {
  try { const u=new URL(url); return u.protocol==='https:' && ['i.ytimg.com','yt3.ggpht.com','yt3.googleusercontent.com'].includes(u.hostname)?u.href:''; } catch {return '';}
}
