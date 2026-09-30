import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../src/database.js',import.meta.url),'utf8');
const html=await readFile(new URL('../dist/preparador-MCC/index.html',import.meta.url),'utf8');
const context=vm.createContext({window:{},structuredClone});
vm.runInContext(source,context);
const db=context.window.CampaignDatabase;
const manifest=names=>({separacao_temporal:{D_zero:{datas_detectadas:['2026-09-30']}},campanhas:names.map(nome_campanha_exato=>({nome_campanha_exato,metricas_D_zero:{data:{valor:'2026-09-30'}}}))});
// Synthetic names exercise the same collision shapes without operational fixtures.
const oldMedic='01/09 - MedicGLP 6 (TEST-FR) 85%';
const currentMedic='02/09 - MedicGLP 6 (TEST-FR) 80%';
const renumberedMedic='01/09 - MedicGLP 18 (TEST-FR) 85%';
const oldWego='01/08 - Wego6 4 (TEST-UK/IE) 86%';
const currentWego='02/08 - Wego6 4 (TEST-UK) 75%';
const base=db.create();
base.campanhas.push(
  {id:'medic_old',nome_mcc:oldMedic,nome_exibicao:'MagicGLP 6',status:'pausada'},
  {id:'medic_current',nome_mcc:currentMedic,nome_exibicao:'MagicGLP 6',status:'historico'},
  {id:'wego_old',nome_mcc:oldWego,nome_exibicao:'Wego6 4',status:'ativa'},
);
base.diario.push({campanha_id:'medic_old',data:'2026-09-01',celulas:{B:{value:21}}});
base.snapshots_campanhas.push({data:'2026-09-02',campanhas:[oldMedic,currentMedic,oldWego]});
base.manifesto_atual=manifest([oldMedic,oldWego]);
const before=JSON.stringify(base);
const incoming=manifest([currentMedic,renumberedMedic,currentWego]);
assert.equal(db.campaignNumberReuseIssues(base,incoming).length,0,'history does not masquerade as current duplicates');
const warnings=db.campaignNumberHistoryWarnings(base,incoming);
assert.deepEqual(Array.from(warnings,item=>item.group),['MagicGLP 6','Wego6 4']);
assert.deepEqual(Array.from(warnings[0].historicalNames),[oldMedic]);
assert.equal(JSON.stringify(base),before,'validation is read-only');
for(const status of ['ativa','pausada','historico']){
  const variant=db.normalize(base);variant.campanhas[0].status=status;
  assert.equal(db.campaignNumberReuseIssues(variant,incoming).length,0,'historical classification does not depend on lifecycle state');
}
const duplicates=manifest([currentMedic,oldMedic]);
assert.equal(db.campaignNumberReuseIssues(base,duplicates).length,1);
assert.equal(db.campaignNumberReuseIssues(db.create(),duplicates).length,1,'duplicates block even in an empty base');
assert.equal(db.campaignNumberHistoryWarnings(base,duplicates).length,0,'current duplicates are errors, not warnings');
assert.equal(db.campaignNumberReuseIssues(base,manifest([currentMedic,currentMedic.toUpperCase()])).length,0,'case differences do not create identities');
const snapshotOnly=db.create();snapshotOnly.snapshots_campanhas.push({data:'2026-09-01',campanhas:[oldMedic]});
assert.equal(db.campaignNumberHistoryWarnings(snapshotOnly,manifest([currentMedic])).length,1);
assert.equal(db.campaignNumberReuseIssues(snapshotOnly,manifest([currentMedic])).length,0);
const imported=db.importManifest(base,incoming,()=>({date:'2026-09-30',cells:{B:{value:0}}})).base;
assert.equal(JSON.stringify(base),before);
assert.deepEqual(JSON.parse(JSON.stringify(imported.diario[0])),JSON.parse(JSON.stringify(base.diario[0])),'existing diary is unchanged');
assert.equal(imported.campanhas.find(item=>item.nome_mcc===currentMedic).id,'medic_current','exact reimport retains its ID');
assert.notEqual(imported.campanhas.find(item=>item.nome_mcc===renumberedMedic).id,'medic_old','renumbering does not infer or merge an identity');
assert.notEqual(imported.campanhas.find(item=>item.nome_mcc===currentWego).id,'wego_old','different exact names remain distinct');
assert.equal(imported.campanhas.find(item=>item.id==='medic_old').nome_mcc,oldMedic);

