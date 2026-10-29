import {readdir, readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
export const escape = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const decode = s => s.replace(/&#(x[\da-f]+|\d+);|&(amp|lt|gt|quot|apos|nbsp);/gi,(m,n,k)=>n?String.fromCodePoint(parseInt(n[0].toLowerCase()==='x'?n.slice(1):n,n[0].toLowerCase()==='x'?16:10)):({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:'\u00a0'}[k.toLowerCase()]));
export async function compileContent(root) {
 const pages=[], templates=new Map(), fields=new Map();
 const globalPages={header:{id:'header',title:'Menu en navigatie',url:'/',fields:[]},footer:{id:'footer',title:'Voettekst',url:'/',fields:[]}};
 async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory()) await walk(f);else if(e.name==='index.html') await compile(f);}}
 async function compile(file){
  const html=await readFile(file,'utf8');const relative=path.relative(root,file).replaceAll(path.sep,'/');
  const url='/'+relative.replace(/index\.html$/,''); const title=decode((html.match(/<title>(.*?)<\/title>/s)||[])[1]||url).split(' | ')[0];
  const page={id:relative,title:relative==='index.html'?'Homepage':title,url,fields:[]};let area='',skip='',tag='',heading='Inhoud';const counts=new Map();
  const output=html.replace(/<!--[\s\S]*?-->|<[^>]*>|[^<]+/g,token=>{
   if(token[0]==='<'){
    const m=token.match(/^<(\/)?([a-z][a-z0-9]*)\b/i);if(!m)return token;const name=m[2].toLowerCase(),close=!!m[1];
    if(skip){if(close&&name===skip)skip='';return token;}
    if(!close&&['script','style','svg','head'].includes(name)){skip=name;return token;}
    if(['header','footer','main'].includes(name)){area=close?'':name;}
    if(!close)tag=name;
    return token;
   }
   if(skip||!area||!/[\p{L}\p{N}]/u.test(token))return token;
   const prefix=token.match(/^\s*/)[0],suffix=token.match(/\s*$/)[0];const raw=token.trim();if(!raw)return token;
   const text=decode(raw); if(/^h[1-6]$/.test(tag))heading=text;
   const scope=area==='main'?relative:area;
   const signature=scope+'\0'+tag+'\0'+text;const count=(counts.get(signature)||0)+1;counts.set(signature,count);
   const id=createHash('sha256').update(signature+'\0'+count).digest('hex').slice(0,24);
   const field={id,text,tag,section:area==='main'?heading:area==='header'?'Navigatie':'Voettekst'};
   if(!fields.has(id)){fields.set(id,field);if(area!=='main')globalPages[area].fields.push(field);}
   if(area==='main')page.fields.push(field);
   return prefix+'<!--cms:'+id+'-->'+raw+'<!--/cms-->'+suffix;
  });
  templates.set(relative,output); pages.push(page);
 }
 await walk(root);pages.sort((a,b)=>a.url==='/'?-1:b.url==='/'?1:a.title.localeCompare(b.title,'nl'));
 return {pages:[...pages,...Object.values(globalPages)],templates,fields,render(relative,values){return templates.get(relative)?.replace(/<!--cms:([a-f0-9]+)-->([\s\S]*?)<!--\/cms-->/g,(_,id,original)=>values.has(id)?escape(values.get(id)).replaceAll('\n','<br>'):original);}};
}
