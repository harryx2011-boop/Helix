import { apiSpec } from './api'
import { extractSpec } from './extract'
import { fetchSpec } from './fetch'
import type { ChildFactory } from './types'

export const children: ChildFactory[] = [apiSpec, extractSpec, fetchSpec]
