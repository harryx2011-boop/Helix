import type * as vscode from 'vscode';

/**
 * The API key, kept in VS Code's SecretStorage (the OS keychain), never in
 * settings. Asked for once (Harry's call, 2026-10-17) and handed to the
 * framed app on request.
 */

const SECRET_ID = 'helix.apiKey';

/** Shorter than this after `helix-` is no key Helix mints. */
const MIN_KEY_BODY = 8;

/** Why `value` is not a usable key, or undefined when it is. */
export function keyProblem(value: string): string | undefined {
  const key = value.trim();
  if (!key.startsWith('helix-')) return 'Paste an API key that starts with helix-.';
  if (key.length - 'helix-'.length < MIN_KEY_BODY) return 'That key is too short to be a Helix key.';
  return undefined;
}

export function readKey(secrets: vscode.SecretStorage): Thenable<string | undefined> {
  return secrets.get(SECRET_ID);
}

export function clearKey(secrets: vscode.SecretStorage): Thenable<void> {
  return secrets.delete(SECRET_ID);
}

/** Prompts for a key and stores it. Undefined when the prompt was dismissed. */
export async function promptForKey(
  secrets: vscode.SecretStorage,
  window: typeof vscode.window,
): Promise<string | undefined> {
  const value = await window.showInputBox({
    title: 'Helix API Key',
    prompt: 'A key from the Keys screen of your Helix app. It is stored in VS Code secret storage.',
    placeHolder: 'helix-...',
    password: true,
    ignoreFocusOut: true,
    validateInput: keyProblem,
  });
  if (value === undefined) return undefined;

  const key = value.trim();
  await secrets.store(SECRET_ID, key);
  return key;
}
