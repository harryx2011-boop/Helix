/** Resamples the device rate to 16 kHz and posts 320-sample (20 ms) Int16 frames.
 *  Copied from Composer's public/worklets/mic-processor.js; inlined so a host app
 *  has no asset to copy. */
export const MIC_WORKLET_NAME = "voice-core-mic";

export const MIC_WORKLET_SOURCE = `
const TARGET_RATE = 16000;
const FRAME = 320;
class VoiceCoreMic extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / TARGET_RATE;
    this.out = new Int16Array(FRAME);
    this.outIndex = 0;
    this.pos = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch || ch.length === 0) return true;
    const n = ch.length;
    while (this.pos < n) {
      const i = Math.floor(this.pos);
      const frac = this.pos - i;
      const a = ch[i];
      const b = i + 1 < n ? ch[i + 1] : ch[n - 1];
      const s = a + (b - a) * frac;
      const c = s < -1 ? -1 : s > 1 ? 1 : s;
      this.out[this.outIndex++] = c < 0 ? c * 0x8000 : c * 0x7fff;
      if (this.outIndex === FRAME) {
        const frame = this.out.slice(0);
        this.port.postMessage(frame, [frame.buffer]);
        this.outIndex = 0;
      }
      this.pos += this.ratio;
    }
    this.pos -= n;
    return true;
  }
}
registerProcessor("${MIC_WORKLET_NAME}", VoiceCoreMic);
`;
