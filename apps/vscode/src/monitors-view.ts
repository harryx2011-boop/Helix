import * as vscode from 'vscode';
import { localFetch } from './local-fetch';
import { checkRow, fetchHistory, fetchMonitors, monitorRow, type CheckItem, type MonitorItem, type Row } from './monitors';

export type Connection = { origin: string; apiKey: string } | string;

type Node =
  | { kind: 'monitor'; monitor: MonitorItem }
  | { kind: 'check'; check: CheckItem }
  | { kind: 'message'; text: string };

export class MonitorsView implements vscode.TreeDataProvider<Node>, vscode.Disposable {
  readonly #changed = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.#changed.event;
  readonly #connection: () => Promise<Connection>;

  constructor(connection: () => Promise<Connection>) {
    this.#connection = connection;
  }

  refresh(): void {
    this.#changed.fire(undefined);
  }

  dispose(): void {
    this.#changed.dispose();
  }

  async getChildren(node?: Node): Promise<Node[]> {
    if (node && node.kind !== 'monitor') return [];

    const connection = await this.#connection();
    if (typeof connection === 'string') return [message(connection)];

    try {
      if (!node) {
        const monitors = await fetchMonitors(connection.origin, connection.apiKey, localFetch);
        if (monitors.length === 0) return [message('No monitors yet. Create one with "Helix: Open Web Monitoring".')];
        return monitors.map((monitor) => ({ kind: 'monitor', monitor }));
      }

      const checks = await fetchHistory(connection.origin, connection.apiKey, node.monitor.id, localFetch);
      if (checks.length === 0) return [message('No checks yet.')];
      return checks.map((check) => ({ kind: 'check', check }));
    } catch (error) {
      return [message(error instanceof Error ? error.message : String(error))];
    }
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === 'message') {
      const item = new vscode.TreeItem(node.text);
      item.iconPath = new vscode.ThemeIcon('info');
      return item;
    }
    if (node.kind === 'monitor') {
      return itemFrom(monitorRow(node.monitor), vscode.TreeItemCollapsibleState.Collapsed, 'eye');
    }
    return itemFrom(checkRow(node.check), vscode.TreeItemCollapsibleState.None, node.check.changed ? 'diff' : 'check');
  }
}

function message(text: string): Node {
  return { kind: 'message', text };
}

function itemFrom(row: Row, state: vscode.TreeItemCollapsibleState, icon: string): vscode.TreeItem {
  const item = new vscode.TreeItem(row.label, state);
  item.description = row.description;
  item.tooltip = row.tooltip;
  item.iconPath = new vscode.ThemeIcon(icon);
  return item;
}
