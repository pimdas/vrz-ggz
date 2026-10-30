import {DatabaseSync,backup} from 'node:sqlite';
import {readdir,unlink} from 'node:fs/promises';
import {mkdirSync,readFileSync} from 'node:fs';
import {randomBytes,createHash,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import path from 'node:path';
const scrypt=promisify(scryptCallback), digest=s=>createHash('sha256').update(s).digest('hex'), token=()=>randomBytes(32).toString('hex');
const now=()=>Date.now();
const fail=(status,message)=>{const e=new Error(message);e.status=status;throw e;};
export async function createAdmin(content){
 const dir=process.env.DATA_DIR||'./data';mkdirSync(dir,{recursive:true,mode:0o700});
 const db=new DatabaseSync(path.join(dir,'beheer.sqlite'));db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,role TEXT NOT NULL,password TEXT,active INTEGER NOT NULL DEFAULT 1,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id INTEGER REFERENCES users(id),csrf TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS invites(hash TEXT PRIMARY KEY,user_id INTEGER REFERENCES users(id),expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS edits(id TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS drafts(page TEXT PRIMARY KEY,changes TEXT NOT NULL,version INTEGER NOT NULL,user_id INTEGER REFERENCES users(id),updated INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS revisions(id INTEGER PRIMARY KEY,user_id INTEGER REFERENCES users(id),page TEXT NOT NULL,changes TEXT NOT NULL,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,user_id INTEGER,action TEXT NOT NULL,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS throttles(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);`);
 async function dailyBackup(){
  if(process.env.NODE_ENV!=='production')return;
  try{const day=new Date().toISOString().slice(0,10);await backup(db,path.join(dir,'backup-'+day+'.sqlite'));const files=(await readdir(dir)).filter(f=>/^backup-\d{4}-\d{2}-\d{2}\.sqlite$/.test(f)).sort();for(const file of files.slice(0,-14))await unlink(path.join(dir,file));}catch(e){console.error('Database backup failed:',e.message);}
 }
 await dailyBackup();
 const timer=setInterval(()=>{run('DELETE FROM sessions WHERE expires<?',now());run('DELETE FROM invites WHERE expires<?',now());run('DELETE FROM throttles WHERE expires<?',now());void dailyBackup();},86400000);timer.unref();
 const q=(sql,...a)=>db.prepare(sql).get(...a),all=(sql,...a)=>db.prepare(sql).all(...a),run=(sql,...a)=>db.prepare(sql).run(...a);
 const audit=(id,action)=>run('INSERT INTO audit(user_id,action,created) VALUES(?,?,?)',id,action,now());
 const safeUser=u=>({id:u.id,email:u.email,name:u.name,role:u.role,active:!!u.active,ready:!!u.password});
 const values=()=>new Map(all('SELECT id,value FROM edits').map(r=>[r.id,r.value]));
 const shadowed=(id,v)=>[...content.units.values()].some(unit=>unit.members?.includes(id)&&v.has(unit.id));
 const effective=(id,v)=>content.value(id,v);
 const normalize=(id,value)=>{try{return content.normalize(id,value);}catch(e){fail(400,e.message);}};
 const draftFor=page=>{const row=q('SELECT d.*,u.name FROM drafts d LEFT JOIN users u ON u.id=d.user_id WHERE page=?',page);return row?{version:row.version,updated:row.updated,name:row.name,changes:JSON.parse(row.changes).map(({id,value})=>({id,value}))}:{version:0,changes:[]};};
 const revision=()=>q('SELECT COALESCE(MAX(id),0) AS id FROM revisions').id;
 async function hashPassword(p){if(typeof p!=='string'||p.length<12||p.length>256)fail(400,'Gebruik een wachtwoord van minimaal 12 en maximaal 256 tekens.');const salt=token();return salt+':'+Buffer.from(await scrypt(p,salt,64)).toString('hex');}
 const dummySalt=token();const dummyHash=await hashPassword(token());
 async function verify(p,h){const [salt,key]=(h||dummyHash).split(':');const test=await scrypt(String(p||'').slice(0,256),salt||dummySalt,64);return !!h&&timingSafeEqual(Buffer.from(key,'hex'),test);}
 function limit(key,max=8){const r=q('SELECT * FROM throttles WHERE key=?',key);if(r&&r.expires>now()&&r.count>=max)fail(429,'Te veel pogingen. Probeer het over 15 minuten opnieuw.');run('INSERT INTO throttles(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<? THEN 1 ELSE count+1 END,expires=CASE WHEN expires<? THEN excluded.expires ELSE expires END',key,now()+900000,now(),now());}
 function session(req){const value=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('vrz_session='))?.slice(12);if(!value)return null;const row=q('SELECT s.*,u.email,u.name,u.role,u.active,u.id AS uid,u.password FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=? AND s.expires>? AND u.active=1',digest(value),now());return row?{...row,id:row.uid}:null;}
 const secure=process.env.NODE_ENV==='production';
 function setSession(res,user){const key=token(),csrf=token();run('DELETE FROM sessions WHERE expires<?',now());run('INSERT INTO sessions(hash,user_id,csrf,expires) VALUES(?,?,?,?)',digest(key),user.id,csrf,now()+28800000);res.setHeader('Set-Cookie',`vrz_session=${key}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${secure?'; Secure':''}`);return csrf;}
 function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}
 function origin(req){const expected=process.env.APP_URL||`http://${req.headers.host}`;if(req.headers.origin!==expected)fail(403,'Ongeldige herkomst van het verzoek.');}
 async function body(req){if(!String(req.headers['content-type']||'').startsWith('application/json'))fail(415,'JSON vereist.');let raw='';for await(const part of req){raw+=part;if(Buffer.byteLength(raw)>600000)fail(413,'Het verzoek is te groot.');}try{return JSON.parse(raw||'{}');}catch{fail(400,'Ongeldig verzoek.');}}
 function invite(id){const key=token();run('DELETE FROM invites WHERE user_id=?',id);run('INSERT INTO invites(hash,user_id,expires) VALUES(?,?,?)',digest(key),id,now()+172800000);return key;}
 const email=e=>{if(typeof e!=='string'||!/^\S+@\S+\.\S+$/.test(e)||e.length>254)fail(400,'Vul een geldig e-mailadres in.');return e.toLowerCase().trim();};
 const name=n=>{if(typeof n!=='string'||!n.trim()||n.length>100)fail(400,'Vul een naam in (maximaal 100 tekens).');return n.trim();};
 function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}
 return {values,db,async handle(req,res,url){
  if(!url.pathname.startsWith('/beheer')&&!url.pathname.startsWith('/api/beheer/'))return false;
  try{
   res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');
   if(url.pathname==='/beheer'||url.pathname==='/beheer/'){
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(readFileSync('beheer/index.html'));return true;
   }
   if(['/beheer/app.js','/beheer/style.css','/beheer/semantic.js','/beheer/preview.css'].includes(url.pathname)){res.writeHead(200,{'Content-Type':url.pathname.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8','X-Content-Type-Options':'nosniff'});res.end(readFileSync('beheer/'+url.pathname.split('/').pop()));return true;}
   if(!url.pathname.startsWith('/api/beheer/'))fail(404,'Niet gevonden.');
   const route=url.pathname.slice(12);const u=session(req);const isWrite=!['GET','HEAD'].includes(req.method);let b={};
   if(isWrite){origin(req);b=await body(req);}
   if(route==='status'&&req.method==='GET'){json(res,200,{setup:!q('SELECT id FROM users LIMIT 1'),setupEnabled:!!process.env.BOOTSTRAP_TOKEN,user:u?safeUser(u):null,csrf:u?.csrf});return true;}
   if(route==='setup'&&req.method==='POST'){
    limit('setup:'+digest(req.socket.remoteAddress||''),5);
    if(q('SELECT id FROM users LIMIT 1')||!process.env.BOOTSTRAP_TOKEN||typeof b.token!=='string'||digest(b.token)!==digest(process.env.BOOTSTRAP_TOKEN))fail(403,'Deze eenmalige activatielink is niet geldig.');
    const e=email(b.email),n=name(b.name),password=await hashPassword(b.password);
    const id=transaction(()=>{if(q('SELECT id FROM users LIMIT 1'))fail(409,'Het eerste account is al aangemaakt.');return Number(run('INSERT INTO users(email,name,role,password,created) VALUES(?,?,?,?,?)',e,n,'admin',password,now()).lastInsertRowid);});
    audit(id,'Eerste beheerder aangemaakt');json(res,201,{csrf:setSession(res,{id}),user:safeUser(q('SELECT * FROM users WHERE id=?',id))});return true;
   }
   if(route==='login'&&req.method==='POST'){
    const e=String(b.email||'').toLowerCase().trim();limit('login-ip:'+digest(req.socket.remoteAddress||''),40);limit('login-email:'+digest(e));
    const candidate=q('SELECT * FROM users WHERE email=?',e);const valid=await verify(b.password,candidate?.password);
    if(!candidate?.active||!valid)fail(401,'E-mailadres of wachtwoord is niet juist.');run('DELETE FROM throttles WHERE key=?','login-email:'+digest(e));audit(candidate.id,'Ingelogd');json(res,200,{user:safeUser(candidate),csrf:setSession(res,candidate)});return true;
   }
   if(route==='accept'&&req.method==='POST'){
    limit('accept:'+digest(req.socket.remoteAddress||''),15);const hash=digest(String(b.token||''));const inv=q('SELECT i.*,u.active FROM invites i JOIN users u ON i.user_id=u.id WHERE i.hash=? AND i.expires>?',hash,now());if(!inv||!inv.active)fail(400,'Deze uitnodiging is verlopen of al gebruikt. Vraag een nieuwe link aan de beheerder.');
    const password=await hashPassword(b.password);transaction(()=>{if(!q('SELECT hash FROM invites WHERE hash=? AND expires>?',hash,now()))fail(409,'Deze link is al gebruikt.');run('UPDATE users SET password=? WHERE id=?',password,inv.user_id);run('DELETE FROM invites WHERE user_id=?',inv.user_id);run('DELETE FROM sessions WHERE user_id=?',inv.user_id);});
    audit(inv.user_id,'Wachtwoord ingesteld');const user=q('SELECT * FROM users WHERE id=?',inv.user_id);json(res,200,{user:safeUser(user),csrf:setSession(res,user)});return true;
   }
   if(!u)fail(401,'Log opnieuw in om verder te gaan.');if(isWrite&&req.headers['x-csrf-token']!==u.csrf)fail(403,'Ongeldig beveiligingstoken. Herlaad de pagina.');
   if(route==='logout'&&req.method==='POST'){run('DELETE FROM sessions WHERE hash=?',u.hash);res.setHeader('Set-Cookie',`vrz_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure?'; Secure':''}`);json(res,200,{ok:true});return true;}
   if(route==='password'&&req.method==='POST'){if(!await verify(b.current,u.password))fail(400,'Je huidige wachtwoord is niet juist.');const hashed=await hashPassword(b.password);run('UPDATE users SET password=? WHERE id=?',hashed,u.id);run('DELETE FROM sessions WHERE user_id=?',u.id);run('DELETE FROM invites WHERE user_id=?',u.id);audit(u.id,'Eigen wachtwoord gewijzigd');json(res,200,{csrf:setSession(res,u)});return true;}
   if(route==='pages'&&req.method==='GET'){const v=values();json(res,200,{revision:revision(),pages:content.pages.map(p=>({...p,...(p.semantic?{draft:draftFor(p.id)}:{}),fields:p.fields.map(f=>({...f,value:effective(f.id,v)}))}))});return true;}
   if(route==='waiting'&&req.method==='GET'){json(res,200,{revision:revision(),config:content.waiting.read(values()),names:content.waiting.names});return true;}
   if(route==='waiting'&&req.method==='POST'){
    const v=values(),before=content.value(content.waiting.key,v);let config;
    try{config=content.waiting.validate(b.config,content.waiting.read(v));}catch(e){fail(400,e.message);}
    const current=content.waiting.read(v);const same=JSON.stringify(config.people)===JSON.stringify(current.people);
    if(same){json(res,200,{saved:0,revision:revision()});return true;}
    config.updated=new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Amsterdam'}).format(new Date());
    const after=JSON.stringify(config);
    transaction(()=>{if(b.revision!==revision())fail(409,'De wachttijden zijn ondertussen gewijzigd. Herlaad de pagina voordat je opslaat.');run('INSERT INTO edits(id,value) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value',content.waiting.key,after);run('INSERT INTO revisions(user_id,page,changes,created) VALUES(?,?,?,?)',u.id,'waiting',JSON.stringify([{id:content.waiting.key,before,after}]),now());audit(u.id,'Wachttijden en aanmeldstop bijgewerkt');});
    json(res,200,{saved:1,revision:revision()});return true;
   }
   if(route==='preview'&&req.method==='POST'){
    const page=content.pages.find(p=>p.id===b.page);if(!page?.semantic||!Array.isArray(b.changes)||b.changes.length>1000)fail(400,'Ongeldige pagina.');const allowed=new Set(page.fields.map(f=>f.id)),v=values();
    for(const c of b.changes){if(!allowed.has(c.id)||typeof c.value!=='string'||c.value.length>20000)fail(400,'Ongeldig tekstveld.');v.set(c.id,normalize(c.id,c.value));}
    const focus=allowed.has(b.focus)?b.focus:null;let html=content.render(page.id,v,focus);html=html.replace('</head>','<link rel="stylesheet" href="/beheer/preview.css"></head>');json(res,200,{html});return true;
   }
   if(route==='draft'&&req.method==='POST'){
    const page=content.pages.find(p=>p.id===b.page);if(!page?.semantic||!Array.isArray(b.changes)||b.changes.length>1000)fail(400,'Ongeldige pagina.');const allowed=new Set(page.fields.map(f=>f.id)),seen=new Set();
    transaction(()=>{const row=q('SELECT * FROM drafts WHERE page=?',page.id);if((row?.version||0)!==b.version)fail(409,'Dit concept is ondertussen door iemand anders gewijzigd. Kopieer je tekst en herlaad de pagina.');const v=values(),old=new Map(JSON.parse(row?.changes||'[]').map(c=>[c.id,c]));
     const changes=b.changes.map(c=>{if(!allowed.has(c.id)||typeof c.value!=='string'||c.value.length>20000||seen.has(c.id))fail(400,'Ongeldig tekstveld.');seen.add(c.id);const before=old.get(c.id)?.before??effective(c.id,v);if(before!==effective(c.id,v))fail(409,'De gepubliceerde tekst is ondertussen gewijzigd. Herlaad de pagina voordat je verdergaat.');return {id:c.id,value:normalize(c.id,c.value),before};}).filter(c=>c.value!==c.before);
     run('INSERT INTO drafts(page,changes,version,user_id,updated) VALUES(?,?,?,?,?) ON CONFLICT(page) DO UPDATE SET changes=excluded.changes,version=excluded.version,user_id=excluded.user_id,updated=excluded.updated',page.id,JSON.stringify(changes),(row?.version||0)+1,u.id,now());
    });json(res,200,{draft:draftFor(page.id)});return true;
   }
   if(route==='publish'&&req.method==='POST'){
    const page=content.pages.find(p=>p.id===b.page);if(!page?.semantic)fail(400,'Ongeldige pagina.');let count=0;
    transaction(()=>{const row=q('SELECT * FROM drafts WHERE page=?',page.id);if(!row||row.version!==b.version)fail(409,'Het concept is gewijzigd. Herlaad de pagina.');const v=values();const changes=JSON.parse(row.changes).map(c=>{if(!content.fields.has(c.id)||effective(c.id,v)!==c.before)fail(409,'De live tekst is ondertussen gewijzigd. Herlaad de pagina.');return {id:c.id,before:c.before,after:c.value};});count=changes.length;
     if(!count)return;for(const c of changes)run('INSERT INTO edits(id,value) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value',c.id,c.after);run('INSERT INTO revisions(user_id,page,changes,created) VALUES(?,?,?,?)',u.id,page.id,JSON.stringify(changes),now());run("UPDATE drafts SET changes='[]',version=version+1,user_id=?,updated=? WHERE page=?",u.id,now(),page.id);audit(u.id,'Concept gepubliceerd: '+page.title);
    });json(res,200,{saved:count,revision:revision(),draft:draftFor(page.id)});return true;
   }
   if(route==='save'&&req.method==='POST'){
    const page=content.pages.find(p=>p.id===b.page);if(!page||!Array.isArray(b.changes)||b.changes.length>1000)fail(400,'Ongeldige pagina.');const allowed=new Set(page.fields.map(f=>f.id)),seen=new Set();const v=values();
    const changes=b.changes.map(c=>{if(!allowed.has(c.id)||seen.has(c.id)||typeof c.value!=='string'||c.value.length>20000)fail(400,'Ongeldig tekstveld.');seen.add(c.id);if(v.get(content.waiting.key)&&content.waiting.legacyIds.has(c.id))fail(409,'Gebruik het menu Wachttijden om deze gegevens aan te passen.');if(shadowed(c.id,v))fail(409,'Deze tekst gebruikt de nieuwe editor. Herlaad de pagina om verder te gaan.');return {id:c.id,before:effective(c.id,v),after:normalize(c.id,c.value)};}).filter(c=>c.before!==c.after);
    if(page.id==='waiting'&&changes.length){const date=new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Amsterdam'}).format(new Date());for(const control of page.controls.filter(c=>c.group==='Laatste update'))for(const id of control.ids){if(seen.has(id))continue;const before=effective(id,v),after=before.replace(/^Laatste update:[^·]*/,`Laatste update: ${date} `);if(before!==after)changes.push({id,before,after});}}
    if(!changes.length){json(res,200,{revision:revision(),saved:0});return true;}
    transaction(()=>{if(b.revision!==revision())fail(409,'Iemand heeft ondertussen teksten gewijzigd. Kopieer je wijziging en herlaad de pagina.');for(const c of changes)run('INSERT INTO edits(id,value) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value',c.id,c.after);run('INSERT INTO revisions(user_id,page,changes,created) VALUES(?,?,?,?)',u.id,page.id,JSON.stringify(changes),now());audit(u.id,`${changes.length} tekst(en) gepubliceerd: ${page.title}`);});json(res,200,{revision:revision(),saved:changes.length});return true;
   }
   if(route==='history'&&req.method==='GET'){const p=content.pages.find(p=>p.id===url.searchParams.get('page'));if(!p)fail(400,'Ongeldige pagina.');json(res,200,{history:all('SELECT r.id,r.created,u.name FROM revisions r JOIN users u ON u.id=r.user_id WHERE r.page=? ORDER BY r.id DESC LIMIT 30',p.id)});return true;}
   if(route==='undo'&&req.method==='POST'){
    transaction(()=>{if(b.revision!==revision())fail(409,'De inhoud is ondertussen gewijzigd. Herlaad de pagina.');const row=q('SELECT * FROM revisions WHERE id=?',b.id);if(!row)fail(404,'Versie niet gevonden.');const v=values(),changes=JSON.parse(row.changes);for(const c of changes){if(!content.fields.has(c.id)||(v.get(content.waiting.key)&&content.waiting.legacyIds.has(c.id))||shadowed(c.id,v)||effective(c.id,v)!==c.after)fail(409,'Deze teksten zijn later opnieuw gewijzigd. Ongedaan maken is niet meer mogelijk.');}
     const inverse=changes.map(c=>({id:c.id,before:c.after,after:c.before}));for(const c of inverse)run('INSERT INTO edits(id,value) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value',c.id,c.after);run('INSERT INTO revisions(user_id,page,changes,created) VALUES(?,?,?,?)',u.id,row.page,JSON.stringify(inverse),now());audit(u.id,'Wijziging ongedaan gemaakt');});json(res,200,{revision:revision()});return true;
   }
   if(route==='users'&&req.method==='GET'){if(u.role!=='admin')fail(403,'Alleen beheerders kunnen gebruikers beheren.');json(res,200,{users:all('SELECT * FROM users ORDER BY name').map(safeUser)});return true;}
   if(route==='users'&&req.method==='POST'){
    if(u.role!=='admin')fail(403,'Alleen beheerders kunnen gebruikers beheren.');const e=email(b.email),n=name(b.name);if(!['admin','editor'].includes(b.role))fail(400,'Ongeldige rol.');if(q('SELECT id FROM users WHERE email=?',e))fail(409,'Dit e-mailadres heeft al een account.');const id=Number(run('INSERT INTO users(email,name,role,created) VALUES(?,?,?,?)',e,n,b.role,now()).lastInsertRowid);const key=invite(id);audit(u.id,'Gebruiker toegevoegd: '+e);json(res,201,{token:key});return true;
   }
   if(route==='user'&&req.method==='POST'){
    if(u.role!=='admin')fail(403,'Alleen beheerders kunnen gebruikers beheren.');const target=q('SELECT * FROM users WHERE id=?',b.id);if(!target)fail(404,'Gebruiker niet gevonden.');
    if(b.action==='reset'){if(target.id===u.id)fail(400,'Gebruik voor je eigen account de wachtwoordinstellingen.');if(!target.active)fail(400,'Activeer het account eerst.');const key=invite(target.id);run('DELETE FROM sessions WHERE user_id=?',target.id);audit(u.id,'Nieuwe wachtwoordlink: '+target.email);json(res,200,{token:key});return true;}
    if(!['admin','editor'].includes(b.role)||typeof b.active!=='boolean')fail(400,'Ongeldige instellingen.');
    if(target.id===u.id&&(b.role!=='admin'||!b.active))fail(400,'Je kunt je eigen beheerdersrechten niet intrekken.');
    if(target.role==='admin'&&target.active&&(!b.active||b.role!=='admin')&&q("SELECT COUNT(*) AS count FROM users WHERE role='admin' AND active=1").count<=1)fail(400,'Er moet minimaal één actieve beheerder blijven.');
    run('UPDATE users SET role=?,active=? WHERE id=?',b.role,b.active?1:0,target.id);run('DELETE FROM sessions WHERE user_id=?',target.id);if(!b.active)run('DELETE FROM invites WHERE user_id=?',target.id);audit(u.id,'Account bijgewerkt: '+target.email);json(res,200,{ok:true});return true;
   }
   if(route==='audit'&&req.method==='GET'){if(u.role!=='admin')fail(403,'Geen toegang.');json(res,200,{audit:all('SELECT a.action,a.created,u.name FROM audit a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 100')});return true;}
   fail(404,'Niet gevonden.');
  }catch(e){json(res,e.status||500,{error:e.status?e.message:'Er ging iets mis. Probeer het opnieuw.'});if(!e.status)console.error('Beheer request failed:',e.message);}
  return true;
 }};
}
