import * as vscode from 'vscode';
import { clearKey, promptForKey, readKey } from './key';
import { MonitorsView, type Connection } from './monitors-view';
import { showPanel } from './panel';
import { statusView } from './status';
import { candidatePorts, findApi, type ApiTarget } from './target';

/** How often the status bar re-checks the API. */
const POLL_MS = 30_000;

const PAGES = {
  app: { path: '/app', title: 'Helix' },
  monitoring: { path: '/app/playground?tab=monitor', title: 'Helix Web Monitoring' },
} as const;

export function activate(context: vscode.ExtensionContext): void {
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  status.command = 'helix.open';
  status.show();

  let target: ApiTarget | null = null;

  const ports = (): number[] => candidatePorts(vscode.workspace.getConfiguration('helix').get<unknown>('port'));

  const refreshStatus = async (): Promise<ApiTarget | null> => {
    const tried = ports();
    target = await findApi(tried, fetch);
    const view = statusView(target, tried);
    status.text = view.text;
    status.tooltip = view.tooltip;
    status.backgroundColor = view.warning ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;
    return target;
  };

  const connection = async (): Promise<Connection> => {
    const api = target ?? (await refreshStatus());
    if (!api) return statusView(null, ports()).tooltip;
    const apiKey = await readKey(context.secrets);
    if (!apiKey) return 'Run "Helix: Set API Key" to see your monitors.';
    return { origin: api.origin, apiKey };
  };

  const monitors = new MonitorsView(connection);

  const open = async (page: (typeof PAGES)[keyof typeof PAGES]): Promise<void> => {
    const api = await refreshStatus();
    if (!api) {
      void vscode.window.showWarningMessage(statusView(null, ports()).tooltip);
      return;
    }
    if (!(await servesApp(api.origin))) {
      void vscode.window.showWarningMessage(
        `The Helix API on port ${api.port} does not serve the app. The desktop app does; a dev API needs HELIX_STATIC_DIR set to apps/dashboard/out.`,
      );
      return;
    }
    showPanel({ extensionUri: context.extensionUri, secrets: context.secrets }, api.origin, page.path, page.title);
  };

  const refreshAll = async (): Promise<void> => {
    await refreshStatus();
    monitors.refresh();
  };

  const timer = setInterval(() => void refreshStatus(), POLL_MS);

  context.subscriptions.push(
    status,
    monitors,
    { dispose: () => clearInterval(timer) },
    vscode.window.registerTreeDataProvider('helix.monitors', monitors),
    vscode.commands.registerCommand('helix.open', () => open(PAGES.app)),
    vscode.commands.registerCommand('helix.openMonitoring', () => open(PAGES.monitoring)),
    vscode.commands.registerCommand('helix.setApiKey', async () => {
      if (await promptForKey(context.secrets, vscode.window)) monitors.refresh();
    }),
    vscode.commands.registerCommand('helix.clearApiKey', async () => {
      await clearKey(context.secrets);
      monitors.refresh();
      void vscode.window.showInformationMessage('Helix API key cleared.');
    }),
    vscode.commands.registerCommand('helix.refreshMonitors', refreshAll),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('helix.port')) void refreshAll();
    }),
  );

  void refreshStatus();
}

export function deactivate(): void {}

/** Whether `/app` answers with the app, which a dev API without a static dir does not. */
async function servesApp(origin: string): Promise<boolean> {
  try {
    const response = await fetch(`${origin}/app`, { method: 'HEAD', signal: AbortSignal.timeout(3_000) });
    return response.ok && (response.headers.get('content-type') ?? '').includes('text/html');
  } catch {
    return false;
  }
}
