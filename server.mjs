import http from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('public');
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff','.pdf':'application/pdf'};
http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if(url.pathname === '/healthz') {res.writeHead(200);res.end('ok');return;}
    let file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if(file !== root && !file.startsWith(root + path.sep)) {res.writeHead(403);res.end();return;}
    if((await stat(file)).isDirectory()) {
      if(!url.pathname.endsWith('/')) {res.writeHead(308,{Location:url.pathname+'/'+url.search});res.end();return;}
      file=path.join(file,'index.html');
    }
    const data=await readFile(file);
    res.writeHead(200,{'Content-Type':types[path.extname(file)] || 'application/octet-stream','X-Content-Type-Options':'nosniff'});
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Pagina niet gevonden');}
}).listen(Number(process.env.PORT || 3000),'0.0.0.0');
