import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

if (process.platform !== 'win32') throw new Error('This check requires Windows PowerShell and PowerShell 7.');
const fixture = 'param([string]$Action)\n"download-test:${Action}:caf' + '\u00e9' + '"\n';
const contentTypes = {
  '/binary': 'application/octet-stream',
  '/powershell': 'application/x-powershell',
  '/text': 'text/plain; charset=utf-8'
};
const server = createServer((request, response) => {
  const contentType = contentTypes[request.url];
  if (!contentType) { response.writeHead(404).end(); return; }
  response.writeHead(200, { 'Content-Type': contentType });
  response.end(fixture);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
try {
  for (const shell of ['powershell.exe', 'pwsh.exe']) {
    await new Promise((resolve, reject) => {
      const child = spawn(shell, ['-NoProfile', '-NonInteractive', '-File', 'scripts/test-windows-download.ps1', '-Base', base], { stdio: 'inherit' });
      const timeout = setTimeout(() => { child.kill(); reject(new Error(`${shell} timed out`)); }, 60000);
      child.on('error', error => { clearTimeout(timeout); reject(error); });
      child.on('exit', code => { clearTimeout(timeout); code === 0 ? resolve() : reject(new Error(`${shell} failed: ${code}`)); });
    });
  }
} finally { server.close(); }
