import test from 'node:test';
import assert from 'node:assert/strict';
import {attachAccountPresellUrls, resolveTrackMcc} from '../src/accounts/accounts-presell-domain.mjs';

const row = (account='761-756-9737', product='Total-Control') => ({account,product,productKey:product.toLowerCase()});
const track = (productLabel='TotalControl - conta 9737', hostname='example.shop') => ({productLabel,hostname,origin:`https://${hostname}`});

test('product punctuation and account suffix match without counting campaigns or mutating input', () => {
  const rows=[row(),row(),row('524-480-6244')], before=JSON.stringify(rows);
  const result=attachAccountPresellUrls(rows,[track()]);
  assert.deepEqual(result.map(item=>item.presellUrls),[['https://example.shop/'],['https://example.shop/'],[]]);
  assert.equal(JSON.stringify(rows),before);
});

test('refuses suffix collisions, unrelated products and missing account', () => {
  assert.deepEqual(attachAccountPresellUrls([row(),row('111-222-9737')],[track()]).map(item=>item.presellUrls),[[],[]]);
  assert.deepEqual(attachAccountPresellUrls([row('Sem conta'),row('761-756-9737','Different Product')],[track('Metabo - conta 9737')]).map(item=>item.presellUrls),[[],[]]);
  assert.deepEqual(attachAccountPresellUrls([row()],[track('TotalControl - zinvero')])[0].presellUrls,[]);
});

test('a unique shortened product label can match its account row', () => {
  assert.deepEqual(attachAccountPresellUrls([row('761-756-9737','Metabo Drops')],[track('Metabo - conta 9737')])[0].presellUrls,['https://example.shop/']);
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

test('resolves complete Google Ads account and manager IDs separately from the Track suffix', () => {
  const result=resolveTrackMcc([{
    account:'5413', accountId:'123-456-5413', product:'Nutrova ClearVue', productKey:'nutrova-clearvue',
    mccId:'353-379-6641', mccName:'MCC nutra',
  }],{productLabel:'Nutrova ClearVue - conta 5413',productKey:'nutrova-clearvue-conta-5413'});
  assert.equal(result.status,'identified');
  assert.equal(result.account,'5413','mantém o sufixo apenas para a identidade local da Track');
  assert.equal(result.customerId,'1234565413');
  assert.equal(result.managerCustomerId,'3533796641');
});

test('does not treat a Track account suffix as a complete Google Ads customer ID', () => {
  const result=resolveTrackMcc([{
    account:'5413', product:'Nutrova ClearVue', productKey:'nutrova-clearvue',
    mccId:'353-379-6641', mccName:'MCC nutra',
  }],{productLabel:'Nutrova ClearVue - conta 5413',productKey:'nutrova-clearvue-conta-5413'});
  assert.equal(result.status,'identified','a associação informativa à MCC continua disponível');
  assert.equal(result.customerId,null,'o sufixo de quatro dígitos nunca é enviado como customer ID');
  assert.equal(result.customerIdAmbiguous,false);
  assert.equal(result.managerCustomerId,'3533796641');
});

test('refuses conflicting complete customer IDs for one resolved Track account', () => {
  const result=resolveTrackMcc([
    {account:'5413',accountId:'123-456-5413',product:'Nutrova ClearVue',productKey:'nutrova-clearvue',mccId:'353-379-6641',mccName:'MCC nutra'},
    {account:'5413',accountId:'999-888-5413',product:'Nutrova ClearVue',productKey:'nutrova-clearvue',mccId:'353-379-6641',mccName:'MCC nutra'},
  ],{productLabel:'Nutrova ClearVue - conta 5413',productKey:'nutrova-clearvue-conta-5413'});
  assert.equal(result.status,'identified');
  assert.equal(result.customerId,null);
  assert.equal(result.customerIdAmbiguous,true);
});
