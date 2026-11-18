import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildGoogleAdsCampaignBulkUploadCsv} from '../src/google-ads/google-ads-campaign-bulk-upload-csv.mjs';

function entry({customerId,currency,budget,cpa,name}) {
  return {
    accountCurrency:currency,
    payload:{
      managerCustomerId:'9999999999',
      customerId,
      accountCurrency:currency,
      dailyBudget:budget,
      dailyBudgetCurrency:currency,
      biddingStrategy:'TARGET_CPA',
      targetCpa:cpa,
      targetCpaCurrency:currency,
      campaignName:name,
      geoTargetCountryCodes:['US'],
      trackingUrlTemplate:'',
      finalUrlSuffix:'',
    },
  };
}

function parseCsv(content) {
  return content.trim().split('\r\n').map(line=>line.slice(1,-1).split('","').map(value=>value.replaceAll('""','"')));
}

test('CSV inclui CPA e orçamento preparados na moeda da conta de cada linha',()=>{
  const entries=[
    entry({customerId:'1234567890',currency:'BRL',budget:'250.00',cpa:'176.00',name:'04/11 - Teste 01 (GM-NBB-US) 40% - U$ 88.00'}),
    entry({customerId:'2345678901',currency:'USD',budget:'50.00',cpa:'35.20',name:'04/11 - Teste 02 (GM-NBB-US) 40% - U$ 88.00'}),
  ];
  const result=buildGoogleAdsCampaignBulkUploadCsv({entries,managerCustomerId:'9999999999'});
  const [headers,...rows]=parseCsv(result.csvContent);
  const budget=headers.indexOf('Budget'),customer=headers.indexOf('Customer ID'),cpa=headers.indexOf('Target CPA'),strategy=headers.indexOf('Bid strategy type');
  assert.equal(result.campaignCount,2);
  assert.deepEqual(result.accountCurrencies,['BRL','USD']);
  assert.equal(rows[0][customer],'123-456-7890');
  assert.equal(rows[0][budget],'250.00');
  assert.equal(rows[0][strategy],'Maximize Conversions');
  assert.equal(rows[0][cpa],'176.00');
  assert.equal(rows[1][customer],'234-567-8901');
  assert.equal(rows[1][budget],'50.00');
  assert.equal(rows[1][strategy],'Maximize Conversions');
  assert.equal(rows[1][cpa],'35.20');
});

test('CSV recusa CPA ou orçamento cuja moeda não corresponda à conta da linha',()=>{
  const base=entry({customerId:'1234567890',currency:'BRL',budget:'250.00',cpa:'176.00',name:'04/11 - Teste 01 (GM-NBB-US) 40% - U$ 88.00'});
  assert.throws(()=>buildGoogleAdsCampaignBulkUploadCsv({entries:[{
    ...base,payload:{...base.payload,targetCpaCurrency:'USD'},
  }],managerCustomerId:'9999999999'}),/CPA desejado não está na moeda da conta destino/);
  assert.throws(()=>buildGoogleAdsCampaignBulkUploadCsv({entries:[{
    ...base,payload:{...base.payload,dailyBudgetCurrency:'USD'},
  }],managerCustomerId:'9999999999'}),/orçamento da campanha não está na moeda da conta destino/);
});
