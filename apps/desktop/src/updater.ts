import { autoUpdater } from 'electron-updater'
import type { Logger } from './log'

export function startUpdater(log: Logger): void {
  const line = (level: string) => (m: unknown) => log(`updater ${level}: ${m instanceof Error ? m.message : String(m)}`)
  try {
    autoUpdater.logger = { info: line('info'), warn: line('warn'), error: line('error'), debug: line('debug') }
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.on('error', line('error'))
    autoUpdater.checkForUpdatesAndNotify().catch(line('error'))
  } catch (e) {
    line('error')(e)
  }
}
