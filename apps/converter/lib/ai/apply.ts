import type { ConvertSettings } from '@/lib/jobs/types';
import type { ResolvedIntent } from './resolve';

/**
 * Translates a validated, engine-shaped ResolvedIntent into the UI-facing
 * ConvertSettings patch the format-picker/settings-panel already consume.
 * Runs only after parseResolvedIntent has validated the intent against the
 * real validate*Options functions -- this function never validates on its
 * own, it only reshapes.
 */
export function intentToSettingsPatch(intent: ResolvedIntent): Partial<ConvertSettings> {
  if (intent.op === 'gif') {
    const patch: Partial<ConvertSettings> = { to: 'gif', gif: { fps: intent.fps, width: intent.width } };
    if (intent.options.trim) patch.trim = intent.options.trim;
    return patch;
  }

  if (intent.op === 'image') {
    const patch: Partial<ConvertSettings> = { to: intent.to };
    if (intent.quality !== undefined) patch.quality = intent.quality;
    if (intent.resize) patch.resize = intent.resize;
    if (intent.options.rotate !== undefined) patch.rotate = intent.options.rotate;
    if (intent.options.flip !== undefined) patch.flip = intent.options.flip;
    return patch;
  }

  // convert | compress
  const patch: Partial<ConvertSettings> = {};
  if (intent.to) patch.to = intent.to;
  if (intent.options.trim) patch.trim = intent.options.trim;
  if (intent.options.rotate !== undefined) patch.rotate = intent.options.rotate;
  if (intent.options.flip !== undefined) patch.flip = intent.options.flip;
  if (intent.options.width !== undefined && intent.options.height !== undefined) {
    patch.resize = { width: intent.options.width, height: intent.options.height };
  }
  if (intent.op === 'compress') {
    if (intent.preset) patch.preset = intent.preset === 'archive' ? null : intent.preset;
    if (intent.target !== undefined) patch.targetBytes = intent.target;
  } else if (intent.options.targetBytes !== undefined) {
    patch.targetBytes = intent.options.targetBytes;
  }
  return patch;
}
