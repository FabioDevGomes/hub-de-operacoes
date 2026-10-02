import assert from'node:assert/strict';
import{readFile}from'node:fs/promises';
import{moveVisibleItemInOrder}from'../src/meu-tempo/meu-tempo-view.mjs';

const fullOrder=[{id:'a'},{id:'hidden'},{id:'b'},{id:'c'}];
assert.deepEqual(moveVisibleItemInOrder(fullOrder,'b',-1,['a','b','c']),['b','hidden','a','c'],'mover para cima troca com o vizinho visível, mantendo itens ocultos e sua ordem relativa');
assert.deepEqual(moveVisibleItemInOrder(fullOrder,'b',1,['a','b','c']),['a','hidden','c','b'],'mover para baixo troca com o vizinho visível');
assert.equal(moveVisibleItemInOrder(fullOrder,'a',-1,['a','b','c']),null,'não há movimento para cima no início da lista visível');
assert.equal(moveVisibleItemInOrder(fullOrder,'c',1,['a','b','c']),null,'não há movimento para baixo no fim da lista visível');
assert.equal(moveVisibleItemInOrder(fullOrder,'missing',1,['a','b','c']),null,'item ausente não é reordenado');

const view=await readFile(new URL('../src/meu-tempo/meu-tempo-view.mjs',import.meta.url),'utf8');
const storage=await readFile(new URL('../src/meu-tempo/meu-tempo-storage.mjs',import.meta.url),'utf8');
const css=await readFile(new URL('../src/meu-tempo/meu-tempo.css',import.meta.url),'utf8');
assert.ok(view.includes('<th>Ação</th>'),'tabela do lançamento diário deve exibir a coluna Ação');
assert.ok(view.includes("refresh(`${item.name}: ${formattedDuration} registrado.`,{duration:TIME_ENTRY_TOAST_DURATION_MS,highlight:formattedDuration})"),'lançamento manual deve destacar a duração recém-adicionada no aviso prolongado');
assert.ok(view.includes("refresh(`${item.name}: intervalo de ${formattedDuration} registrado.`,{duration:TIME_ENTRY_TOAST_DURATION_MS,highlight:formattedDuration})")&&view.includes("refresh(`${item.name}: ${formattedDuration} registrado até ${interval.end}.`,{duration:TIME_ENTRY_TOAST_DURATION_MS,highlight:formattedDuration})"),'lançamentos por intervalo e até agora devem destacar a duração no aviso prolongado');
const dailyViewBlock=view.match(/function dailyView\(\)\{([\s\S]*?)\n\}/)?.[1]||'';
const productivePercentIndex=dailyViewBlock.indexOf('Percentual produtivo'),preWorkIndex=dailyViewBlock.indexOf('Tempo até começar a trabalhar');
assert.ok(preWorkIndex>productivePercentIndex&&dailyViewBlock.includes('Domain.totalPreWorkDuration(data.entries,selectedDate)')&&dailyViewBlock.includes('Domain.formatDuration(preWorkMinutes)'),'o KPI de tempo até começar a trabalhar vem logo após o percentual produtivo e usa a data selecionada');
assert.ok(view.includes('data-direction="-1"')&&view.includes('data-direction="1"'),'cada atividade deve oferecer mover para cima e para baixo');
assert.ok(view.includes('updateDailyMoveControls()'),'botões de borda devem ser desabilitados conforme a lista visível');
assert.ok(view.includes('await Storage.reorderItems(orderedIds)'),'a nova ordem deve persistir ao clicar');
assert.ok(storage.includes("withDb(['items'],'readwrite'")&&storage.includes('order:(index+1)*10'),'persistência atualiza somente a ordem das atividades em uma transação');
assert.ok(css.includes('.time-row-actions-buttons')&&css.includes('.time-row-actions button:disabled'),'coluna Ação mantém os controles compactos e mostra limites de movimento');
console.log('meu tempo daily order ui ok');
