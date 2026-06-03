import {
  GPT_IMAGE_2_TEMPLATE_CATEGORIES,
  GPT_IMAGE_2_TEMPLATES,
  type PromptTemplate,
} from '../data/gptImage2Templates'

export type TemplateFilters = {
  categoryId?: string
  tag?: string
  query?: string
}

export const ALL_TEMPLATE_CATEGORY_ID = 'all'
export const ALL_TEMPLATE_TAG = 'all'

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase()
}

export function getPromptTemplateCategoryLabel(categoryId: string) {
  return GPT_IMAGE_2_TEMPLATE_CATEGORIES.find((category) => category.id === categoryId)?.label ?? categoryId
}

export function getPromptTemplateTags(categoryId = ALL_TEMPLATE_CATEGORY_ID) {
  const templates = categoryId === ALL_TEMPLATE_CATEGORY_ID
    ? GPT_IMAGE_2_TEMPLATES
    : GPT_IMAGE_2_TEMPLATES.filter((template) => template.categoryId === categoryId)
  return [...new Set(templates.flatMap((template) => template.tags))].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
}

export function getPromptTemplatePreview(prompt: string, maxLength = 180) {
  const text = prompt.replace(/\s+/g, ' ').trim()
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

export function filterPromptTemplates(filters: TemplateFilters = {}): PromptTemplate[] {
  const categoryId = filters.categoryId || ALL_TEMPLATE_CATEGORY_ID
  const tag = filters.tag || ALL_TEMPLATE_TAG
  const query = normalizeSearchText(filters.query ?? '')

  return GPT_IMAGE_2_TEMPLATES.filter((template) => {
    if (categoryId !== ALL_TEMPLATE_CATEGORY_ID && template.categoryId !== categoryId) return false
    if (tag !== ALL_TEMPLATE_TAG && !template.tags.includes(tag)) return false
    if (!query) return true

    const haystack = [
      template.title,
      template.description,
      template.categoryId,
      template.promptType,
      ...template.tags,
      template.prompt,
      getPromptTemplateCategoryLabel(template.categoryId),
    ].join('\n').toLowerCase()

    return haystack.includes(query)
  })
}
