import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const html=await readFile(new URL('../dist/preparador-MCC/index.html',import.meta.url),'utf8');
const functionSource=name=>html.match(new RegExp(`function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\n    \\}`))?.[0]||'';
const helpers=['buildD1DeltaRows','formatD0DeltaValue','renderD1DeltaPanel'].map(functionSource).join('\n');
assert.ok(helpers.includes('buildD1DeltaRows'),'comparador do fechamento D−1 ausente');
const absent=new Set(['','-','--','—','–']);
const context={Intl,Number,Map,Boolean,String,Math,parseNumber:value=>Number(value),stateValue:(raw,parser=null)=>{
  if(raw==null||absent.has(String(raw).trim()))return{valor:null,estado:'ausente'};
  try{const value=parser?parser(raw):String(raw).trim();return{valor:value,estado:value===0?'zero_confirmado':'confirmado'}}catch{return{valor:null,estado:'invalido'}};
}};
vm.runInNewContext(`${helpers};globalThis.buildD1DeltaRows=buildD1DeltaRows;globalThis.formatD0DeltaValue=formatD0DeltaValue;`,context);

const metric=(value,estado=value==null?'ausente':'confirmado')=>({valor:value,estado});
const previousCampaign=(name,{impressions,clicks,cost,currency='BRL'})=>({nome_campanha_exato:name,metricas_D_zero:{impressoes:metric(impressions),cliques_google:metric(clicks),custo_total:metric(cost),moeda:metric(currency)}});
const d1Record=(name,{impressions,clicks,cost,currency='BRL'})=>({nome_campanha_exato:name,moeda:currency,raw:{impressions,clicks,cost}});
const date='2026-10-02';
const previous={manifesto_atual:{separacao_temporal:{D_zero:{datas_detectadas:[date]}},campanhas:[
  previousCampaign('Campanha A',{impressions:100,clicks:10,cost:50}),
  previousCampaign('Campanha B',{impressions:200,clicks:20,cost:30}),
  previousCampaign('Campanha C',{impressions:null,clicks:3,cost:5}),
  previousCampaign('Campanha D',{impressions:10,clicks:2,cost:2,currency:'USD'}),
  previousCampaign('Campanha F',{impressions:10,clicks:2,cost:2}),
]}};
const source={dates:[date],records:[
  d1Record('Campanha A',{impressions:'110',clicks:'12',cost:'55'}),
  d1Record('Campanha B',{impressions:'200',clicks:'20',cost:'30'}),
  d1Record('Campanha C',{impressions:'--',clicks:'4',cost:'5'}),
  d1Record('Campanha D',{impressions:'11',clicks:'2',cost:'20',currency:'BRL'}),
  d1Record('Campanha nova',{impressions:'10',clicks:'1',cost:'10'}),
  d1Record('Campanha F',{impressions:'11',clicks:'3',cost:'3'}),
  d1Record('Campanha F',{impressions:'12',clicks:'4',cost:'4'}),
]};
const result=context.buildD1DeltaRows(source,previous);
assert.equal(result.comparableDate,true);
assert.deepEqual(JSON.parse(JSON.stringify(result.rows)),[
  {campaign:'Campanha A',currency:'BRL',impressions:10,clicks:2,cost:5},
  {campaign:'Campanha C',currency:'BRL',impressions:null,clicks:1,cost:0},
  {campaign:'Campanha D',currency:'BRL',impressions:1,clicks:0,cost:null},
]);

const renderedElements=new Map();
const mockElement=()=>({hidden:true,textContent:'',children:[],replaceChildren(){this.children=[];},append(child){this.children.push(child);},classList:{add(){}}});
const selectors=['#d1-changes-panel','#d1-changes-table','#d1-changes-empty','#d1-changes-caption'];
selectors.forEach(selector=>renderedElements.set(selector,mockElement()));
const renderer=vm.createContext({...context,q:selector=>renderedElements.get(selector),panelDateLabel:value=>value,document:{createElement:tag=>({...mockElement(),tag})}});
vm.runInContext(`${helpers};globalThis.renderD1DeltaPanel=renderD1DeltaPanel;`,renderer);
renderer.renderD1DeltaPanel(source,previous);
assert.equal(renderedElements.get('#d1-changes-panel').hidden,false);
assert.equal(renderedElements.get('#d1-changes-table').children.length,3,'a interface renderiza somente as campanhas alteradas');
assert.deepEqual(renderedElements.get('#d1-changes-table').children[0].children.map(cell=>cell.textContent),['Campanha A','+10','+2','+R$ 5,00']);
assert.equal(renderedElements.get('#d1-changes-empty').hidden,true);

const mismatchedDate=context.buildD1DeltaRows(source,{manifesto_atual:{separacao_temporal:{D_zero:{datas_detectadas:['2026-10-01']}},campanhas:previous.manifesto_atual.campanhas}});
assert.equal(mismatchedDate.comparableDate,false);
assert.deepEqual(JSON.parse(JSON.stringify(mismatchedDate.rows)),[],'sem D0 correspondente, a tabela não deve comparar valores contra zero');
renderer.renderD1DeltaPanel(source,{manifesto_atual:{separacao_temporal:{D_zero:{datas_detectadas:['2026-10-01']}},campanhas:previous.manifesto_atual.campanhas}});
assert.equal(renderedElements.get('#d1-changes-table').children.length,0);
assert.equal(renderedElements.get('#d1-changes-empty').hidden,false);
assert.match(renderedElements.get('#d1-changes-empty').textContent,/nenhum campo ausente foi tratado como zero/);

const renamed=context.buildD1DeltaRows({dates:[date],records:[d1Record('Campanha A 02/10',{impressions:'105',clicks:'11',cost:'51'})]},previous,[{oldName:'Campanha A',newName:'Campanha A 02/10'}]);
assert.deepEqual(JSON.parse(JSON.stringify(renamed.rows)),[{campaign:'Campanha A 02/10',currency:'BRL',impressions:5,clicks:1,cost:1}],'renomeação só é associada quando confirmada pelo detector existente');

assert.equal(context.formatD0DeltaValue(5,'count'),'+5');
assert.equal(context.formatD0DeltaValue(-2,'count'),'−2');
assert.match(context.formatD0DeltaValue(1,'cost','BRL'),/^\+R\$/);
assert.equal(context.formatD0DeltaValue(null,'cost','BRL'),'—');

assert.ok(html.indexOf('id="d1-changes-panel"')<html.indexOf('id="d0-changes-panel"'),'tabela de alterações D−1 deve aparecer antes da tabela D0');
assert.ok(html.indexOf('id="d1-changes-panel"')<html.indexOf('id="validation-panel"'),'tabela D−1 deve ficar antes da validação automática');
assert.ok(html.includes('renderD1DeltaPanel(slots.d1, comparisonBase, dateChanges)'),'a validação deve renderizar o delta D−1 com ou sem uma captura D0 no outro slot');
assert.ok(html.includes('renderD1DeltaPanel(slots.d1, comparisonBase, dateChanges)'),'tabela deve ser atualizada quando D−1 e D0 estão carregados juntos');
assert.ok(html.includes('nenhum campo ausente foi tratado como zero'),'ausência de D0 correspondente deve ser explícita');
for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(match[1].trim())new vm.Script(match[1]);
console.log('comparação do fechamento D−1 com D0 ok');
