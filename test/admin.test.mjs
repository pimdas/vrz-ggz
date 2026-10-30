import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {compileContent} from '../lib/content.mjs';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
test('Content compiler preserves the complete public appearance',async()=>{
 const c=await compileContent(path.resolve('public'));assert.equal(c.pages.filter(p=>!['header','footer','waiting'].includes(p.id)).length,20);
 for(const [file,html] of c.templates){const result=c.render(file,new Map());assert.equal(result,await readFile(path.join('public',file),'utf8'));assert(!result.includes('<!--cms:'));}
 const home=c.pages.find(p=>p.id==='index.html');assert(home.blocks.length>=8);assert(home.fields.every(f=>home.blocks.some(b=>b.id===f.block)));
 const headers=c.pages.find(p=>p.id==='header');assert(headers.fields.some(f=>f.text==='Contact'));
 const f=headers.fields.find(f=>f.text==='Contact');assert(c.render('index.html',new Map([[f.id,'<img src=x onerror=alert(1)>']])).includes('&lt;img'));
});
test('Authentication, editorial publishing, invitations, permissions, history and durable storage',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'vrz-cms-'));const port=19391;const base='http://127.0.0.1:'+port;let child;let logs='';
 async function start(){child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port),DATA_DIR:dir,BOOTSTRAP_TOKEN:'test-bootstrap-token',APP_URL:base,NODE_ENV:'production'},stdio:['ignore','pipe','pipe']});child.stderr.on('data',d=>logs+=d);for(let i=0;i<100;i++){try{if((await fetch(base+'/healthz')).ok)return;}catch{}await delay(60);}throw new Error(logs);}
 async function stop(){const p=once(child,'exit');child.kill();await p;}
 const admin={};const editor={};
 async function api(route,body,actor={},options={}){const r=await fetch(base+'/api/beheer/'+route,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json',Origin:base}:{}),...(actor.cookie?{Cookie:actor.cookie}:{}),...(actor.csrf?{'X-CSRF-Token':actor.csrf}:{}),...options.headers},body:body?JSON.stringify(body):undefined});const data=await r.json();const cookie=r.headers.get('set-cookie');if(cookie)actor.cookie=cookie.split(';')[0];if(data.csrf)actor.csrf=data.csrf;return {r,data,cookie};}
 try{
 await start();assert.equal((await api('status')).data.setup,true);
 assert.equal((await api('pages')).r.status,401);
 assert.equal((await api('setup',{token:'wrong',email:'admin@example.com',name:'Admin',password:'TestPassword123!'})).r.status,403);
 let result=await api('setup',{token:'test-bootstrap-token',email:'admin@example.com',name:'Admin',password:'TestPassword123!'},admin);assert.equal(result.r.status,201);assert.match(result.cookie,/HttpOnly/);assert.match(result.cookie,/Secure/);assert.match(result.cookie,/SameSite=Strict/);
 assert.equal((await api('setup',{token:'test-bootstrap-token',email:'other@example.com',name:'Other',password:'TestPassword123!'})).r.status,403);
 assert.equal((await api('login',{email:'admin@example.com',password:'wrong'})).r.status,401);
 assert.equal((await api('save',{changes:[]},admin,{headers:{Origin:'https://attacker.example'}})).r.status,403);
 assert.equal((await api('save',{changes:[]},{cookie:admin.cookie})).r.status,403);
 let waitPages=(await api('pages',null,admin)).data;const waiting=waitPages.pages.find(p=>p.id==='waiting');assert.equal(waiting.controls.length,10);const ids=waiting.controls[0].ids;assert.equal(ids.length,2);
 let savedWait=await api('save',{page:'waiting',revision:waitPages.revision,changes:ids.map(id=>({id,value:'17'}))},admin);assert(savedWait.data.saved>=2);assert.match(await(await fetch(base+'/praktisch/wachttijden/')).text(),/Laatste update: \d{1,2} /);
 for(const route of ['/','/praktisch/wachttijden/'])assert.match(await(await fetch(base+route)).text(),/<strong>17 /);
 const wh=(await api('history?page=waiting',null,admin)).data.history;assert.equal(wh.length,1);assert.equal((await api('undo',{id:wh[0].id,revision:savedWait.data.revision},admin)).r.status,200);
 for(const route of ['/','/praktisch/wachttijden/'])assert.match(await(await fetch(base+route)).text(),/<strong>6 /);
 const initialWaiting=(await api('waiting',null,admin)).data;assert.equal(initialWaiting.config.people.length,4);
 const config=structuredClone(initialWaiting.config);config.people[0].rows[0].label='Eigen label';config.people[0].rows[0].amount=1;config.people[0].rows[0].unit='week';config.people[1].stopped=true;
 assert.equal((await api('waiting',{revision:initialWaiting.revision,config},{cookie:admin.cookie})).r.status,403);
 const savedConfig=await api('waiting',{revision:initialWaiting.revision,config},admin);assert.equal(savedConfig.r.status,200);
 for(const route of ['/','/praktisch/wachttijden/']){const h=await(await fetch(base+route)).text();assert(h.includes('Eigen label'));assert(h.includes('<strong>1 <span>week</span>'));assert(!h.includes('<strong>240 '));}
 const stale=structuredClone(config);stale.people[0].rows[0].amount=2;assert.equal((await api('waiting',{revision:initialWaiting.revision,config:stale},admin)).r.status,409);
 const bad=structuredClone(config);bad.people[0].rows[0].amount=11;assert.equal((await api('waiting',{revision:savedConfig.data.revision,config:bad},admin)).r.status,400);
 const restored=(await api('waiting',null,admin)).data;restored.config.people[1].stopped=false;
 const reopen=await api('waiting',{revision:restored.revision,config:restored.config},admin);assert.equal(reopen.r.status,200);assert((await(await fetch(base+'/')).text()).includes('<strong>240 <span>dagen</span>'));
 const latestWaiting=(await api('history?page=waiting',null,admin)).data.history;const undoReopen=await api('undo',{id:latestWaiting[0].id,revision:reopen.data.revision},admin);assert.equal(undoReopen.r.status,200);
 assert.equal((await api('undo',{id:savedConfig.data.revision,revision:undoReopen.data.revision},admin)).r.status,200);assert((await(await fetch(base+'/')).text()).includes('<strong>6 '));
 let pages=(await api('pages',null,admin)).data;let page=pages.pages.find(p=>p.id==='index.html');const field=page.fields.find(f=>f.tag==='h2');const original=field.value;
 result=await api('save',{page:page.id,revision:pages.revision,changes:[{id:field.id,value:'Nieuw verhaal <script>alert(1)</script>'}]},admin);assert.equal(result.r.status,200);assert.equal(result.data.saved,1);let rev=result.data.revision;
 let html=await (await fetch(base+'/')).text();assert(html.includes('Nieuw verhaal &lt;script&gt;'));assert(!html.includes('Nieuw verhaal <script>'));
 assert.equal((await api('save',{page:page.id,revision:pages.revision,changes:[{id:field.id,value:'Stale'}]},admin)).r.status,409);
 assert.equal((await api('save',{page:page.id,revision:rev,changes:[{id:'invalid',value:'bad'}]},admin)).r.status,400);
 let history=(await api('history?page=index.html',null,admin)).data.history;assert.equal(history.length,1);
 assert.equal((await api('undo',{id:history[0].id,revision:rev},admin)).r.status,200);assert((await (await fetch(base+'/')).text()).includes(original));
 // Semantic controls combine titles and biography paragraphs, and keep old edits visible.
 pages=(await api('pages',null,admin)).data;page=pages.pages.find(p=>p.id==='index.html');assert(page.semantic);
 const title=page.fields.find(f=>f.semantic&&f.tag==='h1');assert.match(title.value,/Jouw verhaal\.\nAlle ruimte\.\nSamen verder\./);
 const bio=pages.pages.find(p=>p.id==='over-ons/geertje-zijlstra/index.html');assert.equal(bio.fields.filter(f=>f.kind==='rich'&&f.section==='Even voorstellen').length,1);
 assert.equal((await api('draft',{page:page.id,version:page.draft.version,changes:[{id:title.id,value:'Een nieuw concept'}]},{cookie:admin.cookie})).r.status,403);
 let draft=await api('draft',{page:page.id,version:page.draft.version,changes:[{id:title.id,value:'Een nieuw concept'}]},admin);assert.equal(draft.r.status,200);
 assert(!(await(await fetch(base+'/')).text()).includes('Een nieuw concept'));
 let refreshed=(await api('pages',null,admin)).data.pages.find(p=>p.id===page.id);assert.equal(refreshed.draft.changes[0].value,'Een nieuw concept');
 let preview=await api('preview',{page:page.id,changes:refreshed.draft.changes,focus:title.id},admin);assert.equal(preview.r.status,200);assert(preview.data.html.includes('Een nieuw concept'));assert(preview.data.html.includes('cms-preview-focus'));
 assert.equal((await api('draft',{page:page.id,version:page.draft.version,changes:[]},admin)).r.status,409);
 let published=await api('publish',{page:page.id,version:draft.data.draft.version},admin);assert.equal(published.r.status,200);assert((await(await fetch(base+'/')).text()).includes('Een nieuw concept'));
 let after=(await api('pages',null,admin)).data;assert.equal(after.pages.find(p=>p.id===page.id).draft.changes.length,0);
 let h=(await api('history?page=index.html',null,admin)).data.history;assert.equal((await api('undo',{id:h[0].id,revision:after.revision},admin)).r.status,200);
 const rich=page.fields.find(f=>f.kind==='rich'&&f.section==='Je hoeft het niet alleen te doen.');
 draft=await api('draft',{page:page.id,version:published.data.draft.version,changes:[{id:rich.id,value:'<p><strong>Veilig</strong><script>alert(1)</script><a href="javascript:alert(1)">klik</a><img src=x onerror=alert(1)></p>'}]},admin);assert.equal(draft.r.status,200);const safe=draft.data.draft.changes[0].value;assert(safe.includes('<strong>Veilig</strong>'));assert(!safe.includes('<script'));assert(!safe.includes('javascript:'));assert(!safe.includes('onerror'));
 const url=page.fields.find(f=>f.kind==='url');assert.equal((await api('draft',{page:page.id,version:draft.data.draft.version,changes:[{id:url.id,value:'javascript:alert(1)'}]},admin)).r.status,400);
 // Discard concept; the current public content remains unchanged.
 assert.equal((await api('draft',{page:page.id,version:draft.data.draft.version,changes:[]},admin)).r.status,200);
 const pageBeforeRich=(await api('pages',null,admin)).data.pages.find(p=>p.id==='index.html');
 const richDraft=await api('draft',{page:page.id,version:pageBeforeRich.draft.version,changes:[{id:rich.id,value:'<p><strong>Veilig gepubliceerd</strong></p><ul><li>Een lijstitem</li></ul>'}]},admin);assert.equal(richDraft.r.status,200);
 const richPublish=await api('publish',{page:page.id,version:richDraft.data.draft.version},admin);assert.equal(richPublish.r.status,200);assert((await(await fetch(base+'/')).text()).includes('<strong>Veilig gepubliceerd</strong>'));
 assert.equal((await api('save',{page:page.id,revision:richPublish.data.revision,changes:[{id:rich.members[0],value:'Oude editor'}]},admin)).r.status,409);
 let richHistory=(await api('history?page=index.html',null,admin)).data.history;assert.equal((await api('undo',{id:richHistory[0].id,revision:richPublish.data.revision},admin)).r.status,200);
 result=await api('users',{email:'editor@example.com',name:'Redacteur',role:'editor'},admin);assert.equal(result.r.status,201);const invite=result.data.token;
 assert.equal((await api('accept',{token:invite,password:'short'})).r.status,400);
 assert.equal((await api('accept',{token:invite,password:'EditorPassword123!'},editor)).r.status,200);
 assert.equal((await api('accept',{token:invite,password:'EditorPassword123!'})).r.status,400);
 assert.equal((await api('users',null,editor)).r.status,403);
 assert.equal((await api('users',{email:'evil@example.com',name:'Evil',role:'admin'},editor)).r.status,403);
 pages=(await api('pages',null,editor)).data;const global=pages.pages.find(p=>p.id==='header');const contact=global.fields.find(f=>f.text==='Contact');assert.equal((await api('save',{page:'header',revision:pages.revision,changes:[{id:contact.id,value:'Praktijkcontact'}]},editor)).r.status,200);
 assert((await (await fetch(base+'/over-ons/')).text()).includes('Praktijkcontact'));
 const users=(await api('users',null,admin)).data.users;const own=users.find(u=>u.email==='admin@example.com'),ed=users.find(u=>u.email==='editor@example.com');
 assert.equal((await api('user',{id:own.id,role:'editor',active:true},admin)).r.status,400);
 assert.equal((await api('user',{id:ed.id,role:'editor',active:false},admin)).r.status,200);
 assert.equal((await api('pages',null,editor)).r.status,401);
 let persistentPage=(await api('pages',null,admin)).data.pages.find(p=>p.id==='index.html');await api('draft',{page:persistentPage.id,version:persistentPage.draft.version,changes:[{id:title.id,value:'Bewaard concept na herstart'}]},admin);
 await stop();await start();assert.equal((await api('status')).data.setup,false);assert((await (await fetch(base+'/')).text()).includes('Praktijkcontact'));assert.equal((await api('login',{email:'admin@example.com',password:'TestPassword123!'},admin)).r.status,200);
 persistentPage=(await api('pages',null,admin)).data.pages.find(p=>p.id==='index.html');assert.equal(persistentPage.draft.changes[0].value,'Bewaard concept na herstart');assert(!(await(await fetch(base+'/')).text()).includes('Bewaard concept na herstart'));
 assert.equal((await api('password',{current:'wrong',password:'AnotherPassword123!'},admin)).r.status,400);
 assert.equal((await api('password',{current:'TestPassword123!',password:'AnotherPassword123!'},admin)).r.status,200);
 assert.equal((await api('logout',{},admin)).r.status,200);assert.equal((await api('pages',null,admin)).r.status,401);
 const attempts=[];for(let i=0;i<9;i++)attempts.push((await api('login',{email:'nobody@example.com',password:'invalid'})).r.status);assert.equal(attempts.at(-1),429);
 const ui=await fetch(base+'/beheer');assert.equal(ui.status,200);assert.match(ui.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.match(ui.headers.get('x-robots-tag'),/noindex/);
 }finally{if(child&&child.exitCode===null)await stop();await rm(dir,{recursive:true,force:true});}
});
