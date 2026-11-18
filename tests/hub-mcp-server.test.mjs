import test from 'node:test';
import assert from 'node:assert/strict';
import { callHub, handleMessage, hubTools } from '../tools/hub_campaigns_mcp_server.mjs';

test('MCP anuncia somente ferramentas de consulta e responde ao ciclo initialize/list/call', async () => {
  const messages = [];
  const emit = message => messages.push(message);
  const hubCall = async (name, args) => ({ name, args, count: 2 });

  await handleMessage({ jsonrpc: '2.0', id: 1, method: 'initialize' }, { emit, hubCall });
  assert.equal(messages.pop().result.serverInfo.name, 'hub-campaign-analysis');

  await handleMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, { emit, hubCall });
  const listed = messages.pop();
  assert.deepEqual(listed.result.tools.map(tool => tool.name), ['find_campaigns', 'get_campaign_daily_history']);
  assert.ok(listed.result.tools.every(tool => tool.annotations.readOnlyHint === true));
  assert.ok(hubTools.every(tool => tool.inputSchema.additionalProperties === false));

  await handleMessage({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'find_campaigns', arguments: { query: 'StopWatt' } } }, { emit, hubCall });
  const called = messages.pop();
  assert.equal(called.result.isError, false);
  assert.deepEqual(JSON.parse(called.result.content[0].text), { name: 'find_campaigns', args: { query: 'StopWatt' }, count: 2 });
});

test('encaminhamento HTTP MCP só envia a ferramenta e os argumentos para a rota local', async () => {
  let request = null;
  const result = await callHub('find_campaigns', { query: 'StopWatt' }, {
    hubUrl: new URL('http://127.0.0.1:8765/'),
    fetchImpl: async (url, options) => {
      request = { url: String(url), options };
      return { ok: true, json: async () => ({ result: { campaigns: [] } }) };
    },
  });
  assert.equal(request.url, 'http://127.0.0.1:8765/api/mcp/query');
  assert.equal(request.options.method, 'POST');
  assert.deepEqual(JSON.parse(request.options.body), { tool: 'find_campaigns', arguments: { query: 'StopWatt' } });
  assert.deepEqual(result, { campaigns: [] });
});

test('falha de consulta aparece como erro de ferramenta MCP sem encerrar o processo', async () => {
  const messages = [];
  await handleMessage({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'get_campaign_daily_history', arguments: {} } }, {
    emit: message => messages.push(message),
    hubCall: async () => { throw new Error('Abra o Hub para consultar o Diário.'); },
  });
  assert.equal(messages[0].result.isError, true);
  assert.equal(messages[0].result.content[0].text, 'Abra o Hub para consultar o Diário.');
});
