import { spawn } from 'child_process';

function openerFor(platform: NodeJS.Platform, url: string): [string, string[]] {
  if (platform === 'darwin') return ['open', [url]];
  // rundll32 avoids `cmd /c start`, which would re-parse `&` in the URL as a shell operator.
  if (platform === 'win32') return ['rundll32', ['url.dll,FileProtocolHandler', url]];
  return ['xdg-open', [url]];
}

/**
 * Best-effort: asks the OS to open an https URL in the default browser.
 * Returns false when it cannot (headless box, no opener, non-https URL) so the
 * caller can rely on the URL it already printed. Never throws.
 */
export function openInBrowser(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return resolve(false);
    }
    if (parsed.protocol !== 'https:') return resolve(false);

    const [command, args] = openerFor(process.platform, parsed.toString());
    try {
      const child = spawn(command, args, { stdio: 'ignore', detached: true });
      child.once('error', () => resolve(false));
      child.once('spawn', () => {
        child.unref();
        resolve(true);
      });
    } catch {
      resolve(false);
    }
  });
}