// Exercise the standalone preview fallback too.
const fallbackStart=html.indexOf('    function panelDisplayName(');
const fallbackEnd=html.indexOf('    function panelIdFor(',fallbackStart);
const fallback=vm.createContext({normalizePanelBase:value=>structuredClone(value)});
vm.runInContext(html.slice(fallbackStart,fallbackEnd),fallback);
assert.equal(fallback.panelCampaignNumberReuseIssues(base,incoming).length,0);
assert.equal(fallback.panelCampaignNumberHistoryWarnings(base,incoming).length,2);
assert.equal(fallback.panelCampaignNumberReuseIssues(base,duplicates).length,1);

// Run the real preview validation against a tiny read-only UI/DB harness.
const elements=new Map(),issueChildren=[];
function element(selector){
  if(!elements.has(selector))elements.set(selector,{textContent:'',hidden:false,disabled:false,className:'',
    querySelectorAll(filter){const key=filter==='[data-numbering-issue]'?'numberingIssue':filter==='[data-numbering-history]'?'numberingHistory':'dateChange';return issueChildren.filter(item=>item.dataset[key]);},
    prepend(item){issueChildren.unshift(item);item.remove=()=>issueChildren.splice(issueChildren.indexOf(item),1);},
  });
  return elements.get(selector);
}
const result={manifest:incoming,critical:[]};
let activeBase=base,closed=0;
const ui=vm.createContext({window:{CampaignDatabase:db},numberingValidationToken:0,numberingIssues:[],currentResult:result,
  q:element,document:{createElement:()=>({dataset:{},textContent:'',className:''})},
  openPanelDatabase:async()=>({close(){closed++;}}),readPanelBase:async()=>activeBase,
  panelUpdateError:error=>error.message,
});
const validationStart=html.indexOf('    async function validatePreparedNumbering(');
const validationEnd=html.indexOf('    function resetResults(',validationStart);
vm.runInContext(html.slice(validationStart,validationEnd),ui);
await ui.validatePreparedNumbering(result);
assert.equal(element('#apply-manifest').disabled,false,'historical warnings leave the update button enabled');
assert.equal(issueChildren.filter(item=>item.dataset.numberingHistory).length,2);
assert.ok(issueChildren.some(item=>item.textContent.includes(oldMedic)&&item.textContent.includes(currentMedic)),'warning displays both exact names');
assert.match(element('#validation-status').textContent,/avisos históricos/);
const duplicateResult={manifest:duplicates,critical:[]};ui.currentResult=duplicateResult;
await ui.validatePreparedNumbering(duplicateResult);
assert.equal(element('#apply-manifest').disabled,true);
assert.equal(issueChildren.filter(item=>item.dataset.numberingHistory).length,0,'old warnings are removed on revalidation');
assert.ok(issueChildren.some(item=>item.dataset.numberingIssue&&item.textContent.includes(oldMedic)&&item.textContent.includes(currentMedic)));
activeBase=db.create();ui.currentResult=result;
await ui.validatePreparedNumbering(result);
assert.equal(element('#apply-manifest').disabled,false);
assert.equal(element('#validation-status').textContent,'Validação concluída','a previously blocked preview resets its status');
assert.equal(issueChildren.length,0);
assert.equal(closed,3);

// The defensive apply check runs again against the latest base before any write.
const applyStart=html.indexOf('    async function applyManifestToPanel(');
const applyEnd=html.indexOf('\n    }',applyStart)+6;
let writes=0,importCalls=0;
const apply=vm.createContext({window:{CampaignDatabase:{...db,importManifest(){importCalls++;throw new Error('should not import');}}},
  location:{hostname:'127.0.0.1',port:'8765'},openPanelDatabase:async()=>({close(){}}),readPanelBase:async()=>base,
  writePanelBase:async()=>{writes++;},
});
vm.runInContext(html.slice(applyStart,applyEnd),apply);
await assert.rejects(apply.applyManifestToPanel(duplicates),error=>error.code==='CAMPAIGN_NUMBER_REUSE'&&error.message.includes(oldMedic)&&error.message.includes(currentMedic));
assert.equal(writes,0);assert.equal(importCalls,0);
console.log('MCC numbering: current duplicates blocked, historical warnings non-blocking, identities preserved');
