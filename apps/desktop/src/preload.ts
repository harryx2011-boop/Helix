import { contextBridge, ipcRenderer } from 'electron'

const info = ipcRenderer.sendSync('helix:desktop-info') as { apiKey: string; adminToken: string; version: string } | null

if (info) {
  contextBridge.exposeInMainWorld(
    'helixDesktop',
    Object.freeze({
      apiKey: info.apiKey,
      adminToken: info.adminToken,
      version: info.version,
      platform: 'win32' as const,
      voice: Object.freeze({ connect: () => ipcRenderer.invoke('helix:voice-connect') as Promise<unknown> }),
    }),
  )
}
