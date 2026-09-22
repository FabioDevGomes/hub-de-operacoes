import assert from'node:assert/strict';
import{readFile}from'node:fs/promises';

const pages=[
  ['Preparador MCC','../dist/preparador-MCC/index.html'],
  ['Radar SpyHero','../dist/curadoria/index.html'],
  ['Lista de Gerente','../dist/curadoria/gerentes/index.html'],
  ['E-commerce GM','../dist/curadoria/top-performance/index.html']
];
for(const[name,path]of pages){
  const html=await readFile(new URL(path,import.meta.url),'utf8');
  for(const group of['operation','curation','products'])assert.ok(html.includes(`data-sidebar-group="${group}"`),`${name}: grupo ${group} ausente`);
  assert.ok(html.includes('painel-sidebar-grupo-aberto-v1'),`${name}: preferência compartilhada do acordeão ausente`);
  assert.ok(html.includes('224px minmax(0,1fr)')||html.includes('224px minmax(0, 1fr)'),`${name}: largura compacta do menu ausente`);
  assert.ok(html.includes('Meu Tempo')&&html.includes('Mapa por conta')&&html.includes('Análise por faixa de CPA'),`${name}: rotas atuais de Operação ausentes`);
  assert.ok(html.includes('Gerador de Pre-Sell')&&html.includes('Asset Studio'),`${name}: ferramentas de Pre-Sell ausentes da Operação`);
  assert.ok(html.includes('E-commerce GM'),`${name}: rota E-commerce GM ausente da Curadoria`);
}
console.log('sidebar layout ok');
