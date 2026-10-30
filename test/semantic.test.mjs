import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compileContent} from '../lib/content.mjs';
import {sanitizeRich} from '../lib/semantic.mjs';
test('Every public page has the block editor and adopts existing text edits',async()=>{
 const c=await compileContent('public');const pages=c.pages.filter(p=>c.templates.has(p.id));assert.equal(pages.length,20);
 for(const page of pages){
  assert(page.semantic,page.id);assert(page.blocks.length,page.id);
  const group=page.fields.find(f=>f.semantic&&f.kind!=='url');assert(group,page.id);
  const member=group.members[0];const values=new Map([[member,'Eerder opgeslagen tekst']]);
  assert(c.value(group.id,values).includes('Eerder opgeslagen tekst'),page.id);
  assert(c.render(page.id,values).includes('Eerder opgeslagen tekst'),page.id);
  const replacement=group.kind==='rich'?'<p>Een nieuw <strong>concept</strong></p>':'Een nieuw concept';values.set(group.id,replacement);
  const html=c.render(page.id,values);assert(html.includes(replacement),page.id);assert(!html.includes('Eerder opgeslagen tekst'),page.id);
 }
 const wait=c.pages.find(p=>p.id==='praktisch/wachttijden/index.html');const block=wait.blocks.find(b=>b.waiting);assert(block);assert(wait.fields.filter(f=>f.block===block.id).every(f=>!f.semantic));
 const practical=c.pages.find(p=>p.id==='praktisch/index.html');const info=practical.blocks.find(b=>b.title==='Wachttijden');assert(practical.fields.some(f=>f.block===info.id&&f.semantic));
 const tariff=c.pages.find(p=>p.id==='praktisch/tarieven-vergoeding/index.html');const table=tariff.fields.find(f=>f.semantic&&f.tag==='table');assert(table);assert.equal(table.kind,'rich');assert(c.value(table.id,new Map()).includes('<td>€ 174,83</td>'));
 const list=tariff.fields.find(f=>f.kind==='rich'&&f.text.includes('<ul>'));assert(list);
});
test('Editable tables retain safe structure without scripts or attributes',()=>{
 const safe=sanitizeRich('<table onclick="alert(1)"><caption>Volwassenen</caption><tbody><tr><td style="color:red">€ 10<img src=x onerror=alert(1)></td></tr></tbody></table>');
 assert.equal(safe,'<table><caption>Volwassenen</caption><tbody><tr><td>€ 10</td></tr></tbody></table>');
});
