import {addSemantic} from './semantic.mjs';
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
  const page={id:relative,title:relative==='index.html'?'Homepage':title,url,fields:[],blocks:[]};let area='',skip='',tag='',heading='Inhoud';const counts=new Map(), sections=[], blockMap=new Map();
  const output=html.replace(/<!--[\s\S]*?-->|<[^>]*>|[^<]+/g,token=>{
   if(token[0]==='<'){
    const m=token.match(/^<(\/)?([a-z][a-z0-9]*)\b/i);if(!m)return token;const name=m[2].toLowerCase(),close=!!m[1];
    if(skip){if(close&&name===skip)skip='';return token;}
    if(!close&&['script','style','svg','head'].includes(name)){skip=name;return token;}
    if(['header','footer','main'].includes(name)){area=close?'':name;}
    if(area==='main'&&name==='section'){
     if(close)sections.pop();
     else {const outer=sections[0];const id=outer?.id||'block-'+(page.blocks.length+1);let block=outer;
      if(!block){const key=(token.match(/\bid=["']([^"']+)/)||[])[1];const cls=token.match(/\bclass=["']([^"']+)/)?.[1]||'';const names={aanbod:'Behandelaanbod',wachttijden:'Wachttijden',team:'Onze behandelaren',praktisch:'Praktische informatie',contact:'Contact en praktijkgegevens'};
       block={id,title:names[key]||(cls.includes('page-hero')?'Paginakop':cls.includes('hero')?'Introductie':cls.includes('welcome')?'Welkom':cls.includes('work')?'Onze werkwijze':'')};page.blocks.push(block);blockMap.set(id,block);}
      sections.push(block);
     }
    }
    if(!close)tag=name;
    return token;
   }
   if(skip||!area||!/[\p{L}\p{N}]/u.test(token))return token;
   const prefix=token.match(/^\s*/)[0],suffix=token.match(/\s*$/)[0];const raw=token.trim();if(!raw)return token;
   const text=decode(raw); if(/^h[1-6]$/.test(tag))heading=text;
   const scope=area==='main'?relative:area;
   const signature=scope+'\0'+tag+'\0'+text;const count=(counts.get(signature)||0)+1;counts.set(signature,count);
   const id=createHash('sha256').update(signature+'\0'+count).digest('hex').slice(0,24);
   let block=sections[0];
   if(area==='main'&&!block){const key='text-'+createHash('sha256').update(heading).digest('hex').slice(0,12);block=blockMap.get(key);if(!block){block={id:key,title:relative==='index.html'&&heading==='Jouw verhaal.'?'Kernpunten':heading==='Inhoud'?'Algemene teksten':heading};blockMap.set(key,block);page.blocks.push(block);}}
   if(block&&!block.title&&/^h[12]$/.test(tag))block.title=text;
   const field={id,text,tag,section:area==='main'?heading:area==='header'?'Navigatie':'Voettekst',...(area==='main'?{block:block.id}:{})};
   if(!fields.has(id)){fields.set(id,field);if(area!=='main')globalPages[area].fields.push(field);}
   if(area==='main')page.fields.push(field);
   return prefix+'<!--cms:'+id+'-->'+raw+'<!--/cms-->'+suffix;
  });
  for(const block of page.blocks)if(!block.title)block.title='Tekstblok';templates.set(relative,output); pages.push(page);
 }
 await walk(root);pages.sort((a,b)=>a.url==='/'?-1:b.url==='/'?1:a.title.localeCompare(b.title,'nl'));
 // A dedicated editor reuses existing field IDs on both public pages.
 const home=pages.find(p=>p.id==='index.html'), waits=pages.find(p=>p.id==='praktisch/wachttijden/index.html');
 const homeBlock=home.blocks.find(b=>b.title==='Wachttijden');
 const sources=[home.fields.filter(f=>f.block===homeBlock.id),waits.fields];
 const controls=[];
 function pair(section,tag,index,label,group){const selected=sources.map(list=>list.filter(f=>f.section===section&&f.tag===tag)[index]);if(selected.some(f=>!f))throw new Error('Missing waiting-time field: '+label);controls.push({label,group,ids:selected.map(f=>f.id)});}
 pair('Ruud van Roosmalen','strong',0,'Aantal / status','Ruud van Roosmalen');pair('Ruud van Roosmalen','span',1,'Eenheid','Ruud van Roosmalen');
 pair('Tessa van Roosmalen','strong',0,'Basis GGZ · aantal / status','Tessa van Roosmalen');pair('Tessa van Roosmalen','span',1,'Basis GGZ · eenheid','Tessa van Roosmalen');
 pair('Tessa van Roosmalen','strong',1,'Jeugd GGZ · aantal / status','Tessa van Roosmalen');pair('Tessa van Roosmalen','span',3,'Jeugd GGZ · eenheid','Tessa van Roosmalen');
 pair('Geertje Zijlstra','span',0,'Status','Geertje Zijlstra');pair('Geertje Zijlstra','p',0,'Toelichting','Geertje Zijlstra');
 for(const [i,list] of sources.entries()){const update=list.find(f=>f.text.startsWith('Laatste update:'));controls.push({label:i===0?'Datum en toelichting homepage':'Datum en toelichting wachttijdenpagina',group:'Laatste update',ids:[update.id]});}
 const waiting={id:'waiting',title:'Wachttijden beheren',url:'/praktisch/wachttijden/',dedicated:true,controls,fields:[...new Set(controls.flatMap(c=>c.ids))].map(id=>fields.get(id))};
 const result={pages:[...pages,...Object.values(globalPages),waiting],templates,fields};
 return {...result,...addSemantic(result)};
}
