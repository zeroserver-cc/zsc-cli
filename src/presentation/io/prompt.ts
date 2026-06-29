import * as readline from 'readline';

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
  return new Promise((resolve) => {
    process.stdout.write(question);
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    let secret = '';

    const onData = (char: string) => {
      if (char === '\r' || char === '\n') {
        process.stdin.setRawMode?.(false);
        process.stdin.pause();
        process.stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(secret);
      } else if (char === '') { // Ctrl+C
        process.stdout.write('\n');
        process.exit(0);
      } else if (char === '' || char === '\b') { // Backspace / Delete
        secret = secret.slice(0, -1);
      } else {
        secret += char;
      }
    };

    process.stdin.on('data', onData);
  });
}
