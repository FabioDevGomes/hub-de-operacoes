const DEFAULT_HUB_URL = 'http://127.0.0.1:8765';
const HUB_URL = new URL(process.env.HUB_MCP_BASE_URL || DEFAULT_HUB_URL);
const REQUEST_TIMEOUT_MS = 35_000;

if (HUB_URL.protocol !== 'http:' || HUB_URL.hostname !== '127.0.0.1' || !HUB_URL.port || HUB_URL.pathname !== '/') {
  throw new Error('HUB_MCP_BASE_URL deve apontar para o Hub local em http://127.0.0.1:<porta>/.');
}

export const hubTools = [
  {
    name: 'find_campaigns',
    description: 'Pesquisa campanhas do Hub por trecho do nome e retorna o nome MCC completo, MCC, status local, sufixo da conta e cobertura do Diário. Use para identificar a campanha antes de consultar o histórico. Somente leitura.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['query'],
      properties: {
        query: { type: 'string', minLength: 1, description: 'Trecho distintivo do nome da campanha.' },
        max_results: { type: 'integer', minimum: 1, maximum: 50, default: 25 },
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'get_campaign_daily_history',
    description: 'Lê investimento e comissão em BRL, impressões, cliques, conversões, CTR e custo médio em USD/BRL por dia no Diário operacional do Hub para 1–10 campanhas. Totais somam métricas aditivas; CTR e custos médios do período são ponderados. Informe o nome MCC completo; para nomes duplicados, use o sufixo da conta e, se necessário, o MCC retornado por find_campaigns. Zero e ausência ficam distintos. Comissão/conversões são dados observados/importados e não confirmam pagamento. Somente leitura.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['campaigns'],
      properties: {
        campaigns: {
          type: 'array', minItems: 1, maxItems: 10,
          items: {
            type: 'object', additionalProperties: false, required: ['name'],
            properties: {
              name: { type: 'string', minLength: 1, description: 'Nome MCC exato e completo.' },
              account_suffix: { type: 'string', pattern: '^\\d{4}$', description: 'Últimos quatro dígitos da conta, apenas para desambiguar nomes idênticos.' },
              mcc_name: { type: 'string', minLength: 1, description: 'Nome MCC exato, necessário apenas se a campanha continuar ambígua após o sufixo da conta.' },
            },
          },
        },
        start_date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Data inicial inclusiva; omita para consultar o início observado.' },
        end_date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Data final inclusiva; omita para consultar até a última observação.' },
        max_daily_rows: { type: 'integer', minimum: 1, maximum: 366, default: 200, description: 'Limite total de linhas diárias retornadas; os totais resumidos cobrem todas as linhas filtradas.' },
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
];

function writeMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function rpcError(id, code, message, emit) {
  emit({ jsonrpc: '2.0', id, error: { code, message } });
}

export async function callHub(tool, args, { hubUrl = HUB_URL, fetchImpl = globalThis.fetch } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(new URL('/api/mcp/query', hubUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ tool, arguments: args }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Hub respondeu HTTP ${response.status}.`);
    if (payload.error) throw new Error(String(payload.error));
    return payload.result;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('A leitura expirou. Deixe o Hub aberto em 127.0.0.1:8765 e tente novamente.');
    if (error?.cause?.code === 'ECONNREFUSED' || /fetch failed/i.test(String(error?.message || ''))) {
      throw new Error(`Não encontrei o servidor local do Hub em ${hubUrl.host}.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function handleMessage(message, { emit = writeMessage, hubCall = callHub } = {}) {
  const id = message?.id;
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string' || !message.method) {
    if (id !== undefined) rpcError(id, -32600, 'Invalid Request', emit);
    return;
  }
  if (message.method === 'notifications/initialized' || message.method.startsWith('notifications/')) return;
  if (message.method === 'initialize') {
    emit({
      jsonrpc: '2.0', id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'hub-campaign-analysis', version: '1.0.0' },
        instructions: 'Servidor local e somente leitura. As consultas passam pelo Hub aberto, leem o Diário operacional do IndexedDB em transação readonly e retornam somente os campos e períodos solicitados. Não acesse nem altere outras stores.',
      },
    });
    return;
  }
  if (message.method === 'ping') {
    emit({ jsonrpc: '2.0', id, result: {} });
    return;
  }
  if (message.method === 'tools/list') {
    emit({ jsonrpc: '2.0', id, result: { tools: hubTools } });
    return;
  }
  if (message.method === 'tools/call') {
    const name = String(message.params?.name || '');
    const descriptor = hubTools.find(item => item.name === name);
    if (!descriptor) {
      emit({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `Ferramenta MCP desconhecida: ${name}` }], isError: true } });
      return;
    }
    try {
      const result = await hubCall(name, message.params?.arguments || {});
      emit({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(result) }], isError: false } });
    } catch (error) {
      emit({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: String(error?.message || 'Falha na leitura do Hub.') }], isError: true } });
    }
    return;
  }
  if (id !== undefined) rpcError(id, -32601, `Method not found: ${message.method}`, emit);
}

const isMain = process.argv[1] && new URL(import.meta.url).href === new URL(`file:///${process.argv[1].replaceAll('\\', '/')}`).href;
if (isMain) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    input += chunk;
    while (true) {
      const newline = input.indexOf('\n');
      if (newline < 0) break;
      const line = input.slice(0, newline).trim();
      input = input.slice(newline + 1);
      if (!line) continue;
      try {
        void handleMessage(JSON.parse(line)).catch(error => process.stderr.write(`${String(error?.stack || error)}\n`));
      } catch {
        rpcError(null, -32700, 'Parse error', writeMessage);
      }
    }
  });

  process.stdin.on('end', () => process.exit(0));
}
