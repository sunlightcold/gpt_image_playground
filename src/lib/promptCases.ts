import {
  GPT_IMAGE_2_CASE_CATEGORIES,
  GPT_IMAGE_2_CASES,
  GPT_IMAGE_2_CASE_SCENES,
  GPT_IMAGE_2_CASE_STYLES,
  type GptImage2Case,
  type GptImage2CaseOption,
} from '../data/gptImage2Cases'

export type CaseFilters = {
  category?: string
  style?: string
  scene?: string
  query?: string
}

export const ALL_CASE_FILTER_VALUE = 'all'

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase()
}

function findOptionLabel(options: GptImage2CaseOption[], value: string) {
  return options.find((option) => option.value === value)?.label ?? value
}

export function getCaseCategoryLabel(value: string) {
  return findOptionLabel(GPT_IMAGE_2_CASE_CATEGORIES, value)
}

export function getCaseTagLabel(value: string) {
  return findOptionLabel([...GPT_IMAGE_2_CASE_STYLES, ...GPT_IMAGE_2_CASE_SCENES], value)
}

export function getCasePromptPreview(prompt: string, maxLength = 180) {
  const text = prompt.replace(/\s+/g, ' ').trim()
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

export function getCaseTags(caseItem: GptImage2Case, maxCount = 4) {
  return [...new Set([...caseItem.styles, ...caseItem.scenes])].slice(0, maxCount)
}

export function filterPromptCases(filters: CaseFilters = {}): GptImage2Case[] {
  const category = filters.category || ALL_CASE_FILTER_VALUE
  const style = filters.style || ALL_CASE_FILTER_VALUE
  const scene = filters.scene || ALL_CASE_FILTER_VALUE
  const query = normalizeSearchText(filters.query ?? '')

  return GPT_IMAGE_2_CASES.filter((caseItem) => {
    if (category !== ALL_CASE_FILTER_VALUE && caseItem.category !== category) return false
    if (style !== ALL_CASE_FILTER_VALUE && !caseItem.styles.includes(style)) return false
    if (scene !== ALL_CASE_FILTER_VALUE && !caseItem.scenes.includes(scene)) return false
    if (!query) return true

    const haystack = [
      String(caseItem.id),
      caseItem.title,
      caseItem.category,
      getCaseCategoryLabel(caseItem.category),
      caseItem.sourceLabel,
      ...caseItem.styles,
      ...caseItem.styles.map(getCaseTagLabel),
      ...caseItem.scenes,
      ...caseItem.scenes.map(getCaseTagLabel),
      caseItem.prompt,
    ].join('\n').toLowerCase()

    return haystack.includes(query)
  })
}
