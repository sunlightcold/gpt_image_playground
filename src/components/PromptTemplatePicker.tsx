import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  GPT_IMAGE_2_TEMPLATE_CATEGORIES,
  GPT_IMAGE_2_TEMPLATE_SOURCE,
  GPT_IMAGE_2_TEMPLATES,
  type PromptTemplate,
} from '../data/gptImage2Templates'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import {
  ALL_TEMPLATE_CATEGORY_ID,
  ALL_TEMPLATE_TAG,
  filterPromptTemplates,
  getPromptTemplateCategoryLabel,
  getPromptTemplatePreview,
  getPromptTemplateTags,
} from '../lib/promptTemplates'
import { CloseIcon, ExternalLinkIcon } from './icons'

type PromptTemplatePickerProps = {
  onClose: () => void
  onUseTemplate: (template: PromptTemplate) => void
  onAppendTemplate: (template: PromptTemplate) => void
}

const CATEGORY_OPTIONS = [
  { id: ALL_TEMPLATE_CATEGORY_ID, label: '全部' },
  ...GPT_IMAGE_2_TEMPLATE_CATEGORIES,
]

export default function PromptTemplatePicker({
  onClose,
  onUseTemplate,
  onAppendTemplate,
}: PromptTemplatePickerProps) {
  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState(ALL_TEMPLATE_CATEGORY_ID)
  const [tag, setTag] = useState(ALL_TEMPLATE_TAG)

  const availableTags = useMemo(() => getPromptTemplateTags(categoryId), [categoryId])
  const templates = useMemo(() => filterPromptTemplates({ categoryId, tag, query }), [categoryId, query, tag])
  useCloseOnEscape(true, onClose)

  useEffect(() => {
    if (tag !== ALL_TEMPLATE_TAG && !availableTags.includes(tag)) {
      setTag(ALL_TEMPLATE_TAG)
    }
  }, [availableTags, tag])

  const panel = (
    <div
      data-no-drag-select
      className="fixed inset-x-0 z-40 flex justify-center pointer-events-none safe-area-x"
      style={{ bottom: 'calc(var(--input-bar-clearance, 0px) + 12px)' }}
    >
      <div
        role="dialog"
        aria-label="GPT-Image2 模板"
        className="pointer-events-auto flex w-full max-w-5xl flex-col overflow-hidden rounded-none border-2 border-black bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] animate-dropdown-up dark:border-white dark:bg-zinc-900 dark:shadow-[8px_8px_0px_0px_rgba(255,255,255,1)]"
        style={{ maxHeight: 'calc(100dvh - var(--input-bar-clearance, 0px) - 24px)' }}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b-2 border-black px-3 py-3 dark:border-white sm:px-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-black text-slate-900 dark:text-white">GPT-Image2 模板</h3>
              <span className="rounded-none border border-black bg-[#FFE66D] px-1.5 py-0.5 text-[10px] font-black text-slate-900 dark:border-white dark:bg-yellow-400">
                {templates.length}/{GPT_IMAGE_2_TEMPLATES.length}
              </span>
              <a
                href={GPT_IMAGE_2_TEMPLATE_SOURCE.repository}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-slate-900 dark:text-gray-400 dark:hover:text-white"
              >
                awesome-gpt-image-2
                <ExternalLinkIcon className="h-3 w-3" />
              </a>
            </div>
            <div className="mt-1 text-[11px] font-bold text-slate-500 dark:text-gray-400">
              来源：MIT License · {GPT_IMAGE_2_TEMPLATE_SOURCE.commit.slice(0, 7)}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-none border-2 border-black bg-white text-slate-900 transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:bg-[#FFE66D] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:border-white dark:bg-zinc-800 dark:text-gray-200 dark:hover:bg-yellow-400 dark:hover:text-black dark:hover:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]"
            aria-label="关闭模板"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="shrink-0 space-y-2 border-b-2 border-black p-3 dark:border-white sm:p-4">
          <label className="block">
            <span className="mb-1 block text-[11px] font-black text-slate-500 dark:text-gray-400">搜索模板</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="标题、分类、标签或 prompt 内容"
              className="h-10 w-full rounded-none border-2 border-black bg-white px-3 text-sm font-bold text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:border-white dark:bg-zinc-950 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]"
            />
          </label>

          <div className="hide-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
            {CATEGORY_OPTIONS.map((category) => {
              const active = categoryId === category.id
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => {
                    setCategoryId(category.id)
                    setTag(ALL_TEMPLATE_TAG)
                  }}
                  className={`h-8 shrink-0 rounded-none border-2 px-2.5 text-xs font-black transition-all ${
                    active
                      ? 'border-black bg-[#FFE66D] text-slate-900 dark:border-white dark:bg-yellow-400 dark:text-black'
                      : 'border-black bg-white text-slate-700 hover:-translate-y-0.5 hover:bg-slate-50 dark:border-white dark:bg-zinc-800 dark:text-gray-200 dark:hover:bg-zinc-700'
                  }`}
                >
                  {category.label}
                </button>
              )
            })}
          </div>

          {availableTags.length > 0 && (
            <div className="hide-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
              {[ALL_TEMPLATE_TAG, ...availableTags].map((item) => {
                const active = tag === item
                const label = item === ALL_TEMPLATE_TAG ? '全部标签' : item
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setTag(item)}
                    className={`h-7 shrink-0 rounded-none border px-2 text-[11px] font-bold transition-colors ${
                      active
                        ? 'border-black bg-slate-900 text-white dark:border-white dark:bg-white dark:text-black'
                        : 'border-slate-300 bg-white text-slate-500 hover:border-black hover:text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-gray-400 dark:hover:border-white dark:hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 custom-scrollbar sm:p-4">
          {templates.length === 0 ? (
            <div className="flex min-h-[120px] items-center justify-center border-2 border-dashed border-slate-300 bg-slate-50 px-4 text-center text-sm font-bold text-slate-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-gray-400">
              没有找到匹配模板
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {templates.map((template) => (
                <article
                  key={template.id}
                  className="flex min-h-[190px] flex-col rounded-none border-2 border-black bg-white p-3 transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:border-white dark:bg-zinc-950 dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)]"
                >
                  <div className="mb-2 min-w-0">
                    <h4 className="line-clamp-2 text-sm font-black leading-snug text-slate-900 dark:text-white">
                      {template.title}
                    </h4>
                    <div className="mt-1 text-[11px] font-bold text-slate-500 dark:text-gray-400">
                      {getPromptTemplateCategoryLabel(template.categoryId)} · {template.promptType.toUpperCase()}
                    </div>
                  </div>

                  <p className="mb-2 text-xs font-bold leading-relaxed text-slate-600 dark:text-gray-300">
                    {template.description}
                  </p>

                  <p className="line-clamp-4 flex-1 whitespace-pre-wrap break-words rounded-none border border-slate-200 bg-slate-50 p-2 font-mono text-[11px] leading-relaxed text-slate-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-gray-400">
                    {getPromptTemplatePreview(template.prompt, 220)}
                  </p>

                  <div className="mt-2 flex flex-wrap gap-1">
                    {template.tags.map((item) => (
                      <span
                        key={item}
                        className="rounded-none border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-gray-400"
                      >
                        {item}
                      </span>
                    ))}
                  </div>

                  <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                    <button
                      type="button"
                      onClick={() => onUseTemplate(template)}
                      className="h-9 rounded-none border-2 border-black bg-[#FFE66D] px-3 text-xs font-black text-slate-900 transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:border-white dark:bg-yellow-400 dark:hover:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]"
                    >
                      使用
                    </button>
                    <button
                      type="button"
                      onClick={() => onAppendTemplate(template)}
                      className="h-9 rounded-none border-2 border-black bg-white px-3 text-xs font-black text-slate-900 transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:border-white dark:bg-zinc-800 dark:text-gray-200 dark:hover:bg-zinc-700 dark:hover:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]"
                    >
                      追加
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )

  return createPortal(panel, document.body)
}
