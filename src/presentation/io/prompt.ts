import * as readline from 'readline';

// Reads all of stdin to EOF, for piped secrets in non-interactive contexts (CI).
// Unlike promptPassword this needs no TTY, so `printf %s "$TOKEN" | zs …` works
// in a pipeline without the token ever landing in argv or shell history.
export function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
    process.stdin.resume();
  });
}

// Reads a single line with terminal echo (for non-secret input like email/host).
export function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => {
    rl.close();
    resolve(answer.trim());
  }));
}

// Reads a secret with echo suppressed (raw mode), so tokens/passwords never
// appear on screen or in shell history.
export function promptPassword(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const setRawMode = stdin.setRawMode?.bind(stdin);
    // Without raw mode (non-TTY, piped/redirected input) echo cannot be
    // suppressed. Fail fast rather than risk printing the secret to the screen.
    if (!setRawMode || !stdin.isTTY) {
      reject(new Error('A secret prompt requires an interactive terminal (TTY).'));
      return;
    }

    process.stdout.write(question);
    setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let secret = '';

    const cleanup = () => {
      setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
    };

    const onData = (chunk: string) => {
      // A single chunk can carry several characters (e.g. a paste); handle each.
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          cleanup();
          process.stdout.write('\n');
          resolve(secret);
          return;
        } else if (char === '\u0003') { // Ctrl+C
          cleanup();
          process.stdout.write('\n');
          process.exit(130);
        } else if (char === '\u007f' || char === '\b') { // Backspace / Delete
          secret = secret.slice(0, -1);
        } else {
          secret += char;
        }
      }
    };

    stdin.on('data', onData);
  });
}
