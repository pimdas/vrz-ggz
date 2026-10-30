import {escape} from './content.mjs';
const key='credentials-config-v1';
export const logos={none:{label:'Geen logo',src:''},lvvp:{label:'LVVP',src:'/assets/lvvp-logo.svg'},'lvvp-visitatie':{label:'LVVP gevisiteerd',src:'/assets/lvvp-gevisiteerd.png'},emdr:{label:'EMDR Nederland',src:'/assets/emdr-nederland-logo.png'}};
export const defaults={version:1,people:[{id:'ruud',items:[]},{id:'tessa',items:[{id:'tessa-lvvp',label:'Lid LVVP',logo:'lvvp',url:'https://lvvp.info/'},{id:'tessa-emdr',label:'Lid EMDR Nederland',logo:'emdr',url:'https://www.emdr.nl/'}]},{id:'geertje',items:[{id:'geertje-visitatie',label:'LVVP gevisiteerd',logo:'lvvp-visitatie',url:'https://lvvp.info/'}]},{id:'michel',items:[]}]};
export function credentialsMarkup(person){return '<section class="side profile-credentials" data-credentials="'+escape(person.id)+'"'+(!person.items.length?' hidden':'')+'><h3>Lidmaatschappen en certificaten</h3><div class="credential-badges">'+person.items.map(item=>{const inside=(logos[item.logo]?.src?'<img src="'+logos[item.logo].src+'" alt="" loading="lazy">':'')+'<span>'+escape(item.label)+'</span>';return item.url?'<a class="credential-badge" href="'+escape(item.url)+'" target="_blank" rel="noopener noreferrer">'+inside+'</a>':'<div class="credential-badge">'+inside+'</div>';}).join('')+'</div></section>';}
export function attachCredentials(content,names){
 content.fields.set(key,{id:key,text:'',tag:'config',kind:'credentials',section:'Lidmaatschappen'});
 content.pages.push({id:'credentials',title:'Lidmaatschappen en certificaten',url:'/over-ons/',dedicated:true,fields:[]});
 const read=values=>values.get(key)?JSON.parse(values.get(key)):structuredClone(defaults);
 function validate(input){
  if(!input||!Array.isArray(input.people)||input.people.length!==Object.keys(names).length)throw new Error('Ongeldige behandelaren.');const seen=new Set();
  const people=input.people.map(p=>{if(!p||!Object.hasOwn(names,p.id)||seen.has(p.id)||!Array.isArray(p.items)||p.items.length>20)throw new Error('Ongeldige lidmaatschappen.');seen.add(p.id);const ids=new Set();return {id:p.id,items:p.items.map(item=>{
   if(!item||typeof item.id!=='string'||!/^[-a-zA-Z0-9_]{1,60}$/.test(item.id)||ids.has(item.id)||typeof item.label!=='string'||!item.label.trim()||item.label.length>150||!Object.hasOwn(logos,item.logo)||typeof item.url!=='string'||item.url.length>2000)throw new Error('Vul een naam in en kies een geldig logo.');ids.add(item.id);
   const url=item.url.trim();if(url){let parsed;try{parsed=new URL(url);}catch{throw new Error('Gebruik een volledige https://-link.');}if(parsed.protocol!=='https:'||parsed.username||parsed.password||/[\s<>"'\\]/.test(url))throw new Error('Gebruik een volledige https://-link.');}
   return {id:item.id,label:item.label.trim(),logo:item.logo,url};
  })};});return {version:1,people};
 }
 function render(html,page,values){if(!html||!values.get(key)||!/^over-ons\/[^/]+\/index.html$/.test(page))return html;return html.replace(/<section class="side profile-credentials" data-credentials="([a-z]+)"[^>]*>[\s\S]*?<\/section>/,(_,id)=>credentialsMarkup(read(values).people.find(p=>p.id===id)));}
 return {key,read,validate,render,names,logos};
}
