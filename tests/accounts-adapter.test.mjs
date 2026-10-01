import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../src/index.template.html',import.meta.url),'utf8');
const functionLine = name => {
  const line = source.split('\n').find(value=>value.trimStart().startsWith('function '+name+'('));
  assert.ok(line,'Hub adapter function missing: '+name);
  return line;
};
const escape = value => String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

test('CPA selects remain self-contained after extracting the Accounts select renderer',()=>{
  const select={innerHTML:'',value:''};
  const context=vm.createContext({$:()=>select,esc:escape});
  vm.runInContext(functionLine('cpaSelect')+';this.select=cpaSelect',context);
  assert.equal(context.select('#synthetic',['Option 10','Option 2','Option 2','<unsafe>'],'Option 2','All'),'Option 2');
  assert.equal((select.innerHTML.match(/value="Option 2"/g)||[]).length,1);
  assert.ok(select.innerHTML.indexOf('Option 2')<select.innerHTML.indexOf('Option 10'));
  assert.ok(select.innerHTML.includes('&lt;unsafe&gt;'));
  assert.equal(context.select('#synthetic',[],'Option 2','All'),'all','a removed selection must fall back safely');
});

test('Accounts adapter preserves observed history and replaces, not duplicates, same-day D0',()=>{
  const d0={date:'2026-01-02',investment:5,impressions:0,clicks:null,conversions:0,commission:null};
  const context=vm.createContext({d0Totals:()=>d0});
  vm.runInContext(functionLine('accountCampaignTotals')+';this.totals=accountCampaignTotals',context);
  const history={
    observed:{investment:true,impressions:true,clicks:false,conversions:true,commission:false},
    investment:20,impressions:30,clicks:0,conversions:2,commission:0,
    byDate:{'2026-01-02':{investment:8,impressions:10,clicks:0,conversions:1,commission:0}}
  };
  const before=JSON.stringify(history);
  assert.deepEqual(JSON.parse(JSON.stringify(context.totals({},history))),{investment:17,impressions:20,clicks:null,conversions:1,commission:null});
  assert.equal(JSON.stringify(history),before);
  assert.equal(context.totals({},null),d0);
});

test('product and account projections preserve exact campaign names, sales adjustments and domain fallbacks',()=>{
  const campaigns=[
    {nome_campanha_exato:'01/01 - Example 01',_status:'ativa',account:'A',totals:{investment:0,conversions:0,commission:0}},
    {nome_campanha_exato:'02/01 - Example 02',_status:'pausada',account:'B',totals:{investment:null,conversions:0,commission:0}}
  ];
  const stored=new Map(campaigns.map((campaign,index)=>[campaign.nome_campanha_exato,{id:'synthetic-'+index,nome_exibicao:'Example '+(index+1),conta_dominio:index?'.stored.store':null}]));
  const contextData={campaigns,historyTotals:new Map(),salesAdjustments:new Map([['synthetic-0',{pendingConversions:1,commissionAdjustment:10}]])};
  const context=vm.createContext({
    derivedContext:()=>contextData,state:{productCatalog:{}},ProductCatalog:{normalize:()=>({aliases:{example:'Example alias'}})},
    accountDomainIndex:()=>new Map([['A','.fallback.shop']]),currentCampaignRows:()=>campaigns,
    databaseCampaign:name=>stored.get(name),testedProductName:campaign=>campaign.nome_exibicao,
    campaignSheet:()=>'',campaignHistoricalTotals:()=>null,d0Totals:campaign=>campaign.totals,
    campaignAccount:campaign=>campaign.account,campaignAccountDomain:()=>null,roiForTotals:()=>null
  });
  vm.runInContext(['accountCampaignTotals','accountProductIdentity','accountReportRows'].map(functionLine).join('\n')+';this.rows=accountReportRows',context);
  const before=JSON.stringify(campaigns);
  const result=context.rows();
  assert.deepEqual(Array.from(result,row=>row.campaign),campaigns.map(row=>row.nome_campanha_exato));
  assert.deepEqual(Array.from(result,row=>row.domain),['.fallback.shop','.stored.store']);
  assert.deepEqual(Array.from(result,row=>row.product),['Example alias','Example alias']);
  assert.deepEqual(Array.from(result,row=>row.status),['ativa','pausada']);
  assert.equal(result[0].totals.conversions,1); assert.equal(result[0].totals.commission,10);
  assert.equal(result[1].totals.investment,null); assert.equal(result[0].totals.investment,0);
  assert.equal(JSON.stringify(campaigns),before);
  assert.equal(context.rows(),result,'the existing derived-context cache is reused');
});
