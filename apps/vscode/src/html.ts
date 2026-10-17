/**
 * The panel's page: one full-size iframe on the Helix app, and a small
 * script that passes the API key from the extension to that iframe.
 *
 * The key never sits in this HTML. The framed app asks for it
 * (`helix:embed-hello`, from `apps/dashboard/lib/embed.ts`); this page asks
 * the extension, then posts the answer to the iframe at its exact origin.
 */

export interface PanelPage {
  /** `http://127.0.0.1:<port>`. */
  origin: string;
  /** The app page to open, e.g. `/app` or `/app/playground?tab=monitor`. */
  path: string;
  /** A fresh random value per render, for the script's CSP nonce. */
  nonce: string;
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function panelHtml(page: PanelPage): string {
  const csp = `default-src 'none'; frame-src ${page.origin}; script-src 'nonce-${page.nonce}'; style-src 'unsafe-inline';`;
  const src = escapeAttribute(`${page.origin}${page.path}`);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${escapeAttribute(csp)}">
<style>
  html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; }
  iframe { border: 0; width: 100%; height: 100%; display: block; }
</style>
</head>
<body>
<iframe id="helix" src="${src}" title="Helix"></iframe>
<script nonce="${page.nonce}">
  const vscode = acquireVsCodeApi();
  const ORIGIN = ${JSON.stringify(page.origin)};
  const frame = document.getElementById("helix");

  window.addEventListener("message", (event) => {
    const message = event.data;
    if (!message || typeof message !== "object") return;

    if (event.source === frame.contentWindow && event.origin === ORIGIN) {
      if (message.type === "helix:embed-hello") vscode.postMessage({ type: "need-key" });
      return;
    }

    // A message from the extension carries this webview's own origin (its source
    // is not window.parent in VS Code 1.137); no frame inside the app has that origin.
    if (event.origin === window.origin && message.type === "helix:key" && typeof message.apiKey === "string") {
      frame.contentWindow.postMessage({ type: "helix:embed-key", apiKey: message.apiKey }, ORIGIN);
    }
  });
</script>
</body>
</html>`;
}
