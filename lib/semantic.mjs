import {createHash} from 'node:crypto';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const decode=s=>s.replace(/&#(x[\da-f]+|\d+);|&(amp|lt|gt|quot|apos|nbsp);/gi,(m,n,k)=>n?String.fromCodePoint(parseInt(n[0].toLowerCase()==='x'?n.slice(1):n,n[0].toLowerCase()==='x'?16:10)):({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:'\u00a0'}[k.toLowerCase()]));
export function safeURL(value){const url=String(value).trim();if(!url)return '#';if(/[\u0000-\u0020\u007f<>"'\\]/.test(url)||url.startsWith('//')||!(/^(https?:\/\/|mailto:|tel:|\/|#)/i.test(url)))throw new Error('Gebruik een veilige link: https://, /pagina/, mailto: of tel:.');return url;}
export function sanitizeRich(value){
 const allowed=new Set(['p','br','strong','em','b','i','ul','ol','li','h3','a']);let out='',stack=[];
 for(const token of String(value).match(/<[^>]*>|[^<]+|</g)||[]){if(token[0]!=='<'){out+=escape(decode(token));continue;}const m=token.match(/^<(\/)?([a-z0-9]+)\b[^>]*>$/i);if(!m)continue;let tag=m[2].toLowerCase();if(tag==='b')tag='strong';if(tag==='i')tag='em';if(!allowed.has(tag))continue;
 if(m[1]){const index=stack.lastIndexOf(tag);if(index<0)continue;while(stack.length>index)out+='</'+stack.pop()+'>';continue;}
 if(tag==='br'){out+='<br>';continue;}
 if(['p','ul','ol','h3'].includes(tag)&&stack.includes('p')){while(stack.includes('p'))out+='</'+stack.pop()+'>';}
 let attributes='';if(tag==='a'){const href=token.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i);if(href)try{attributes=' href="'+escape(safeURL(decode(href[1]??href[2])))+'" rel="noopener noreferrer"';}catch{}}
 out+='<'+tag+attributes+'>';stack.push(tag);
 }
 while(stack.length)out+='</'+stack.pop()+'>';return out&&!/<(?:p|h3|ul|ol)\b/i.test(out)?'<p>'+out+'</p>':out;
}
const strip=s=>decode(s.replace(/<!--[^]*?-->/g,'').replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]*>/g,''));
export function addSemantic(content){
 const {pages,templates,fields}=content;const units=new Map();
 for(const page of pages.filter(p=>p.id==='index.html'||/^over-ons\/[^/]+\/index.html$/.test(p.id))){
  const html=templates.get(page.id);const mainStart=html.indexOf('<main'),mainEnd=html.indexOf('</main>');const candidates=[];const covered=new Set();const existing=new Map(page.fields.map(f=>[f.id,f]));
  for(const tag of ['h1','h2','h3','p','summary','a']){
   const re=new RegExp('<'+tag+'\\b[^>]*>[\\s\\S]*?<\\/'+tag+'>','g');let match;
   while((match=re.exec(html))){if(match.index<mainStart||match.index>mainEnd)continue;const text=match[0],ids=[...text.matchAll(/<!--cms:([a-f0-9]+)-->/g)].map(m=>m[1]);if(!ids.length)continue;const first=existing.get(ids[0]);if(!first)continue;const block=page.blocks.find(b=>b.id===first.block);if(block?.title==='Wachttijden')continue;
    if(tag==='a'&&/<(?:h[1-6]|p|div|section|article)\b/i.test(text))continue;
    const opening=text.indexOf('>')+1;const closing=text.lastIndexOf('</');candidates.push({start:match.index+(tag==='p'?0:opening),end:match.index+(tag==='p'?text.length:closing),outerStart:match.index,outerEnd:match.index+text.length,tag,ids,first,html:tag==='p'?text:text.slice(opening,closing)});
   }
  }
  if(page.id==='index.html'){
   const note=html.match(/<div class="visual-note"[^>]*>[\s\S]*?<\/small>([\s\S]*?)<\/div>/);if(note){const part=note[1],ids=[...part.matchAll(/<!--cms:([a-f0-9]+)-->/g)].map(m=>m[1]);if(ids.length){const start=note.index+note[0].indexOf(part);candidates.push({start,end:start+part.length,tag:'caption',ids,first:existing.get(ids[0]),html:part});}}
  }
  candidates.sort((a,b)=>a.start-b.start||b.end-a.end);const merged=[];
  for(const c of candidates){if(merged.some(m=>c.start>=m.start&&c.end<=m.end))continue;const prev=merged.at(-1);if(c.tag==='p'&&prev?.tag==='p'&&c.first.block===prev.first.block&&!html.slice(prev.end,c.start).trim()){prev.end=c.end;prev.ids.push(...c.ids);prev.html=html.slice(prev.start,c.end);}else merged.push(c);}
  const replacements=[];
  for(const c of merged){if(c.ids.some(id=>covered.has(id)))continue;const id='g'+createHash('sha256').update(page.id+'\0'+c.ids.join(',')).digest('hex').slice(0,23);const field={id,text:c.tag==='p'?c.html.replace(/<!--cms:[a-f0-9]+-->|<!--\/cms-->/g,''):strip(c.html),tag:c.tag,section:c.first.section,block:c.first.block,kind:c.tag==='p'?'rich':'plain',semantic:true,members:c.ids,order:page.fields.indexOf(c.first)};
   units.set(id,{...field,html:c.html});fields.set(id,field);page.fields.push(field);c.ids.forEach(id=>{covered.add(id);existing.get(id).covered=true;});replacements.push({start:c.start,end:c.end,value:'<!--group:'+id+'-->'+c.html+'<!--/group-->'});
  }
  // Link destinations are kept beside link text, under More options.
  const linkRe=/<a\b([^>]*)>[\s\S]*?<\/a>/g;let link;
  while((link=linkRe.exec(html))){if(link.index<mainStart||link.index>mainEnd)continue;const ids=[...link[0].matchAll(/<!--cms:([a-f0-9]+)-->/g)].map(m=>m[1]);const first=existing.get(ids[0]);if(!first||page.blocks.find(b=>b.id===first.block)?.title==='Wachttijden')continue;
   if(merged.some(c=>c.tag==='p'&&link.index>=c.start&&link.index<c.end))continue;
   const attr=link[0].slice(0,link[0].indexOf('>')).match(/\bhref="([^"]*)"/);if(!attr)continue;const start=link.index+attr.index+6;const id='u'+createHash('sha256').update(page.id+'\0'+ids[0]).digest('hex').slice(0,23);const field={id,text:decode(attr[1]),tag:'a',section:first.section,block:first.block,kind:'url',semantic:true,anchor:ids[0],members:[],label:strip(link[0]).trim(),order:page.fields.indexOf(first)+.1};units.set(id,field);fields.set(id,field);page.fields.push(field);replacements.push({start,end:start+attr[1].length,value:'<!--group:'+id+'-->'+attr[1]+'<!--/group-->'});
  }
  let output=html;for(const r of replacements.sort((a,b)=>b.start-a.start))output=output.slice(0,r.start)+r.value+output.slice(r.end);templates.set(page.id,output);page.semantic=true;if(page.id!=='index.html'){for(const b of page.blocks){if(b.title===page.title&&page.fields.some(f=>f.block===b.id&&f.text.includes('@')))b.title='Praktijkgegevens';}}
 }
 const baseRender=(html,values,focus)=>html.replace(/<!--cms:([a-f0-9]+)-->([\s\S]*?)<!--\/cms-->/g,(_,id,original)=>(focus===id?'<span id="cms-preview-focus"></span>':'')+(values.has(id)?escape(values.get(id)).replaceAll('\n','<br>'):original));
 const value=(id,values)=>{if(values.has(id))return values.get(id);const unit=units.get(id);if(!unit)return fields.get(id).text;if(unit.kind==='url')return unit.text;const html=baseRender(unit.html,values);return unit.kind==='rich'?html:strip(html);};
 const normalize=(id,input)=>{const kind=fields.get(id)?.kind;if(kind==='rich')return sanitizeRich(input);if(kind==='url')return safeURL(input);return input;};
 const render=(relative,values,focus)=>{
  let html=templates.get(relative);if(!html)return undefined;
  html=html.replace(/<!--group:([gu][a-f0-9]+)-->([\s\S]*?)<!--\/group-->/g,(_,id,original)=>{
   const unit=units.get(id);let result=values.has(id)?unit.kind==='rich'?sanitizeRich(values.get(id)):escape(values.get(id)).replaceAll('\n','<br>'):original;
   if(focus===id&&unit.kind!=='url')result='<span id="cms-preview-focus"></span>'+result;return result;
  });return baseRender(html,values,focus);
 };
 return {units,value,normalize,render};
}
