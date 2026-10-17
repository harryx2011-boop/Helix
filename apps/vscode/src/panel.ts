import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { panelHtml } from './html';
import { promptForKey, readKey } from './key';

/** One panel, reused: a second "Helix: Open" moves it rather than adding another. */
let panel: vscode.WebviewPanel | undefined;

export interface PanelDeps {
  extensionUri: vscode.Uri;
  secrets: vscode.SecretStorage;
}

export function showPanel(deps: PanelDeps, origin: string, path: string, title: string): void {
  if (!panel) panel = createPanel(deps);
  panel.title = title;
  panel.webview.html = panelHtml({ origin, path, nonce: randomBytes(16).toString('hex') });
  panel.reveal();
}

function createPanel(deps: PanelDeps): vscode.WebviewPanel {
  const created = vscode.window.createWebviewPanel('helix.app', 'Helix', vscode.ViewColumn.Active, {
    enableScripts: true,
    // The app holds form state and a running request; hiding the tab must not drop them.
    retainContextWhenHidden: true,
  });
  created.iconPath = vscode.Uri.joinPath(deps.extensionUri, 'media', 'icon.png');
  created.onDidDispose(() => {
    panel = undefined;
  });

  created.webview.onDidReceiveMessage(async (message: { type?: unknown }) => {
    if (message?.type !== 'need-key') return;
    const key = (await readKey(deps.secrets)) ?? (await promptForKey(deps.secrets, vscode.window));
    if (key) void created.webview.postMessage({ type: 'helix:key', apiKey: key });
  });

  return created;
}
