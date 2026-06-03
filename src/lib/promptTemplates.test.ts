import { describe, expect, it } from 'vitest'
import { GPT_IMAGE_2_TEMPLATES } from '../data/gptImage2Templates'
import {
  ALL_TEMPLATE_CATEGORY_ID,
  ALL_TEMPLATE_TAG,
  filterPromptTemplates,
  getPromptTemplatePreview,
  getPromptTemplateTags,
} from './promptTemplates'

describe('prompt template filters', () => {
  it('keeps all upstream template entries available locally', () => {
    expect(GPT_IMAGE_2_TEMPLATES).toHaveLength(47)
    expect(new Set(GPT_IMAGE_2_TEMPLATES.map((template) => template.id)).size).toBe(47)
  })

  it('filters templates by category and tag', () => {
    const posterTemplates = filterPromptTemplates({ categoryId: 'poster', tag: ALL_TEMPLATE_TAG })
    expect(posterTemplates.length).toBeGreaterThan(0)
    expect(posterTemplates.every((template) => template.categoryId === 'poster')).toBe(true)

    const jsonTemplates = filterPromptTemplates({ categoryId: ALL_TEMPLATE_CATEGORY_ID, tag: 'JSON' })
    expect(jsonTemplates.length).toBeGreaterThan(0)
    expect(jsonTemplates.every((template) => template.tags.includes('JSON'))).toBe(true)
  })

  it('searches title, tags, category labels, and prompt body', () => {
    expect(filterPromptTemplates({ query: '直播' }).map((template) => template.id)).toContain('ui-live')
    expect(filterPromptTemplates({ query: 'Movie Poster' }).map((template) => template.id)).toContain('poster-json')
    expect(filterPromptTemplates({ query: '城市生命系统图谱' }).map((template) => template.id)).toContain('infographic-json')
  })

  it('returns tags scoped to the selected category', () => {
    expect(getPromptTemplateTags('poster')).toContain('海报')
    expect(getPromptTemplateTags('poster')).not.toContain('建筑')
  })

  it('creates compact prompt previews', () => {
    const preview = getPromptTemplatePreview('a\n\nb '.repeat(80), 20)
    expect(preview.length).toBeLessThanOrEqual(23)
    expect(preview).not.toContain('\n')
  })
})
