import http from 'node:http';
import {createHash} from 'node:crypto';
import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import {compileContent} from './lib/content.mjs';
import {createAdmin} from './lib/admin.mjs';
const root = path.resolve('public');
const compiled=await compileContent(root);
// Content-based URLs invalidate old browser caches on public pages and admin previews.
const styleVersions=new Map(await Promise.all(['site.css','friendly.css'].map(async name=>{
 const file='/assets/'+name;const hash=createHash('sha256').update(await readFile(path.join(root,'assets',name))).digest('hex').slice(0,12);return [file,hash];
})));
const content={...compiled,render(...args){const html=compiled.render(...args);return html?.replace(/href="(\/assets\/[^"?]+\.css)(?:\?[^" ]*)?"/g,(all,file)=>styleVersions.has(file)?'href="'+file+'?v='+styleVersions.get(file)+'"':all);}};
const admin=await createAdmin(content);
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff','.pdf':'application/pdf'};
http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if(await admin.handle(req,res,url))return;
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'});res.end();return;}
    if(url.pathname==='/robots.txt'){res.writeHead(200,{'Content-Type':'text/plain'});res.end('User-agent: *\nDisallow: /beheer\nDisallow: /api/\n');return;}
    if(url.pathname === '/healthz') {res.writeHead(200);res.end('ok');return;}
    let file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if(file !== root && !file.startsWith(root + path.sep)) {res.writeHead(403);res.end();return;}
    if((await stat(file)).isDirectory()) {
      if(!url.pathname.endsWith('/')) {res.writeHead(308,{Location:url.pathname+'/'+url.search});res.end();return;}
      file=path.join(file,'index.html');
    }
    const relative=path.relative(root,file).replaceAll(path.sep,'/');
    const data=content.templates.has(relative)?Buffer.from(content.render(relative,admin.values())):await readFile(file);
    res.writeHead(200,{'Content-Type':types[path.extname(file)] || 'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':['.html','.css'].includes(path.extname(file))?'no-cache':'public, max-age=3600'});
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Pagina niet gevonden');}
}).listen(Number(process.env.PORT || (process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port')+1] : '') || 3000),'0.0.0.0');
