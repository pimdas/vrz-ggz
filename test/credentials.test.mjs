import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compileContent} from '../lib/content.mjs';
test('Practitioner credentials validate independently and escape public labels',async()=>{
 const c=await compileContent('public'),module=c.credentials,config=module.read(new Map());
 assert.equal(config.people.find(p=>p.id==='geertje').items[0].logo,'lvvp-visitatie');assert.equal(config.people.find(p=>p.id==='tessa').items.length,2);
 config.people.find(p=>p.id==='ruud').items.push({id:'test',label:'<script>alert(1)</script>',logo:'none',url:'https://example.com/'});
 const valid=module.validate(config);const html=c.render('over-ons/ruud-van-roosmalen/index.html',new Map([[module.key,JSON.stringify(valid)]]));assert(html.includes('&lt;script&gt;'));assert(!html.includes('<script>alert(1)</script>'));assert(!html.includes('data-credentials="ruud" hidden'));
 const before=html.indexOf('class="side profile-credentials"'),after=html.indexOf('class="side profile-colleagues"');assert(before<after);
 valid.people.find(p=>p.id==='tessa').items=[];const hidden=c.render('over-ons/tessa-van-roosmalen/index.html',new Map([[module.key,JSON.stringify(valid)]]));assert(hidden.includes('data-credentials="tessa" hidden'));
 const bad=structuredClone(config);bad.people[0].items[0].url='javascript:alert(1)';assert.throws(()=>module.validate(bad));bad.people[0].items[0].url='https://example.com/';bad.people[0].items[0].logo='toString';assert.throws(()=>module.validate(bad));
 const duplicate=structuredClone(config);duplicate.people[1]=duplicate.people[0];assert.throws(()=>module.validate(duplicate));
});
