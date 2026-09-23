import assert from'node:assert/strict';
import{readFile}from'node:fs/promises';

const pages=[
  ['Visão Geral','../dist/index.html'],
  ['Preparador MCC','../dist/preparador-MCC/index.html'],
  ['Radar SpyHero','../dist/curadoria/index.html'],
  ['Lista de Gerente','../dist/curadoria/gerentes/index.html'],
  ['E-commerce GM','../dist/curadoria/top-performance/index.html']
];
for(const[name,path]of pages){
  const html=await readFile(new URL(path,import.meta.url),'utf8');
  for(const group of['operation','analysis','curation','creation','personal','products'])assert.ok(html.includes(`data-sidebar-group="${group}"`),`${name}: grupo ${group} ausente`);
  assert.ok(html.includes('painel-sidebar-grupo-aberto-v1'),`${name}: preferência compartilhada do acordeão ausente`);
  assert.ok(html.includes('224px minmax(0,1fr)')||html.includes('224px minmax(0, 1fr)'),`${name}: largura compacta do menu ausente`);
  assert.ok(html.includes('Mapa por conta')&&html.includes('Análise por faixa de CPA'),`${name}: rotas atuais de Análises ausentes`);
  const personal=html.match(/data-sidebar-group="personal"[\s\S]*?<\/div>\s*<\/div>/)?.[0]||'';
  assert.ok(personal.includes('Meu Tempo')&&!personal.includes('Observabilidade decisória'),`${name}: Pessoal deve conter Meu Tempo sem duplicar Observabilidade`);
  const analysis=html.match(/data-sidebar-group="analysis"[\s\S]*?<\/div>\s*<\/div>/)?.[0]||'';
  assert.ok(analysis.includes('Observabilidade decisória')&&analysis.includes('Mapa por conta')&&analysis.includes('Análise por faixa de CPA'),`${name}: análises do painel precisam ficar agrupadas`);
  const operation=html.match(/data-sidebar-group="operation"[\s\S]*?<\/div>\s*<\/div>/)?.[0]||'';
  assert.ok(operation.includes('Controle Macro')&&operation.includes('Visão geral')&&!operation.includes('Produtos testados'),`${name}: Operação deve conter a Visão Geral e Controle Macro, sem produtos testados`);
  const products=html.match(/data-sidebar-group="products"[\s\S]*?<\/div>\s*<\/div>/)?.[0]||'';
  assert.ok(products.includes('Produtos testados')&&products.includes('Diário do produto'),`${name}: Produtos deve agrupar a listagem testada e o Diário do produto`);
  const creation=html.match(/data-sidebar-group="creation"[\s\S]*?<\/div>\s*<\/div>/)?.[0]||'';
  assert.ok(creation.includes('Asset Studio')&&creation.includes('Gerador de Pre-Sell')&&creation.includes('Copy e Ficha'),`${name}: ferramentas de criação de ofertas precisam ficar agrupadas`);
  assert.ok((html.includes('activeGroup')&&(html.includes('saved=activeGroup')||html.includes('saved = activeGroup')))||(html.includes('routeGroup')&&html.includes('if(routeGroup)saved=routeGroup')),`${name}: o grupo da rota atual não é mantido visível ao abrir a página`);
  assert.ok(html.includes('E-commerce GM'),`${name}: rota E-commerce GM ausente da Curadoria`);
}
console.log('sidebar layout ok');
