import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
test.beforeEach(async({page})=>{
 await page.route('**/data/*.json',async route=>{const name=new URL(route.request().url()).pathname.split('/').pop();const body=await readFile(new URL('../fixtures/'+name,import.meta.url),'utf8');await route.fulfill({contentType:'application/json',body})});
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
 await page.route('**/data/approved-channels.json',async route=>{const res=await route.fetch();const items=await res.json();items[0].enabled=false;items[1].url='https://www.youtube.com/@changed';await route.fulfill({json:items})});await page.goto('./#latest');await expect(page.locator('.video-card')).toHaveCount(1);
});
test('public manager edits config and reports invalid channel URLs',async({page})=>{
 await page.goto('./admin/');await expect(page.locator('#channel-list .admin-row')).toHaveCount(3);
 await page.locator('#url').fill('https://evil.com/@teacher');await page.locator('#teacher').fill('New Teacher');await page.getByRole('button',{name:'Add channel',exact:true}).click();await expect(page.locator('#message')).toContainText('valid HTTPS');
 await page.locator('#url').fill('youtube.com/@newteacher');await page.getByRole('button',{name:'Add channel',exact:true}).click();await expect(page.locator('#channel-list .admin-row')).toHaveCount(4);await expect(page.locator('#message')).toContainText('saved to draft');
 const row=page.locator('#channel-list .admin-row').last();await row.getByRole('button',{name:'Disable',exact:true}).click();await expect(row).toContainText('Disabled');
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
