import test from 'node:test';
import assert from 'node:assert/strict';
import { deploymentNextAction } from '../src/copy-ficha/copy-ficha-deploy.mjs';

test('HTTP 500 ao listar arquivos encaminha o correlation_id e bloqueia apagar ou publicar o destino', () => {
  const action = deploymentNextAction({
    status: 'error',
    error: 'Não foi possível conferir os arquivos existentes no destino Hostinger (HTTP 500). Referência Hostinger (correlation_id): req-abc-123. Nenhum arquivo foi enviado.',
    deploymentHistory: [{ status: 'partial', remoteState: 'unknown', uploadedCount: 0, totalCount: 6 }],
  });

  assert.equal(action.title, 'Próxima ação: compartilhar a referência do erro');
  assert.match(action.text, /HTTP 500/);
  assert.match(action.text, /não iniciou o envio/);
  assert.equal(action.showHpanel, false);
  assert.ok(action.steps.some(step => /req-abc-123/.test(step)));
  assert.ok(action.steps.some(step => /Não apague arquivos/.test(step)));
  assert.ok(action.steps.some(step => /outros destinos prontos podem ser publicados/.test(step)));
});

test('HTTP 500 sem correlation_id inclui o horário da consulta e não pede nova análise em loop', () => {
  const action = deploymentNextAction({
    status: 'error',
    error: 'Não foi possível consultar os arquivos remotos no destino Hostinger (HTTP 500). Horário local da consulta: 2026-10-28 16:42:10 -03:00. Nenhum arquivo foi enviado.',
  });

  assert.equal(action.title, 'Próxima ação: compartilhar o erro HTTP 500');
  assert.ok(action.steps.some(step => /não trouxe correlation_id/.test(step)));
  assert.ok(action.steps.some(step => /2026-10-28 16:42:10 -03:00/.test(step)));
  assert.ok(action.steps.every(step => !/Reanalisar páginas pendentes/.test(step)));
});

test('reanálise atual pronta oculta orientação amarela de uma tentativa parcial antiga', () => {
  const action = deploymentNextAction({
    status: 'ready',
    error: '',
    deploymentHistory: [{ status: 'partial', remoteState: 'unknown', uploadedCount: 0, totalCount: 6 }],
  });

  assert.equal(action, null);
});

test('reanálise pronta prevalece até sobre erro antigo salvo no destino', () => {
  const action = deploymentNextAction({
    status: 'ready',
    error: 'Não foi possível conferir os arquivos existentes no destino Hostinger (HTTP 500).',
    deploymentHistory: [{ status: 'partial', remoteState: 'unknown', uploadedCount: 0, totalCount: 6 }],
  });

  assert.equal(action, null);
});

test('criação de subdomínio não confirmada orienta conferir o inventário específico antes de reanalisar', () => {
  const action = deploymentNextAction({
    status: 'error',
    parentDomain: 'zavorex.shop',
    prefix: 'trylymphtonic2',
    error: 'A API da Hostinger respondeu com erro e não foi possível confirmar a criação. Atualize a lista de sites antes de tentar novamente.',
  });

  assert.equal(action.title, 'Próxima ação: conferir o inventário de subdomínios');
  assert.match(action.text, /trylymphtonic2\.zavorex\.shop/);
  assert.match(action.text, /não confirmou se o endereço existe/);
  assert.match(action.text, /não foram analisados nem enviados/);
  assert.match(action.steps[0], /Atualizar subdomínios/);
  assert.match(action.steps[1], /Se o endereço aparecer/);
  assert.match(action.steps[2], /Não remova arquivos/);
});

test('falha sem resposta recomenda reanalisar antes de apagar qualquer arquivo', () => {
  const action = deploymentNextAction({
    status: 'partial',
    error: 'Envio interrompido: 0 de 6 arquivos confirmados.',
    deploymentHistory: [{ remoteState: 'unknown', uploadedCount: 0, totalCount: 6 }],
  });

  assert.equal(action.title, 'Próxima ação: reanalisar antes de tentar novamente');
  assert.match(action.text, /não apague arquivos/);
  assert.equal(action.showHpanel, false);
});

test('conflito confirmado mostra ação manual restrita aos caminhos listados', () => {
  const action = deploymentNextAction(
    { status: 'blocked' },
    { hasConflicts: true, conflicts: [{ path: 'trylymph/01.png' }, { path: 'trylymph/index.html' }] },
  );

  assert.equal(action.title, 'Próxima ação: remover somente os arquivos listados');
  assert.match(action.text, /2 arquivo\(s\)/);
  assert.equal(action.showHpanel, true);
  assert.ok(action.steps.some(step => /somente os caminhos identificados/.test(step)));
});

test('HTTP 409 não é tratado como prova de arquivo existente e pede reanálise antes de remoção', () => {
  const action = deploymentNextAction({
    status: 'partial',
    error: "HTTP 409 ao iniciar o arquivo 'trylymph/01.png'.",
    deploymentHistory: [{ failedPath: 'trylymph/01.png' }],
  });

  assert.equal(action.title, 'Próxima ação: reanalisar o destino');
  assert.match(action.text, /trylymph\/01\.png/);
  assert.match(action.text, /não confirma sozinho/);
  assert.ok(action.steps.some(step => /Reanalisar páginas pendentes/.test(step)));
  assert.ok(action.steps.some(step => /Não apague pastas/.test(step)));
  assert.equal(action.showHpanel, false);
});
