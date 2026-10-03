import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const html=await readFile(new URL('../dist/preparador-MCC/index.html',import.meta.url),'utf8');
const functionSource=name=>html.match(new RegExp(`function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\n    \\}`))?.[0]||'';
const helpers=['buildD0DeltaRows','formatD0DeltaValue'].map(functionSource).join('\n');
assert.ok(helpers.includes('buildD0DeltaRows'),'comparador de D0 ausente');
const context={Intl,Number,Map,Boolean,String,Math};
vm.runInNewContext(`${helpers};globalThis.buildD0DeltaRows=buildD0DeltaRows;globalThis.formatD0DeltaValue=formatD0DeltaValue;`,context);

const metric=(value,estado='confirmado')=>({valor:value,estado});
const campaign=(name,{impressions,clicks,cost,currency='BRL'})=>({nome_campanha_exato:name,metricas_D_zero:{impressoes:metric(impressions),cliques_google:metric(clicks),custo_total:metric(cost),moeda:metric(currency)}});
const date='2026-10-02';
const previous={manifesto_atual:{separacao_temporal:{D_zero:{datas_detectadas:[date]}},campanhas:[
  campaign('01/10 - Produto A',{impressions:100,clicks:5,cost:40}),
  campaign('01/10 - Produto B',{impressions:200,clicks:10,cost:20,currency:'USD'}),
  campaign('01/10 - Produto C',{impressions:30,clicks:3,cost:10}),
  campaign('01/10 - Produto D',{impressions:5,clicks:1,cost:2,currency:'USD'}),
]}};
const manifest={separacao_temporal:{D_zero:{datas_detectadas:[date]}},campanhas:[
  campaign('01/10 - Produto A',{impressions:110,clicks:6,cost:50}),
  campaign('01/10 - Produto B',{impressions:200,clicks:10,cost:20,currency:'USD'}),
  campaign('01/10 - Produto C',{impressions:25,clicks:2,cost:9}),
  campaign('01/10 - Produto D',{impressions:7,clicks:2,cost:4,currency:'BRL'}),
  campaign('01/10 - Produto novo',{impressions:10,clicks:1,cost:10}),
]};
const result=context.buildD0DeltaRows(manifest,previous);
assert.equal(result.comparableDate,true);
assert.deepEqual(JSON.parse(JSON.stringify(result.rows)),[
  {campaign:'01/10 - Produto A',currency:'BRL',impressions:10,clicks:1,cost:10},
  {campaign:'01/10 - Produto C',currency:'BRL',impressions:-5,clicks:-1,cost:-1},
  {campaign:'01/10 - Produto D',currency:'BRL',impressions:2,clicks:1,cost:null},
  {campaign:'01/10 - Produto novo',currency:'BRL',impressions:10,clicks:1,cost:10},
]);

const renamed=context.buildD0DeltaRows(manifest,{...previous,manifesto_atual:{...previous.manifesto_atual,campanhas:[campaign('30/09 - Produto A',{impressions:100,clicks:5,cost:40})]}},[{oldName:'30/09 - Produto A',newName:'01/10 - Produto A'}]);
assert.deepEqual(JSON.parse(JSON.stringify(renamed.rows[0])),{campaign:'01/10 - Produto A',currency:'BRL',impressions:10,clicks:1,cost:10},'campanha com prefixo de data alterado deve continuar comparável pelo pareamento validado');

const newDay=context.buildD0DeltaRows(manifest,{manifesto_atual:{separacao_temporal:{D_zero:{datas_detectadas:['2026-10-01']}},campanhas:[]}});
assert.equal(newDay.comparableDate,false);
assert.equal(newDay.rows[0].impressions,110,'sem captura D0 anterior na mesma data, a primeira captura começa em zero');
assert.equal(context.formatD0DeltaValue(10,'count'),'+10');
assert.equal(context.formatD0DeltaValue(-1,'count'),'−1');
assert.match(context.formatD0DeltaValue(10,'cost','BRL'),/^\+R\$/);
assert.match(context.formatD0DeltaValue(-10,'cost','USD'),/^−US\$/);
assert.equal(context.formatD0DeltaValue(null,'cost','BRL'),'—');

assert.ok(html.indexOf('id="d0-changes-panel"')<html.indexOf('id="validation-panel"'),'tabela de alterações deve ocupar a posição anterior da validação automática');
assert.ok(html.indexOf('id="d0-changes-panel"')<html.indexOf('id="preview-panel"'),'tabela de alterações precisa vir antes da prévia do manifesto');
assert.ok(html.includes('renderD0DeltaPanel(result.manifest, comparisonBase, dateChanges)'),'tabela deve comparar contra a base local já lida para validar a numeração');
assert.ok(html.includes('id="d0-changes-table"')&&html.includes('Custo</th>'),'tabela D0 deve exibir campanha, impressões, cliques e custo');
const deltaPanelStart=html.indexOf('id="d0-changes-panel"'),validationPanelStart=html.indexOf('id="validation-panel"');
assert.ok(html.slice(deltaPanelStart,validationPanelStart).includes('id="apply-manifest"'),'botão Atualizar base deve ficar no cabeçalho do quadro de alterações D0');
assert.equal([...html.matchAll(/id="apply-manifest"/g)].length,1,'deve haver somente um botão Atualizar base');
assert.ok(html.includes('<h2 id="step3-title">Status da atualização</h2>'),'painel abaixo da validação informa o resultado sem duplicar o botão');
for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(match[1].trim())new vm.Script(match[1]);
console.log('comparação de deltas D0 ok');
