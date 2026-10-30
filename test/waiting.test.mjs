import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compileContent} from '../lib/content.mjs';
import {unitLabel,validateWaiting} from '../lib/waiting.mjs';
test('Waiting-time labels, pluralization and legacy values',async()=>{
 assert.equal(unitLabel(1,'week'),'week');assert.equal(unitLabel(2,'week'),'weken');assert.equal(unitLabel(1,'month'),'maand');assert.equal(unitLabel(10,'month'),'maanden');
 const c=await compileContent('public');const original=new Map();const config=c.waiting.read(original);assert.equal(config.people[1].rows.length,2);assert.equal(config.people[2].stopped,true);
 const next=structuredClone(config);next.people[0].rows[0]={id:'ruud-1',label:'Vrij label',amount:1,unit:'month'};next.people[1].stopped=true;next.updated='30 oktober 2026';
 const checked=validateWaiting(next,config);assert.equal(checked.people[1].rows[0].amount,'240');assert.equal(checked.people[1].rows[0].unit,'day');
 const values=new Map([[c.waiting.key,JSON.stringify({...checked,updated:next.updated})]]);
 for(const page of ['index.html','praktisch/wachttijden/index.html']){const html=c.render(page,values);assert(html.includes('Vrij label'));assert(html.includes('<strong>1 <span>maand</span>'));assert.equal((html.match(/class="status"/g)||[]).length,2);assert(!html.includes('<strong>240 '));assert(html.includes('Laatste update: 30 oktober 2026'));}
 const invalid=structuredClone(next);invalid.people[0].rows[0].amount=11;assert.throws(()=>validateWaiting(invalid,config),/1 tot en met 10/);
 invalid.people[0].rows[0].amount=1;invalid.people[0].rows[0].unit='day';assert.throws(()=>validateWaiting(invalid,config));
 const wrongPerson=structuredClone(config);wrongPerson.people[0].id='toString';assert.throws(()=>validateWaiting(wrongPerson,config));
 const empty=structuredClone(config);empty.people[2].stopped=false;assert.throws(()=>validateWaiting(empty,config),/Voeg een wachttijd toe/);
 next.people[0].rows[0].label='<img src=x onerror=alert(1)>';const safe=validateWaiting(next,config);const html=c.render('index.html',new Map([[c.waiting.key,JSON.stringify(safe)]]));assert(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
 assert.equal(c.render('index.html',new Map()),c.render('index.html',new Map([[c.waiting.key,'']])));
});
