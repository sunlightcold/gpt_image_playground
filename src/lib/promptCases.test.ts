import { describe, expect, it } from 'vitest'
import { GPT_IMAGE_2_CASES, GPT_IMAGE_2_CASE_SOURCE } from '../data/gptImage2Cases'
import {
  ALL_CASE_FILTER_VALUE,
  BUILTIN_PROMPT_CASE_DATASET,
  filterPromptCases,
  getCaseCategoryLabel,
  getCasePromptPreview,
  getCaseTags,
  normalizePromptCaseDataset,
} from './promptCases'

describe('prompt case filters', () => {
  it('keeps upstream case entries available locally', () => {
    expect(GPT_IMAGE_2_CASES.length).toBeGreaterThanOrEqual(485)
    expect(GPT_IMAGE_2_CASE_SOURCE.totalCases).toBe(GPT_IMAGE_2_CASES.length)
    expect(new Set(GPT_IMAGE_2_CASES.map((caseItem) => caseItem.id)).size).toBe(GPT_IMAGE_2_CASES.length)
    expect(GPT_IMAGE_2_CASES[0].id).toBe(Math.max(...GPT_IMAGE_2_CASES.map((caseItem) => caseItem.id)))
  })

  it('uses current repository images while keeping upstream source links fixed', () => {
    const first = GPT_IMAGE_2_CASES[0]
    expect(first.image).toContain(`raw.githubusercontent.com/sunlightcold/gpt_image_playground/main/data/gpt-image-2/images/case${first.id}.`)
    expect(GPT_IMAGE_2_CASES[0].githubUrl).toContain(`/blob/${GPT_IMAGE_2_CASE_SOURCE.commit}/`)
  })

  it('keeps every case image mirrored in this repository', () => {
    const currentRepoImagePattern = /^https:\/\/raw\.githubusercontent\.com\/sunlightcold\/gpt_image_playground\/main\/data\/gpt-image-2\/images\/case\d+\.(jpg|jpeg|png|webp)$/i
    for (const caseItem of GPT_IMAGE_2_CASES) {
      expect(caseItem.image).toMatch(currentRepoImagePattern)
      expect(new URL(caseItem.image).pathname).toContain(`/case${caseItem.id}.`)
    }
  })

  it('filters cases by category, style, and scene', () => {
    const photoCases = filterPromptCases({ category: 'Photography & Realism' })
    expect(photoCases.length).toBeGreaterThan(0)
    expect(photoCases.every((caseItem) => caseItem.category === 'Photography & Realism')).toBe(true)

    const realisticCases = filterPromptCases({ style: 'Realistic' })
    expect(realisticCases.length).toBeGreaterThan(0)
    expect(realisticCases.every((caseItem) => caseItem.styles.includes('Realistic'))).toBe(true)

    const fashionCases = filterPromptCases({ scene: 'Fashion' })
    expect(fashionCases.length).toBeGreaterThan(0)
    expect(fashionCases.every((caseItem) => caseItem.scenes.includes('Fashion'))).toBe(true)
  })

  it('searches case id, title, source, labels, and prompt body', () => {
    expect(filterPromptCases({ query: '488' }).map((caseItem) => caseItem.id)).toContain(488)
    expect(filterPromptCases({ query: '屋顶球场日落人像' }).map((caseItem) => caseItem.id)).toContain(488)
    expect(filterPromptCases({ query: '@HaniaAi12' }).map((caseItem) => caseItem.id)).toContain(488)
    expect(filterPromptCases({ query: '摄影与写实' }).every((caseItem) => (
      caseItem.category === 'Photography & Realism'
    ))).toBe(true)
  })

  it('creates compact prompt previews and display tags', () => {
    const first = filterPromptCases({ category: ALL_CASE_FILTER_VALUE })[0]
    const preview = getCasePromptPreview('a\n\nb '.repeat(80), 20)
    expect(preview.length).toBeLessThanOrEqual(23)
    expect(preview).not.toContain('\n')
    expect(getCaseTags(first).length).toBeGreaterThan(0)
    expect(getCaseCategoryLabel('Photography & Realism')).toBe('摄影与写实')
  })

  it('normalizes remote datasets and uses them for filters', () => {
    const remoteCase = {
      ...GPT_IMAGE_2_CASES[0],
      id: 9001,
      title: 'Remote runtime case',
      category: 'runtime-category',
      styles: ['runtime-style'],
      scenes: ['runtime-scene'],
      prompt: 'runtime prompt body',
    }
    const dataset = normalizePromptCaseDataset({
      source: {
        repository: 'https://example.com/cases',
        commit: 'runtime-commit',
        license: 'MIT',
        totalCases: 1,
      },
      categories: [{ value: 'runtime-category', label: '运行时分类' }],
      styles: [{ value: 'runtime-style', label: '运行时风格' }],
      scenes: [{ value: 'runtime-scene', label: '运行时场景' }],
      cases: [remoteCase, { ...remoteCase, id: 'invalid' }],
    })

    expect(dataset).not.toBeNull()
    expect(dataset?.cases).toHaveLength(1)
    expect(filterPromptCases({ query: '运行时分类' }, dataset ?? BUILTIN_PROMPT_CASE_DATASET)).toHaveLength(1)
    expect(filterPromptCases({ style: 'runtime-style' }, dataset ?? BUILTIN_PROMPT_CASE_DATASET)[0].id).toBe(9001)
  })
})
