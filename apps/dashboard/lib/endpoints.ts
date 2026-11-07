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

export type RunnableEndpoint = Endpoint;

export type RunStatus = 'success' | 'failure' | 'running' | 'cancelled';
