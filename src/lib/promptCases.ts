import {
  GPT_IMAGE_2_CASE_CATEGORIES,
  GPT_IMAGE_2_CASES,
  GPT_IMAGE_2_CASE_SCENES,
  GPT_IMAGE_2_CASE_SOURCE,
  GPT_IMAGE_2_CASE_STYLES,
  type GptImage2Case,
  type GptImage2CaseOption,
} from '../data/gptImage2Cases'
import { readRuntimeEnv } from './runtimeEnv'

export type CaseFilters = {
  category?: string
  style?: string
  scene?: string
  query?: string
}

export type PromptCaseSource = typeof GPT_IMAGE_2_CASE_SOURCE

export type PromptCaseDataset = {
  source: PromptCaseSource
  categories: GptImage2CaseOption[]
  styles: GptImage2CaseOption[]
  scenes: GptImage2CaseOption[]
  cases: GptImage2Case[]
}

export const ALL_CASE_FILTER_VALUE = 'all'
export const PROMPT_CASE_DATASET_URL = readRuntimeEnv(import.meta.env.VITE_PROMPT_CASE_DATASET_URL) || '/prompt-cases'

export const BUILTIN_PROMPT_CASE_DATASET: PromptCaseDataset = {
  source: GPT_IMAGE_2_CASE_SOURCE,
  categories: GPT_IMAGE_2_CASE_CATEGORIES,
  styles: GPT_IMAGE_2_CASE_STYLES,
  scenes: GPT_IMAGE_2_CASE_SCENES,
  cases: GPT_IMAGE_2_CASES,
}

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase()
}

function findOptionLabel(options: GptImage2CaseOption[], value: string) {
  return options.find((option) => option.value === value)?.label ?? value
}

export function getCaseCategoryLabel(value: string, dataset = BUILTIN_PROMPT_CASE_DATASET) {
  return findOptionLabel(dataset.categories, value)
}

export function getCaseTagLabel(value: string, dataset = BUILTIN_PROMPT_CASE_DATASET) {
  return findOptionLabel([...dataset.styles, ...dataset.scenes], value)
}

export function getCasePromptPreview(prompt: string, maxLength = 180) {
  const text = prompt.replace(/\s+/g, ' ').trim()
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

export function getCaseTags(caseItem: GptImage2Case, maxCount = 4) {
  return [...new Set([...caseItem.styles, ...caseItem.scenes])].slice(0, maxCount)
}

function isCaseOption(input: unknown): input is GptImage2CaseOption {
  if (!input || typeof input !== 'object') return false
  const item = input as Record<string, unknown>
  return typeof item.value === 'string' && typeof item.label === 'string'
}

function isPromptCase(input: unknown): input is GptImage2Case {
  if (!input || typeof input !== 'object') return false
  const item = input as Record<string, unknown>
  return (
    typeof item.id === 'number' &&
    typeof item.title === 'string' &&
    typeof item.image === 'string' &&
    typeof item.imageAlt === 'string' &&
    typeof item.sourceLabel === 'string' &&
    typeof item.prompt === 'string' &&
    typeof item.promptPreview === 'string' &&
    typeof item.category === 'string' &&
    Array.isArray(item.styles) &&
    item.styles.every((value) => typeof value === 'string') &&
    Array.isArray(item.scenes) &&
    item.scenes.every((value) => typeof value === 'string') &&
    typeof item.featured === 'boolean' &&
    typeof item.githubUrl === 'string'
  )
}

export function normalizePromptCaseDataset(input: unknown): PromptCaseDataset | null {
  if (!input || typeof input !== 'object') return null
  const record = input as Record<string, unknown>
  const sourceRecord = record.source && typeof record.source === 'object' ? record.source as Record<string, unknown> : null
  const source = sourceRecord && typeof sourceRecord.repository === 'string' && typeof sourceRecord.commit === 'string'
    ? {
        repository: sourceRecord.repository,
        commit: sourceRecord.commit,
        license: typeof sourceRecord.license === 'string' ? sourceRecord.license : 'MIT',
        totalCases: typeof sourceRecord.totalCases === 'number' ? sourceRecord.totalCases : 0,
      }
    : BUILTIN_PROMPT_CASE_DATASET.source
  const cases = Array.isArray(record.cases) ? record.cases.filter(isPromptCase) : []
  if (cases.length === 0) return null

  return {
    source: { ...source, totalCases: source.totalCases || cases.length },
    categories: Array.isArray(record.categories) && record.categories.every(isCaseOption) ? record.categories : BUILTIN_PROMPT_CASE_DATASET.categories,
    styles: Array.isArray(record.styles) && record.styles.every(isCaseOption) ? record.styles : BUILTIN_PROMPT_CASE_DATASET.styles,
    scenes: Array.isArray(record.scenes) && record.scenes.every(isCaseOption) ? record.scenes : BUILTIN_PROMPT_CASE_DATASET.scenes,
    cases,
  }
}

function withCacheBuster(url: string) {
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}t=${Date.now()}`
}

export async function loadRemotePromptCaseDataset(url = PROMPT_CASE_DATASET_URL): Promise<PromptCaseDataset | null> {
  try {
    const response = await fetch(withCacheBuster(url), {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) return null
    return normalizePromptCaseDataset(await response.json())
  } catch {
    return null
  }
}

export function filterPromptCases(filters: CaseFilters = {}, dataset = BUILTIN_PROMPT_CASE_DATASET): GptImage2Case[] {
  const category = filters.category || ALL_CASE_FILTER_VALUE
  const style = filters.style || ALL_CASE_FILTER_VALUE
  const scene = filters.scene || ALL_CASE_FILTER_VALUE
  const query = normalizeSearchText(filters.query ?? '')

  return dataset.cases.filter((caseItem) => {
    if (category !== ALL_CASE_FILTER_VALUE && caseItem.category !== category) return false
    if (style !== ALL_CASE_FILTER_VALUE && !caseItem.styles.includes(style)) return false
    if (scene !== ALL_CASE_FILTER_VALUE && !caseItem.scenes.includes(scene)) return false
    if (!query) return true

    const haystack = [
      String(caseItem.id),
      caseItem.title,
      caseItem.category,
      getCaseCategoryLabel(caseItem.category, dataset),
      caseItem.sourceLabel,
      ...caseItem.styles,
      ...caseItem.styles.map((tag) => getCaseTagLabel(tag, dataset)),
      ...caseItem.scenes,
      ...caseItem.scenes.map((tag) => getCaseTagLabel(tag, dataset)),
      caseItem.prompt,
    ].join('\n').toLowerCase()

    return haystack.includes(query)
  })
}
