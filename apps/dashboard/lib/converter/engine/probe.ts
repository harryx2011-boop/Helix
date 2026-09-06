/**
 * ffmpeg.wasm has no ffprobe binary in the client bundle worth shipping just
 * for a duration lookup; the browser's own media decoder already knows it.
 * Falls back to 0 (treated as "unknown") on anything that isn't decodable
 * media, which callers already handle the same way ffprobe's absence was
 * handled server-side.
 */
export function probeDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const isMedia = file.type.startsWith('video/') || file.type.startsWith('audio/');
    if (!isMedia) {
      resolve(0);
      return;
    }
    const url = URL.createObjectURL(file);
    const el = document.createElement(file.type.startsWith('video/') ? 'video' : 'audio');
    const done = (value: number) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = window.setTimeout(() => done(0), 8000);
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      window.clearTimeout(timer);
      done(Number.isFinite(el.duration) ? el.duration : 0);
    };
    el.onerror = () => {
      window.clearTimeout(timer);
      done(0);
    };
    el.src = url;
  });
}
