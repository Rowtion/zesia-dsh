import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { consultOverA2A as invoke, recoverConsult } from '@zesia/runtime/a2a';
import { installA2A } from '@zesia/runtime/install-a2a';

export { preflightConsult, recoverConsult, CONSULT_MEDIA_TYPE, A2A_PROTOCOL_VERSION } from '@zesia/runtime/a2a';

export async function consultOverA2A(options) {
  const defaultBinary = fileURLToPath(new URL('../bin/a2a' + (process.platform === 'win32' ? '.exe' : ''), import.meta.url));
  const cliBinary = options.cliBinary || process.env.ZESIA_A2A_CLI || defaultBinary;
  if (cliBinary === defaultBinary && !existsSync(cliBinary)) {
    await installA2A({ root: fileURLToPath(new URL('../', import.meta.url)) });
  }
  return invoke({
    ...options,
    cliBinary,
  });
}
