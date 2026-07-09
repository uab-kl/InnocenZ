import { createServer } from 'node:net';
import { spawn } from 'node:child_process';

function tryBind(port, host) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, host);
  });
}

async function isPortFree(port) {
  // Check both a wildcard bind and a loopback-specific bind: a port can look
  // free on one and still be held on the other (e.g. another app bound only
  // to 127.0.0.1), which silently causes connection resets instead of a
  // clean "port in use" error.
  const [wildcardFree, loopbackFree] = await Promise.all([
    tryBind(port, '0.0.0.0'),
    tryBind(port, '127.0.0.1'),
  ]);
  return wildcardFree && loopbackFree;
}

async function findFreePort(startPort) {
  let port = startPort;
  while (!(await isPortFree(port))) {
    port += 1;
  }
  return port;
}

const [, , startPortArg, ...commandParts] = process.argv;
const startPort = Number(startPortArg);

const port = await findFreePort(startPort);
if (port !== startPort) {
  console.log(`Port ${startPort} is in use, using ${port} instead.`);
}

const resolvedCommand = commandParts.map((part) => part.replaceAll('{{PORT}}', String(port)));
const [cmd, ...cmdArgs] = resolvedCommand;

const child = spawn(cmd, cmdArgs, { stdio: 'inherit', shell: true });
child.on('exit', (code) => process.exit(code ?? 0));
