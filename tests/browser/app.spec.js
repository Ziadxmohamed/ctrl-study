import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
test.beforeEach(async({page})=>{
 await page.route('**/data/*.json*',async route=>{const name=new URL(route.request().url()).pathname.split('/').pop();const body=await readFile(new URL('../fixtures/'+name,import.meta.url),'utf8');await route.fulfill({contentType:'application/json',body})});
});
test('Arabic home, English navigation, subjects, channels, filters and player shell',async({page},testInfo)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('./');
 await expect(page.locator('html')).toHaveAttribute('dir','rtl');await expect(page.locator('h1')).toHaveText('كل يوم، خطوة جديدة.');
 await expect(page.locator('.subject')).toHaveCount(4);await page.screenshot({path:`/tmp/ctrl-study-${testInfo.project.name}-ar.png`,fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('#language').click();await expect(page.locator('html')).toHaveAttribute('dir','ltr');await page.screenshot({path:`/tmp/ctrl-study-${testInfo.project.name}-en.png`,fullPage:true});
 await page.locator('#navigation a[href="#subjects"]').click();await expect(page.locator('.subject')).toHaveCount(7);
 await page.locator('a[href="#subject/mathematics"]').click();await expect(page.locator('.teacher-card')).toHaveCount(2);
 await page.locator('a[href="#channel/3blue1brown"]').first().click();await expect(page.locator('.video-card')).toHaveCount(4);
 await page.getByRole('searchbox').fill('Fourier');await expect(page.locator('.video-card')).toHaveCount(1);
 await page.getByRole('searchbox').fill('unrelated trending');await expect(page.locator('.empty')).toBeVisible();
 await page.getByRole('button',{name:'Clear filters'}).click();await expect(page.locator('.video-card')).toHaveCount(4);
 await page.locator('.video-card a').first().click();await expect(page.getByRole('button',{name:'Load lesson player'})).toBeVisible();
 await page.getByRole('button',{name:'Mark complete',exact:true}).click();await expect(page.getByRole('button',{name:'Mark incomplete',exact:true})).toBeVisible();
 await page.reload();await expect(page.getByRole('button',{name:'Mark incomplete',exact:true})).toBeVisible();
 await page.goto('./#subject/english');await expect(page.locator('.empty').first()).toBeVisible();
 await page.goto('./#watch/unknown/abcdefghijk');await expect(page.locator('.empty')).toBeVisible();
 expect(errors).toEqual([]);
});
test('library failures and malformed JSON have retry state',async({page})=>{
 await page.route('**/data/videos.json',route=>route.fulfill({contentType:'application/json',body:'{broken'}));await page.goto('./');await expect(page.locator('#content .notice')).toBeVisible();await expect(page.locator('#content button')).toBeVisible();
});
test('disabled and changed approvals hide videos even with stale generated data',async({page})=>{
 await page.route('**/data/approved-channels.json',async route=>{const items=JSON.parse(await readFile(new URL('../fixtures/approved-channels.json',import.meta.url),'utf8'));items[0].enabled=false;items[1].url='https://www.youtube.com/@changed';await route.fulfill({json:items})});await page.goto('./#latest');await expect(page.locator('.video-card')).toHaveCount(1);
});
test('manager shows published channels without developer links',async({page},testInfo)=>{
 await page.goto('./admin/');await expect(page.locator('#channel-list .admin-row')).toHaveCount(3);
 await expect(page.locator('#publish-channel')).toBeDisabled();
 expect(await page.locator('body').innerText()).not.toMatch(/GitHub|workflow|JSON/i);
 await page.screenshot({path:`/tmp/ctrl-admin-${testInfo.project.name}.png`,fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('manifest and service-worker registration use repository-relative paths',async({page,request})=>{
 await page.goto('./');const manifest=await (await request.get('./manifest.json')).json();expect(manifest.start_url).toBe('./');for(const icon of manifest.icons)expect((await request.get('./'+icon.src)).ok()).toBe(true);
 expect((await request.get('./service-worker.js')).ok()).toBe(true);await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href','manifest.json');
});
test('official player adapter saves actual playback progress and handles embed errors',async({page})=>{
 await page.addInitScript(()=>{
  window.YT={Player:class {
   constructor(id,options){this.options=options;this.time=42;this.state=1;window.testPlayer=this;const host=typeof id==='string'?document.getElementById(id):id;host.textContent='Fixture official player';queueMicrotask(()=>options.events.onReady());}
   getPlayerState(){return this.state}getCurrentTime(){return this.time}getDuration(){return 120}destroy(){}
  }};
 });
 await page.goto('./#watch/3blue1brown/r6sGWTCMz2k');await page.locator('#language').click();await page.getByRole('button',{name:'Load lesson player'}).click();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ctrl-progress'))?.['3blue1brown/r6sGWTCMz2k']?.seconds),{timeout:10000}).toBe(42);
 await page.evaluate(()=>window.testPlayer.options.events.onError({data:100}));await expect(page.locator('.player')).toContainText('This lesson could not play');await expect(page.locator('.player button')).toHaveText('Try again');
});
test('PWA registers under repository scope and serves only cached shell offline',async({browser})=>{
 const context=await browser.newContext({serviceWorkers:'allow'});const page=await context.newPage();await page.goto('http://127.0.0.1:8081/repository/');
 await page.evaluate(()=>navigator.serviceWorker.ready);await expect.poll(()=>page.evaluate(()=>navigator.serviceWorker.controller?.scriptURL)).toContain('/repository/service-worker.js');
 expect(await page.evaluate(async()=>{const r=await navigator.serviceWorker.ready;return new URL(r.scope).pathname})).toBe('/repository/');
 await context.setOffline(true);await page.reload();await expect(page.locator('#content .notice')).toBeVisible();
 const cached=await page.evaluate(async()=>{const entries=await Promise.all((await caches.keys()).map(async k=>(await (await caches.open(k)).keys()).map(r=>r.url)));return entries.flat()});expect(cached.every(u=>!u.includes('/data/')&&!u.includes('youtube'))).toBe(true);
 await context.close();
});

test('admin remembers credentials and clears them on logout',async({page})=>{
 await page.route('https://api.github.com/**',route=>route.fulfill({json:{state:'active'}}));
 await page.goto('./admin/');await page.locator('#publish-token').fill('fixture-token');await page.locator('#save-login').click();
 await expect(page.locator('#login-message')).toContainText('تم حفظ الدخول');
 await page.reload();await expect(page.locator('#publish-token')).toHaveValue('fixture-token');
 await page.locator('#logout').click();await expect(page.locator('#publish-token')).toHaveValue('');
 expect(await page.evaluate(()=>localStorage.getItem('ctrl-admin-credential'))).toBeNull();
});

test('publish spinner lasts through sync and confirms only deployed lessons',async({page})=>{
 let release;const gate=new Promise(resolve=>release=resolve);let published=false;
 await page.route('https://api.github.com/**/dispatches',route=>route.fulfill({json:{workflow_run_id:123}}));
 await page.route('https://api.github.com/**/actions/runs/123',async route=>{await gate;published=true;await route.fulfill({json:{status:'completed',conclusion:'success'}})});
 await page.route('**/data/*.json*',async route=>{
  const file=new URL(route.request().url()).pathname.split('/').pop();const data=JSON.parse(await readFile(new URL('../fixtures/'+file,import.meta.url),'utf8'));
  if(published){
   if(file==='approved-channels.json')data.push({id:'newteacher',url:'https://www.youtube.com/@newteacher',subject:'arabic',teacher:'New Teacher',grade:'',enabled:true,order:4,dateAdded:new Date().toISOString()});
   if(file==='channels.json')data.push({id:'newteacher',channelId:'UCtest',sourceUrl:'https://www.youtube.com/@newteacher',status:'ok'});
   if(file==='sync-status.json')data.channels.push({id:'newteacher',status:'ok',videoCount:1,lastSuccessAt:new Date().toISOString()});
   if(file==='videos.json')data.push({id:'abcdefghijk',channelKey:'newteacher',channelId:'UCtest'});
  }
  await route.fulfill({json:data});
 });
 await page.goto('./admin/');await page.locator('#publish-token').fill('fixture-token');await page.locator('#publish-url').fill('youtube.com/@newteacher');await page.locator('#publish-subject').selectOption('arabic');await page.locator('#publish-channel').click();
 await expect(page.locator('#publish-spinner')).toBeVisible();await expect(page.locator('#publish-channel')).toBeDisabled();
 await expect(page.locator('#publish-status')).not.toContainText('تم كل شيء');
 release();await expect(page.locator('#publish-status')).toContainText('تم كل شيء بنجاح');await expect(page.locator('#publish-status')).toContainText('1 درس');await expect(page.locator('#publish-spinner')).toBeHidden();await expect(page.locator('#view-channel')).toHaveAttribute('href','../#channel/newteacher');
});

test('failed publishing stops spinner and never reports success',async({page})=>{
 await page.route('https://api.github.com/**/dispatches',route=>route.fulfill({json:{workflow_run_id:123}}));
 await page.route('https://api.github.com/**/actions/runs/123',route=>route.fulfill({json:{status:'completed',conclusion:'failure'}}));
 await page.goto('./admin/');await page.locator('#publish-token').fill('fixture-token');await page.locator('#publish-url').fill('youtube.com/@badteacher');await page.locator('#publish-channel').click();
 await expect(page.locator('#publish-status')).toContainText('لم تكتمل');await expect(page.locator('#publish-spinner')).toBeHidden();await expect(page.locator('#view-channel')).toBeHidden();await expect(page.locator('#publish-channel')).toBeEnabled();
});

