/** The endpoints the playground and activity views cover. */
export type Endpoint =
  | 'scrape'
  | 'parse'
  | 'metadata'
  | 'map'
  | 'search'
  | 'crawl'
  | 'interact'
  | 'monitor'
  | 'convert'
  | 'document'
  | 'extract'
  | 'screenshot';

/**
 * The subset the SDK client and the playground can actually call. `document`,
 * `extract` and `screenshot` are catalogued and documented ahead of their SDK
 * methods, so they are deliberately absent here until those land.
 */
export type RunnableEndpoint = Exclude<Endpoint, 'document' | 'extract' | 'screenshot'>;

export type RunStatus = 'success' | 'failure' | 'running' | 'cancelled';
