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
  | 'document'
  | 'extract'
  | 'screenshot';

/**
 * The subset the SDK client and the playground can actually call.
 *
 * Currently every endpoint, kept as its own name so a catalogued-but-not-yet-
 * callable endpoint stays a compile error at the four surfaces that render a
 * playground link, rather than a 404 discovered by clicking one.
 */
export type RunnableEndpoint = Endpoint;

export type RunStatus = 'success' | 'failure' | 'running' | 'cancelled';
