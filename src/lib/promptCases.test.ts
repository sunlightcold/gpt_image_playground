import { describe, expect, it } from 'vitest'
import { GPT_IMAGE_2_CASES, GPT_IMAGE_2_CASE_SOURCE } from '../data/gptImage2Cases'
import {
  ALL_CASE_FILTER_VALUE,
  filterPromptCases,
  getCaseCategoryLabel,
  getCasePromptPreview,
  getCaseTags,
} from './promptCases'

describe('prompt case filters', () => {
  it('keeps upstream case entries available locally', () => {
    expect(GPT_IMAGE_2_CASES).toHaveLength(485)
    expect(GPT_IMAGE_2_CASE_SOURCE.totalCases).toBe(485)
    expect(new Set(GPT_IMAGE_2_CASES.map((caseItem) => caseItem.id)).size).toBe(485)
    expect(GPT_IMAGE_2_CASES[0].id).toBe(488)
  })

  it('uses current repository images while keeping upstream source links fixed', () => {
    expect(GPT_IMAGE_2_CASES[0].image).toContain('raw.githubusercontent.com/sunlightcold/gpt_image_playground/main/data/gpt-image-2/images/case488.jpg')
    expect(GPT_IMAGE_2_CASES[0].githubUrl).toContain(`/blob/${GPT_IMAGE_2_CASE_SOURCE.commit}/`)
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
})
