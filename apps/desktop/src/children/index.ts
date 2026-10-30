import { apiSpec } from './api'
import { extractSpec } from './extract'
import { scrapeSpec } from './scrape'
import type { ChildFactory } from './types'

export const children: ChildFactory[] = [apiSpec, extractSpec, scrapeSpec]
