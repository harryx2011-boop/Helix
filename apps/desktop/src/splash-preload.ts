import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('helixSplash', {
  onState: (cb: (state: unknown) => void) => {
    ipcRenderer.on('splash:state', (_e, state) => cb(state))
    ipcRenderer.send('splash:ready')
  },
  showLog: (name: string) => ipcRenderer.send('splash:show-log', String(name)),
  retry: () => ipcRenderer.send('splash:retry'),
  quit: () => ipcRenderer.send('splash:quit'),
})
