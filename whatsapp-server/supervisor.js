import { spawn } from 'child_process';

const env = {
  ...process.env,
  TZ: process.env.TZ || 'America/Sao_Paulo',
};

let shuttingDown = false;
const children = [];

function start(name, file) {
  const child = spawn(process.execPath, [file], {
    stdio: 'inherit',
    env,
  });

  children.push(child);
  console.log(`[supervisor] ${name} iniciado (pid ${child.pid})`);

  child.on('exit', (code, signal) => {
    console.error(`[supervisor] ${name} finalizou (code=${code}, signal=${signal})`);
    if (!shuttingDown) {
      shutdown(code || 1);
    }
  });

  return child;
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('[supervisor] Encerrando processos...');

  for (const child of children) {
    if (!child.killed) {
      try { child.kill('SIGTERM'); } catch {}
    }
  }

  setTimeout(() => process.exit(exitCode), 1500).unref();
}

process.on('SIGTERM', () => shutdown(0));
process.on('SIGINT', () => shutdown(0));
process.on('uncaughtException', (error) => {
  console.error('[supervisor] uncaughtException:', error);
  shutdown(1);
});
process.on('unhandledRejection', (error) => {
  console.error('[supervisor] unhandledRejection:', error);
  shutdown(1);
});

start('whatsapp-server', 'index.js');
start('reminder-worker', 'reminder-worker.js');
