declare module 'js-yaml' {
  export function load(input: string, options?: { filename?: string }): unknown;
  const yaml: { load: typeof load };
  export default yaml;
}
