from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse
import ipaddress
import json
import threading
import shutil
import subprocess
import time
import uuid
from urllib.parse import parse_qs, urlsplit


class NoCacheHandler(SimpleHTTPRequestHandler):
    presell_tool_root = None
    products_root = None
    mcp_origin = 'http://127.0.0.1:8765'
    mcp_condition = threading.Condition()
    mcp_pending = {}
    mcp_bridge_id = None
    mcp_bridge_lease_until = 0

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def _json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _mcp_loopback_request(self):
        try:
            return ipaddress.ip_address(self.client_address[0]).is_loopback
        except (ValueError, IndexError):
            return False

    def _mcp_same_origin_request(self):
        expected_host = urlsplit(self.mcp_origin).netloc
        return self.headers.get('Origin') == self.mcp_origin and self.headers.get('Host') == expected_host

    def _mcp_read_json(self, maximum_bytes):
        if self.headers.get('Content-Type', '').split(';', 1)[0].strip().lower() != 'application/json':
            raise ValueError('Envie JSON para a ponte MCP local.')
        try:
            size = int(self.headers.get('Content-Length', '0'))
        except ValueError as error:
            raise ValueError('O tamanho da solicitação é inválido.') from error
        if size <= 0 or size > maximum_bytes:
            raise ValueError('O tamanho da solicitação MCP é inválido.')
        try:
            value = json.loads(self.rfile.read(size).decode('utf-8'))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise ValueError('A solicitação MCP não contém JSON válido.') from error
        if not isinstance(value, dict):
            raise ValueError('A solicitação MCP deve ser um objeto JSON.')
        return value

    def _mcp_no_content(self):
        self.send_response(204)
        self.end_headers()

    def _mcp_bridge_poll(self, bridge_id=None):
        if not self._mcp_loopback_request() or not self._mcp_same_origin_request():
            self._json(403, {'error': 'A ponte MCP aceita somente o Hub local na origem canônica.'})
            return
        if bridge_id is None:
            bridge_id = parse_qs(urlsplit(self.path).query).get('bridge_id', [''])[0]
        try:
            bridge_id = str(uuid.UUID(bridge_id))
        except (ValueError, AttributeError):
            self._json(400, {'error': 'Identificador da aba MCP inválido.'})
            return

        deadline = time.monotonic() + 20
        state = type(self)
        with state.mcp_condition:
            now = time.monotonic()
            if state.mcp_bridge_id and now >= state.mcp_bridge_lease_until:
                state.mcp_bridge_id = None
            if state.mcp_bridge_id is None:
                state.mcp_bridge_id = bridge_id
            if state.mcp_bridge_id != bridge_id:
                self._mcp_no_content()
                return
            state.mcp_bridge_lease_until = now + 60
            while True:
                task = next((item for item in state.mcp_pending.values() if item['assigned_bridge_id'] is None), None)
                if task:
                    task['assigned_bridge_id'] = bridge_id
                    self._json(200, {'request': {'request_id': task['request_id'], 'tool': task['tool'], 'arguments': task['arguments']}})
                    return
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    self._mcp_no_content()
                    return
                state.mcp_condition.wait(remaining)

    def _mcp_query(self):
        if not self._mcp_loopback_request() or self.headers.get('Origin'):
            self._json(403, {'error': 'A consulta MCP exige o processo local do Codex.'})
            return
        try:
            payload = self._mcp_read_json(100_000)
            tool = str(payload.get('tool') or '')
            if tool not in ('find_campaigns', 'get_campaign_daily_history') or not isinstance(payload.get('arguments', {}), dict):
                raise ValueError('Ferramenta ou parâmetros MCP inválidos.')
        except ValueError as error:
            self._json(400, {'error': str(error)})
            return

        request_id = str(uuid.uuid4())
        state = type(self)
        with state.mcp_condition:
            if not state.mcp_bridge_id or time.monotonic() >= state.mcp_bridge_lease_until:
                state.mcp_bridge_id = None
                self._json(503, {'error': 'Abra o Hub em http://127.0.0.1:8765/ e mantenha essa aba aberta para consultar o Diário.'})
                return
            task = {'request_id': request_id, 'tool': tool, 'arguments': payload.get('arguments', {}), 'assigned_bridge_id': None, 'done': False, 'result': None, 'error': None}
            state.mcp_pending[request_id] = task
            state.mcp_condition.notify_all()
            deadline = time.monotonic() + 32
            while not task['done']:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    state.mcp_pending.pop(request_id, None)
                    self._json(504, {'error': 'O Hub não respondeu à consulta MCP dentro do prazo.'})
                    return
                state.mcp_condition.wait(remaining)
            state.mcp_pending.pop(request_id, None)
            self._json(200, {'result': task['result'], 'error': task['error']})

    def _mcp_bridge_respond(self):
        if not self._mcp_loopback_request() or not self._mcp_same_origin_request():
            self._json(403, {'error': 'A resposta MCP aceita somente a aba do Hub na origem canônica.'})
            return
        try:
            payload = self._mcp_read_json(200_000)
            bridge_id = str(uuid.UUID(str(payload.get('bridge_id') or '')))
            request_id = str(uuid.UUID(str(payload.get('request_id') or '')))
        except (ValueError, AttributeError) as error:
            self._json(400, {'error': str(error) or 'Identificadores MCP inválidos.'})
            return
        state = type(self)
        with state.mcp_condition:
            task = state.mcp_pending.get(request_id)
            if not task or task['assigned_bridge_id'] != bridge_id or state.mcp_bridge_id != bridge_id:
                self._json(404, {'error': 'A solicitação MCP não está mais ativa para esta aba.'})
                return
            task['result'] = payload.get('result')
            task['error'] = str(payload.get('error'))[:400] if payload.get('error') else None
            task['done'] = True
            state.mcp_bridge_lease_until = time.monotonic() + 60
            state.mcp_condition.notify_all()
        self._json(200, {'ok': True})

    def do_GET(self):
        route = urlsplit(self.path).path
        if route == '/api/presell/health':
            self._json(200, {'presellApi': 'v1', 'mcpBridgeApi': True})
            return
        super().do_GET()

    def _payload(self):
        size = int(self.headers.get('Content-Length', '0'))
        if size <= 0 or size > 200_000:
            raise ValueError('O tamanho da ficha é inválido.')
        payload = json.loads(self.rfile.read(size).decode('utf-8'))
        if not isinstance(payload, dict) or not isinstance(payload.get('ficha'), dict):
            raise ValueError('Envie uma ficha JSON válida.')
        return payload

    def _destination(self, payload):
        raw = str(payload.get('destination') or payload['ficha'].get('destination') or '').strip()
        if not raw:
            raise ValueError('O diretório de destino é obrigatório.')
        root = self.products_root.resolve()
        destination = Path(raw).resolve()
        try:
            relative = destination.relative_to(root)
        except ValueError as error:
            raise ValueError('O destino deve ficar dentro da pasta local de produtos.') from error
        if len(relative.parts) < 2:
            raise ValueError('Informe uma pasta de página dentro de um produto.')
        return destination

    def _run_ps(self, script, arguments):
        executable = shutil.which('pwsh') or shutil.which('powershell')
        if not executable:
            raise RuntimeError('PowerShell não encontrado para executar o produtor local.')
        completed = subprocess.run([executable, '-NoProfile', '-File', str(script), *arguments], cwd=self.presell_tool_root, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=120, check=False)
        output = completed.stdout.strip() or completed.stderr.strip()
        if completed.returncode != 0:
            raise RuntimeError(output or 'O script local falhou.')
        try:
            return json.loads(output)
        except json.JSONDecodeError as error:
            raise RuntimeError('O script local não retornou um relatório válido.') from error

    def do_POST(self):
        route = urlsplit(self.path).path
        if route == '/api/mcp/query':
            self._mcp_query()
            return
        if route == '/api/mcp/bridge/poll':
            try:
                payload = self._mcp_read_json(4_000)
                self._mcp_bridge_poll(payload.get('bridge_id'))
            except ValueError as error:
                self._json(400, {'error': str(error)})
            return
        if route == '/api/mcp/bridge/respond':
            self._mcp_bridge_respond()
            return
        if route not in ('/api/presell/validate', '/api/presell/produce'):
            self._json(404, {'error': 'Rota local não encontrada.'})
            return
        try:
            if not self.presell_tool_root or not self.products_root:
                raise RuntimeError('Integração de pre-sell não foi configurada no inicializador.')
            payload = self._payload()
            destination = self._destination(payload)
            ficha = payload['ficha']
            ficha['destination'] = str(destination)
            ficha_json = json.dumps(ficha, ensure_ascii=False, separators=(',', ':'))
            asset_folder = str(ficha.get('assetFolder') or 'assets')
            workflow = self.presell_tool_root / 'tools' / 'Invoke-PresellWorkflow.ps1'
            if self.path.endswith('/produce'):
                producer = self.presell_tool_root / 'tools' / 'New-PresellFromFicha.ps1'
                self._run_ps(producer, ['-Destination', str(destination), '-FichaJson', ficha_json])
            report = self._run_ps(workflow, ['-Destination', str(destination), '-Mode', 'Validate', '-FichaJson', ficha_json, '-AssetFolder', asset_folder, '-Json'])
            self._json(200, {'report': report})
        except (ValueError, RuntimeError, subprocess.TimeoutExpired) as error:
            self._json(400, {'error': str(error)})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--directory", required=True)
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--presell-tool-root")
    parser.add_argument("--products-root")
    args = parser.parse_args()
    directory = str(Path(args.directory).resolve())

    class ConfiguredHandler(NoCacheHandler):
        presell_tool_root = Path(args.presell_tool_root).resolve() if args.presell_tool_root else None
        products_root = Path(args.products_root).resolve() if args.products_root else None
        mcp_origin = f'http://{args.bind}:{args.port}'

    def handler(*handler_args, **handler_kwargs):
        return ConfiguredHandler(*handler_args, directory=directory, **handler_kwargs)

    ThreadingHTTPServer((args.bind, args.port), handler).serve_forever()


if __name__ == "__main__":
    main()
