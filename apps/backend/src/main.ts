/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { createServer } from 'net';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';

function canBind(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, host);
  });
}

// A port can appear free on one bind scope (0.0.0.0) while another process
// holds it on another (127.0.0.1), which causes silent connection resets
// instead of a clean "port in use" error — so both are checked.
async function isPortFree(port: number): Promise<boolean> {
  const [wildcardFree, loopbackFree] = await Promise.all([
    canBind(port, '0.0.0.0'),
    canBind(port, '127.0.0.1'),
  ]);
  return wildcardFree && loopbackFree;
}

async function findFreePort(startPort: number): Promise<number> {
  let port = startPort;
  while (!(await isPortFree(port))) {
    port += 1;
  }
  return port;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  const requestedPort =
    Number(process.env.PORT) || Number(process.env.BACKEND_PORT) || 7777;
  const port = await findFreePort(requestedPort);
  if (port !== requestedPort) {
    Logger.warn(`Port ${requestedPort} is in use, using ${port} instead.`);
  }
  await app.listen(port);
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
}

bootstrap();
