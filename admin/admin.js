import {validateConfig,parseChannelUrl} from '../assets/js/model.js';
const $=id=>document.getElementById(id);
const credentialKey='ctrl-admin-credential';
let ready=false,busy=false,subjects=[];
const owner=location.hostname.endsWith('.github.io')?location.hostname.slice(0,-10):'Ziadxmohamed';
const repo=location.hostname.endsWith('.github.io')?new URL('../',location.href).pathname.split('/').filter(Boolean)[0]||owner+'.github.io':'ctrl-study';
const apiBase=`https://api.github.com/repos/${owner}/${repo}/`;
function node(tag,text){const n=document.createElement(tag);n.textContent=text;return n}
function credential(){return $('publish-token').value.trim()}
function stored(){try{return localStorage.getItem(credentialKey)||''}catch{return ''}}
function forget(){try{localStorage.removeItem(credentialKey)}catch{}}
function loginState(){const connected=Boolean(credential());$('login-state').textContent=connected?'رمز الدخول موجود':'غير متصل';$('logout').hidden=!connected;$('publish-channel').disabled=!ready||busy||!connected;}
$('publish-token').value=stored();loginState();
$('publish-token').addEventListener('input',loginState);
function remember(){if($('remember-token').checked){try{localStorage.setItem(credentialKey,credential());return true}catch{$('login-message').textContent='المتصفح منع حفظ الدخول؛ يمكنك استخدام الرمز في هذه الصفحة فقط.';return false}}forget();return false}
function result(kind,title,copy){$('publish-status').hidden=false;$('publish-status').dataset.kind=kind;$('publish-spinner').hidden=kind!=='busy';$('publish-status-title').textContent=title;$('publish-status-copy').textContent=copy;$('view-channel').hidden=true;$('publish-form').setAttribute('aria-busy',String(kind==='busy'))}
async function api(path,token,body){
 const response=await fetch(apiBase+path,{method:body?'POST':'GET',headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':'2026-03-10'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
 if(!response.ok){const errors={401:'رمز الدخول غير صالح أو انتهت صلاحيته. أدخل رمزًا صالحًا.',403:'رمز الدخول لا يملك صلاحية النشر. يلزم تعديل صلاحيات رمز الإدارة.',404:'تعذر الوصول لخدمة النشر بهذا الرمز.',422:'تعذر بدء الإضافة. تحقق من إعداد خدمة النشر.'};throw new Error(errors[response.status]||'خدمة النشر غير متاحة الآن. حاول لاحقًا.');}
 return response.status===204?null:response.json();
}
async function json(file){const r=await fetch(`../data/${file}.json?check=${Date.now()}`,{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error('تعذر تحميل المكتبة.');return r.json()}
$('login-form').onsubmit=async e=>{e.preventDefault();if(busy)return;$('save-login').disabled=true;$('login-message').textContent='جاري التحقق من رمز الدخول…';try{await api('actions/workflows/add-channel.yml',credential());const saved=remember();$('login-message').textContent=saved?'تم حفظ الدخول على هذا الجهاز. يمكنك الآن إضافة القنوات.':'تم الاتصال. يمكنك الآن إضافة القنوات من هذه الصفحة.';loginState()}catch(e){$('login-message').textContent=e.message}finally{$('save-login').disabled=false}};
$('logout').onclick=()=>{if(busy)return;forget();$('publish-token').value='';$('login-message').textContent='تم تسجيل الخروج ومسح رمز الدخول المحفوظ.';loginState()};
function showChannels(channels){$('channel-list').replaceChildren();for(const c of channels.filter(c=>c.enabled)){const row=node('div','');row.className='admin-row';const copy=node('div','');copy.className='row-text';copy.append(node('strong',c.teacher),node('small',subjects.find(s=>s.id===c.subject)?.name.ar||c.subject));const a=node('a','فتح الدروس');a.className='secondary';a.href='../#channel/'+c.id;row.append(copy,a);$('channel-list').append(row)}if(!$('channel-list').children.length)$('channel-list').append(node('p','لا توجد قنوات منشورة بعد.'))}
function showStatus(status){const labels={ok:'تمت المزامنة',partial:'مزامنة جزئية',error:'فشلت المزامنة'};const last=status.lastSuccessAt?new Intl.DateTimeFormat('ar-EG',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Cairo'}).format(new Date(status.lastSuccessAt)):'لا توجد مزامنة ناجحة';$('sync-status').textContent=`الحالة: ${labels[status.status]||'غير متاحة'}\nآخر نجاح بتوقيت القاهرة: ${last}`;}
async function load(){try{const [s,c,status]=await Promise.all([json('subjects'),json('approved-channels'),json('sync-status')]);validateConfig(s,c);subjects=s;$('publish-subject').replaceChildren(...s.map(s=>{const o=node('option',s.name.ar);o.value=s.id;return o}));showChannels(c);showStatus(status);ready=true;loginState()}catch{$('sync-status').textContent='تعذر تحميل المكتبة؛ حدّث الصفحة وحاول مرة أخرى.'}}
const delay=()=>new Promise(resolve=>setTimeout(resolve,5000));
async function monitor(runId,token,input,started){
 const deadline=Date.now()+35*60*1000;
 let completed=false;
 while(Date.now()<deadline){
  if(!completed){const run=await api('actions/runs/'+runId,token);if(run.status==='completed'){if(run.conclusion!=='success')throw new Error('لم تكتمل إضافة القناة. تحقق من رابط القناة، أو جرّب لاحقًا.');completed=true;result('busy','جاري نشر الدروس…','اكتملت المزامنة. نتحقق الآن من ظهور القناة على الموقع.');}else result('busy',run.status==='queued'?'طلبك في الانتظار…':'جاري إضافة القناة ومزامنة الدروس…','العملية قد تستغرق عدة دقائق. اترك الصفحة مفتوحة.');}
  if(completed){try{const [config,status,resolved,lessons]=await Promise.all(['approved-channels','sync-status','channels','videos'].map(json));const c=config.find(c=>parseChannelUrl(c.url).url===input.url&&c.subject===input.subject&&c.enabled&&(!input.teacher||c.teacher===input.teacher)&&c.grade===input.grade);const sync=status.channels?.find(s=>s.id===c?.id);const metadata=resolved.find(r=>r.id===c?.id);if(c&&sync?.status==='ok'&&Date.parse(sync.lastSuccessAt)>=started&&metadata?.sourceUrl===input.url){const count=lessons.filter(v=>v.channelKey===c.id&&v.channelId===metadata.channelId).length;if(count===sync.videoCount){showChannels(config);showStatus(status);return {id:c.id,count};}}}catch{/* A deployment may briefly serve different revisions; keep checking. */}}
  await delay();
 }
 throw new Error('المتابعة استغرقت وقتًا أطول من المتوقع. لا يعني ذلك فشل الإضافة؛ تحقق من الدروس قبل إعادة المحاولة.');
}
$('publish-form').onsubmit=async e=>{
 e.preventDefault();if(!ready||busy)return;
 const token=credential();if(!token){$('login-message').textContent='أدخل رمز الإدارة أولًا.';return;}
 try{
  const input={url:parseChannelUrl($('publish-url').value.trim()).url,subject:$('publish-subject').value,teacher:$('publish-teacher').value.trim(),grade:$('publish-grade').value.trim()};
  busy=true;loginState();$('logout').disabled=true;$('save-login').disabled=true;$('publish-token').disabled=true;remember();
  result('busy','جاري إرسال طلب الإضافة…','سنخبرك هنا عندما تكتمل المزامنة والنشر.');
  const started=Date.now();
  const dispatch=await api('actions/workflows/add-channel.yml/dispatches',token,{ref:'main',inputs:{channel_url:input.url,subject:input.subject,teacher:input.teacher,grade:input.grade}});
  if(!dispatch?.workflow_run_id)throw new Error('تم إرسال الطلب، لكن تعذرت متابعته. تحقق من ظهور الدروس قبل إعادة المحاولة.');
  const done=await monitor(dispatch.workflow_run_id,token,input,started);
  result('success','✓ تم كل شيء بنجاح',`تمت إضافة القناة ومزامنة ${done.count} درس ونشرها على الموقع.${done.count===0?' لا توجد فيديوهات قابلة للنشر في القناة حاليًا.':''}`);
  $('view-channel').href='../#channel/'+done.id;$('view-channel').hidden=false;
 }catch(e){result('error','تعذّر إكمال العملية',e.name==='TimeoutError'?'انتهت مهلة الاتصال. قد يكون الطلب مستمرًا؛ تحقق من الدروس قبل إعادة المحاولة.':e instanceof TypeError?'انقطع الاتصال. قد يستمر النشر؛ تحقق من الدروس قبل إعادة المحاولة.':e.message)}
 finally{busy=false;$('logout').disabled=false;$('save-login').disabled=false;$('publish-token').disabled=false;loginState()}
};
$('refresh-status').onclick=async()=>{try{showStatus(await json('sync-status'))}catch{$('sync-status').textContent='تعذر تحديث الحالة. حاول مرة أخرى.'}};
window.addEventListener('beforeunload',e=>{if(busy){e.preventDefault();e.returnValue=''}});
load();
