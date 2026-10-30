
const KEY='waiting-config-v1';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={ruud:'Ruud van Roosmalen',tessa:'Tessa van Roosmalen',geertje:'Geertje Zijlstra',michel:'Michel van Hest'};
const unitKey=s=>({week:'week',weken:'week',maand:'month',maanden:'month',dag:'day',dagen:'day'}[s]||'legacy:'+s);
export function unitLabel(amount,unit){return unit==='week'?(Number(amount)===1?'week':'weken'):unit==='month'?(Number(amount)===1?'maand':'maanden'):unit==='day'?(Number(amount)===1?'dag':'dagen'):unit.replace(/^legacy:/,'');}
export function validateWaiting(input,current){
 if(!input||!Array.isArray(input.people)||input.people.length!==Object.keys(names).length)throw new Error('Ongeldige behandelaren.');
 const seen=new Set();
 const people=input.people.map(person=>{
  if(!person||typeof person!=='object'||!Object.hasOwn(names,person.id)||seen.has(person.id)||typeof person.stopped!=='boolean'||!Array.isArray(person.rows)||person.rows.length>10)throw new Error('Ongeldige instellingen per behandelaar.');
  seen.add(person.id);const before=current.people.find(p=>p.id===person.id);const ids=new Set();
  const rows=person.rows.map(row=>{
   if(!row||typeof row!=='object'||typeof row.id!=='string'||!/^[-a-zA-Z0-9_]{1,60}$/.test(row.id)||ids.has(row.id)||typeof row.label!=='string'||!row.label.trim()||row.label.length>100)throw new Error('Vul voor iedere behandelregel een label in (maximaal 100 tekens).');
   ids.add(row.id);const old=before?.rows.find(r=>r.id===row.id);const amount=Number(row.amount);
   const valid=String(row.amount).trim()!==''&&Number.isInteger(amount)&&amount>=1&&amount<=10&&['week','month'].includes(row.unit);
   const unchangedLegacy=old&&String(row.amount)===String(old.amount)&&row.unit===old.unit;
   if(!valid&&!unchangedLegacy)throw new Error('Kies een aantal van 1 tot en met 10 en de eenheid weken of maanden.');
   return {id:row.id,label:row.label.trim(),amount:valid?amount:old.amount,unit:valid?row.unit:old.unit};
  });
  if(!person.stopped&&!rows.length&&(before?.stopped!==false||before.rows.length))throw new Error('Voeg een wachttijd toe voordat je de aanmeldstop uitzet.');
  return {id:person.id,stopped:person.stopped,rows};
 });
 return {version:1,people};
}
function replaceWaits(html,cards){
 const open=/<div\b[^>]*class="[^"]*\bwaits\b[^"]*"[^>]*>/g;const first=open.exec(html);if(!first)return html;
 const tags=/<\/?div\b[^>]*>/g;tags.lastIndex=first.index;let depth=0,match;
 while((match=tags.exec(html))){depth+=match[0].startsWith('</')?-1:1;if(!depth)return html.slice(0,first.index)+'<div class="waits">'+cards+'</div>'+html.slice(tags.lastIndex);}
 throw new Error('Wachttijdenblok niet gevonden.');
}
export function attachWaiting(content,sources,controls){
 const legacyIds=new Set([...controls.flatMap(c=>c.ids),...sources.flatMap(list=>list.filter(f=>Object.values(names).includes(f.section)&&['span','strong','h3'].includes(f.tag)).map(f=>f.id))]);
 content.fields.set(KEY,{id:KEY,text:'',tag:'config',kind:'waiting',section:'Wachttijden'});
 const value=(f,values)=>content.value(f.id,values);
 function legacy(values){
  const rows=(name)=>sources[0].filter(f=>f.section===name);
  function row(name,index,id){const fields=rows(name),amount=fields.filter(f=>f.tag==='strong')[index],spans=fields.filter(f=>f.tag==='span');return {id,label:value(spans[index*2],values),amount:value(amount,values),unit:unitKey(value(spans[index*2+1],values))};}
  const status=rows(names.geertje).find(f=>f.tag==='span');
  return {version:1,people:[{id:'ruud',stopped:false,rows:[row(names.ruud,0,'ruud-1')]},{id:'tessa',stopped:false,rows:[row(names.tessa,0,'tessa-1'),row(names.tessa,1,'tessa-2')]},{id:'geertje',stopped:/stop/i.test(value(status,values)),rows:[]}]};
 }
 function read(values){const stored=values.get(KEY);const config=stored?JSON.parse(stored):legacy(values);if(!config.people.some(p=>p.id==='michel'))config.people.push({id:'michel',stopped:false,rows:[]});return config;}
 function render(html,page,values){
  if(!html||!['index.html','praktisch/wachttijden/index.html'].includes(page)||!values.get(KEY))return html;
  const config=read(values);
  const cards=config.people.filter(person=>person.stopped||person.rows.length).map(person=>'<article class="wait"><h3>'+escape(names[person.id])+'</h3>'+(person.stopped?'<span class="status">Aanmeldstop</span><p>Op dit moment worden geen nieuwe aanmeldingen aangenomen.</p>':person.rows.map(row=>'<div class="waitrow"><span>'+escape(row.label)+'</span><strong>'+escape(row.amount)+' <span>'+escape(unitLabel(row.amount,row.unit))+'</span></strong></div>').join(''))+'</article>').join('');
  let result=replaceWaits(html,cards);
  if(config.updated)result=result.replace(/(<p\b[^>]*class="[^"]*\bupdate\b[^"]*"[^>]*>)[\s\S]*?<\/p>/,(all,opening)=>opening+'Laatste update: '+escape(config.updated)+' · Wachttijden kunnen wijzigen.</p>');
  return result;
 }
 return {key:KEY,names,read,validate:validateWaiting,render,legacyIds};
}
