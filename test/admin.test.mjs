import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {compileContent} from '../lib/content.mjs';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
test('Content compiler preserves the complete public appearance',async()=>{
 const c=await compileContent(path.resolve('public'));assert.equal(c.pages.filter(p=>!['header','footer','waiting'].includes(p.id)).length,20);
 for(const [file,html] of c.templates){const result=c.render(file,new Map());assert.equal(result,html.replace(/<!--cms:[a-f0-9]+-->|<!--\/cms-->/g,''));assert(!result.includes('<!--cms:'));}
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
 let savedWait=await api('save',{page:'waiting',revision:waitPages.revision,changes:ids.map(id=>({id,value:'17'}))},admin);assert.equal(savedWait.data.saved,2);
 for(const route of ['/','/praktisch/wachttijden/'])assert.match(await(await fetch(base+route)).text(),/<strong>17 /);
 const wh=(await api('history?page=waiting',null,admin)).data.history;assert.equal(wh.length,1);assert.equal((await api('undo',{id:wh[0].id,revision:savedWait.data.revision},admin)).r.status,200);
 for(const route of ['/','/praktisch/wachttijden/'])assert.match(await(await fetch(base+route)).text(),/<strong>6 /);
 let pages=(await api('pages',null,admin)).data;let page=pages.pages.find(p=>p.id==='index.html');const field=page.fields.find(f=>f.tag==='h2');const original=field.value;
 result=await api('save',{page:page.id,revision:pages.revision,changes:[{id:field.id,value:'Nieuw verhaal <script>alert(1)</script>'}]},admin);assert.equal(result.r.status,200);assert.equal(result.data.saved,1);let rev=result.data.revision;
 let html=await (await fetch(base+'/')).text();assert(html.includes('Nieuw verhaal &lt;script&gt;'));assert(!html.includes('Nieuw verhaal <script>'));
 assert.equal((await api('save',{page:page.id,revision:pages.revision,changes:[{id:field.id,value:'Stale'}]},admin)).r.status,409);
 assert.equal((await api('save',{page:page.id,revision:rev,changes:[{id:'invalid',value:'bad'}]},admin)).r.status,400);
 let history=(await api('history?page=index.html',null,admin)).data.history;assert.equal(history.length,1);
 assert.equal((await api('undo',{id:history[0].id,revision:rev},admin)).r.status,200);assert((await (await fetch(base+'/')).text()).includes(original));
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
 await stop();await start();assert.equal((await api('status')).data.setup,false);assert((await (await fetch(base+'/')).text()).includes('Praktijkcontact'));assert.equal((await api('login',{email:'admin@example.com',password:'TestPassword123!'},admin)).r.status,200);
 assert.equal((await api('password',{current:'wrong',password:'AnotherPassword123!'},admin)).r.status,400);
 assert.equal((await api('password',{current:'TestPassword123!',password:'AnotherPassword123!'},admin)).r.status,200);
 assert.equal((await api('logout',{},admin)).r.status,200);assert.equal((await api('pages',null,admin)).r.status,401);
 const attempts=[];for(let i=0;i<9;i++)attempts.push((await api('login',{email:'nobody@example.com',password:'invalid'})).r.status);assert.equal(attempts.at(-1),429);
 const ui=await fetch(base+'/beheer');assert.equal(ui.status,200);assert.match(ui.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.match(ui.headers.get('x-robots-tag'),/noindex/);
 }finally{if(child&&child.exitCode===null)await stop();await rm(dir,{recursive:true,force:true});}
});
