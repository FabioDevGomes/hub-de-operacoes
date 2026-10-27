import test from 'node:test';
import assert from 'node:assert/strict';
import {attachAccountPresellUrls} from '../src/accounts/accounts-presell-domain.mjs';

const row = (account='761-756-9737', product='Total-Control') => ({account,product,productKey:product.toLowerCase()});
const track = (productLabel='TotalControl - conta 9737', hostname='example.shop') => ({productLabel,hostname,origin:`https://${hostname}`});

test('product punctuation and account suffix match without counting campaigns or mutating input', () => {
  const rows=[row(),row(),row('524-480-6244')], before=JSON.stringify(rows);
  const result=attachAccountPresellUrls(rows,[track()]);
  assert.deepEqual(result.map(item=>item.presellUrls),[['https://example.shop/'],['https://example.shop/'],[]]);
  assert.equal(JSON.stringify(rows),before);
});

test('refuses suffix collisions, unrelated products, missing account and product abbreviations', () => {
  assert.deepEqual(attachAccountPresellUrls([row(),row('111-222-9737')],[track()]).map(item=>item.presellUrls),[[],[]]);
  assert.deepEqual(attachAccountPresellUrls([row('Sem conta'),row('761-756-9737','Metabo Drops')],[track('Metabo - conta 9737')]).map(item=>item.presellUrls),[[],[]]);
  assert.deepEqual(attachAccountPresellUrls([row()],[track('TotalControl - zinvero')])[0].presellUrls,[]);
});

test('full account resolves a suffix collision; all matching domains remain visible', () => {
  const tracks=[track('TotalControl - conta 761-756-9737'),track('TotalControl - conta 7617569737','second.shop')];
  const result=attachAccountPresellUrls([row(),row('111-222-9737')],tracks);
  assert.deepEqual(result[0].presellUrls,['https://example.shop/','https://second.shop/']);
  assert.deepEqual(result[1].presellUrls,[]);
});

test('technical Track names work and unsafe or path URLs are rejected', () => {
  const technical={...track(),productLabel:null,productKey:'totalcontrol-conta-9737'};
  assert.equal(attachAccountPresellUrls([row()],[technical])[0].presellUrl,'https://example.shop/');
  for(const origin of ['javascript:alert(1)','http://example.shop','https://example.shop/path','https://user@example.shop/']) {
    assert.deepEqual(attachAccountPresellUrls([row()],[{...track(),origin}])[0].presellUrls,[]);
  }
});
