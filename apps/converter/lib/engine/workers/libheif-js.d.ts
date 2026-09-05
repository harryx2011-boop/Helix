declare module 'libheif-js/wasm-bundle' {
  export type HeifImage = {
    get_width(): number;
    get_height(): number;
    display(
      target: { data: Uint8ClampedArray; width: number; height: number },
      callback: (result: unknown) => void,
    ): void;
  };

  export class HeifDecoder {
    decode(bytes: Uint8Array): HeifImage[];
  }

  const libheif: { HeifDecoder: typeof HeifDecoder };
  export default libheif;
}
