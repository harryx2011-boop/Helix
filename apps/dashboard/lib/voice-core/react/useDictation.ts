import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { DictationController, type DictationOptions, type DictationState } from "./dictation";

export interface UseDictation {
  state: DictationState;
  partial: string;
  error: string | null;
  start(): void;
  stop(): void;
  toggle(): void;
  cancel(): void;
}

/**
 * The mic button for a prompt box. `connect` asks the host for the service
 * (for Electron: an IPC call that runs VoiceCoreSupervisor.ensureStarted);
 * `onText` receives each final transcript to insert.
 */
export function useDictation(options: DictationOptions): UseDictation {
  const ref = useRef<DictationController | null>(null);
  if (ref.current === null) ref.current = new DictationController(options);
  const controller = ref.current;

  useEffect(() => {
    controller.setOptions(options);
  });

  useEffect(() => () => controller.cancel(), [controller]);

  const snap = useSyncExternalStore(controller.subscribe, () => controller.snapshot);

  return {
    ...snap,
    start: useCallback(() => void controller.start(), [controller]),
    stop: useCallback(() => void controller.stop(), [controller]),
    toggle: useCallback(() => void controller.toggle(), [controller]),
    cancel: useCallback(() => controller.cancel(), [controller]),
  };
}
