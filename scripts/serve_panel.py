from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse
import json
import shutil
import subprocess


class NoCacheHandler(SimpleHTTPRequestHandler):
    presell_tool_root = None
    products_root = None

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

    def do_GET(self):
        if self.path == '/api/presell/health':
            self._json(200, {'presellApi': 'v1'})
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
        if self.path not in ('/api/presell/validate', '/api/presell/produce'):
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

    def handler(*handler_args, **handler_kwargs):
        return ConfiguredHandler(*handler_args, directory=directory, **handler_kwargs)

    ThreadingHTTPServer((args.bind, args.port), handler).serve_forever()


if __name__ == "__main__":
    main()
