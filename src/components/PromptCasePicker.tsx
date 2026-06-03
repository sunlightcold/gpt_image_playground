import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  GPT_IMAGE_2_CASE_CATEGORIES,
  GPT_IMAGE_2_CASE_SCENES,
  GPT_IMAGE_2_CASE_SOURCE,
  GPT_IMAGE_2_CASE_STYLES,
  GPT_IMAGE_2_CASES,
  type GptImage2Case,
} from '../data/gptImage2Cases'
import { copyTextToClipboard, getClipboardFailureMessage } from '../lib/clipboard'
import {
  ALL_CASE_FILTER_VALUE,
  filterPromptCases,
  getCaseCategoryLabel,
  getCasePromptPreview,
  getCaseTagLabel,
  getCaseTags,
} from '../lib/promptCases'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { useStore } from '../store'
import { CloseIcon, CopyIcon, ExternalLinkIcon, GithubIcon, PhotoIcon } from './icons'

type CasePickerProps = {
  onClose: () => void
  onUseCase: (caseItem: GptImage2Case) => void
  onAppendCase: (caseItem: GptImage2Case) => void
}

const MAX_VISIBLE_CASES = 72
const ALL_OPTION = { value: ALL_CASE_FILTER_VALUE, label: '全部' }

function filterButtonClass(active: boolean) {
  return `min-h-7 shrink-0 rounded-none border px-2 py-1 text-[11px] font-black leading-tight transition-all ${
    active
      ? 'border-black bg-[#FFE66D] text-slate-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:border-white dark:bg-yellow-400 dark:text-black dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]'
      : 'border-slate-300 bg-white text-slate-600 hover:border-black hover:text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-gray-400 dark:hover:border-white dark:hover:text-white'
  }`
}

function actionButtonClass(primary = false) {
  return `inline-flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-none border-2 px-2 text-xs font-black transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 ${
    primary
      ? 'border-black bg-[#FFE66D] text-slate-900 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:border-white dark:bg-yellow-400 dark:text-black dark:hover:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]'
      : 'border-black bg-white text-slate-900 hover:bg-slate-50 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:border-white dark:bg-zinc-800 dark:text-gray-200 dark:hover:bg-zinc-700 dark:hover:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]'
  }`
}

function compactActionButtonClass(primary = false) {
  return `inline-flex h-8 min-w-0 items-center justify-center rounded-none border-2 text-[11px] font-black transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 ${
    primary
      ? 'border-black bg-[#FFE66D] px-3 text-slate-900 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:border-white dark:bg-yellow-400 dark:text-black dark:hover:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]'
      : 'w-8 shrink-0 border-black bg-white text-slate-900 hover:bg-slate-50 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:border-white dark:bg-zinc-800 dark:text-gray-200 dark:hover:bg-zinc-700 dark:hover:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]'
  }`
}

export default function PromptCasePicker({
  onClose,
  onUseCase,
  onAppendCase,
}: CasePickerProps) {
  const showToast = useStore((state) => state.showToast)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState(ALL_CASE_FILTER_VALUE)
  const [style, setStyle] = useState(ALL_CASE_FILTER_VALUE)
  const [scene, setScene] = useState(ALL_CASE_FILTER_VALUE)
  const [copiedCaseId, setCopiedCaseId] = useState<number | null>(null)
  const [detailCase, setDetailCase] = useState<GptImage2Case | null>(null)

  const cases = useMemo(() => filterPromptCases({ category, style, scene, query }), [category, query, scene, style])
  const visibleCases = cases.slice(0, MAX_VISIBLE_CASES)
  useCloseOnEscape(true, detailCase ? () => setDetailCase(null) : onClose)

  async function copyCasePrompt(caseItem: GptImage2Case) {
    try {
      await copyTextToClipboard(caseItem.prompt)
      setCopiedCaseId(caseItem.id)
      window.setTimeout(() => {
        setCopiedCaseId((current) => (current === caseItem.id ? null : current))
      }, 1600)
      showToast('Prompt 已复制', 'success')
    } catch (err) {
      showToast(getClipboardFailureMessage('复制 Prompt 失败', err), 'error')
    }
  }

  const panel = (
    <div
      data-no-drag-select
      className="fixed inset-x-0 z-40 flex justify-center pointer-events-none safe-area-x"
      style={{
        top: 12,
        bottom: 'calc(var(--input-bar-clearance, 0px) + 12px)',
      }}
    >
      <div
        role="dialog"
        aria-label="GPT-Image2 案例"
        className="pointer-events-auto flex h-full min-h-0 w-full max-w-6xl flex-col overflow-hidden rounded-none border-2 border-black bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] animate-dropdown-up dark:border-white dark:bg-zinc-900 dark:shadow-[8px_8px_0px_0px_rgba(255,255,255,1)]"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b-2 border-black px-3 py-3 dark:border-white sm:px-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-black text-slate-900 dark:text-white">GPT-Image2 案例</h3>
              <span className="rounded-none border border-black bg-[#FFE66D] px-1.5 py-0.5 text-[10px] font-black text-slate-900 dark:border-white dark:bg-yellow-400">
                {cases.length}/{GPT_IMAGE_2_CASES.length}
              </span>
              <a
                href={GPT_IMAGE_2_CASE_SOURCE.repository}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-slate-900 dark:text-gray-400 dark:hover:text-white"
              >
                awesome-gpt-image-2
                <ExternalLinkIcon className="h-3 w-3" />
              </a>
            </div>
            <div className="mt-1 text-[11px] font-bold text-slate-500 dark:text-gray-400">
              来源：MIT License · {GPT_IMAGE_2_CASE_SOURCE.commit.slice(0, 7)}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-none border-2 border-black bg-white text-slate-900 transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:bg-[#FFE66D] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:border-white dark:bg-zinc-800 dark:text-gray-200 dark:hover:bg-yellow-400 dark:hover:text-black dark:hover:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]"
            aria-label="关闭案例"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 custom-scrollbar sm:p-4">
          <div className="space-y-3 border-b-2 border-black pb-3 dark:border-white">
            <label className="block">
              <span className="mb-1 block text-[11px] font-black text-slate-500 dark:text-gray-400">搜索案例</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="标题、来源、分类、标签或 Prompt 内容"
                className="min-h-10 w-full rounded-none border-2 border-black bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:border-white dark:bg-zinc-950 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]"
              />
            </label>

            <FilterGroup label="分类">
              {[ALL_OPTION, ...GPT_IMAGE_2_CASE_CATEGORIES].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setCategory(option.value)}
                  className={filterButtonClass(category === option.value)}
                >
                  {option.label}
                </button>
              ))}
            </FilterGroup>

            <FilterGroup label="风格">
              {[ALL_OPTION, ...GPT_IMAGE_2_CASE_STYLES].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setStyle(option.value)}
                  className={filterButtonClass(style === option.value)}
                >
                  {option.label}
                </button>
              ))}
            </FilterGroup>

            <FilterGroup label="场景">
              {[ALL_OPTION, ...GPT_IMAGE_2_CASE_SCENES].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setScene(option.value)}
                  className={filterButtonClass(scene === option.value)}
                >
                  {option.label}
                </button>
              ))}
            </FilterGroup>
          </div>

          {visibleCases.length === 0 ? (
            <div className="mt-3 flex min-h-[120px] items-center justify-center border-2 border-dashed border-slate-300 bg-slate-50 px-4 text-center text-sm font-bold text-slate-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-gray-400">
              没有找到匹配案例
            </div>
          ) : (
            <>
              <div className="mt-3 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                {visibleCases.map((caseItem) => (
                  <CaseCard
                    key={caseItem.id}
                    caseItem={caseItem}
                    copied={copiedCaseId === caseItem.id}
                    onCopy={copyCasePrompt}
                    onOpen={setDetailCase}
                    onUse={onUseCase}
                  />
                ))}
              </div>
              {cases.length > visibleCases.length && (
                <div className="mt-3 border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-center text-xs font-bold text-slate-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-gray-400">
                  当前显示前 {visibleCases.length} 条，可继续搜索或筛选缩小范围
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {detailCase && (
        <CaseDetailDialog
          caseItem={detailCase}
          copied={copiedCaseId === detailCase.id}
          onClose={() => setDetailCase(null)}
          onCopy={copyCasePrompt}
          onUse={onUseCase}
          onAppend={onAppendCase}
        />
      )}
    </div>
  )

  return createPortal(panel, document.body)
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  const rowRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const row = rowRef.current
    if (!row) return undefined
    const rowEl = row

    function handleWheel(event: WheelEvent) {
      const horizontalDelta = Math.abs(event.deltaX)
      const verticalDelta = Math.abs(event.deltaY)
      const primaryDelta = horizontalDelta > verticalDelta ? event.deltaX : event.deltaY
      const maxLeft = rowEl.scrollWidth - rowEl.clientWidth

      if (maxLeft <= 0) return

      const nextLeft = Math.max(0, Math.min(maxLeft, rowEl.scrollLeft + primaryDelta))
      if (nextLeft === rowEl.scrollLeft) return

      event.preventDefault()
      event.stopPropagation()
      rowEl.scrollLeft = nextLeft
    }

    rowEl.addEventListener('wheel', handleWheel, { passive: false })
    return () => rowEl.removeEventListener('wheel', handleWheel)
  }, [])

  return (
    <section className="min-w-0">
      <div className="mb-1.5 text-[10px] font-black text-slate-400 dark:text-gray-500">{label}</div>
      <div
        ref={rowRef}
        className="hide-scrollbar -mx-1 flex gap-1.5 overflow-x-auto overscroll-x-contain px-1 pb-1 whitespace-nowrap"
      >
        {children}
      </div>
    </section>
  )
}

function CaseCard({
  caseItem,
  copied,
  onCopy,
  onOpen,
  onUse,
}: {
  caseItem: GptImage2Case
  copied: boolean
  onCopy: (caseItem: GptImage2Case) => void
  onOpen: (caseItem: GptImage2Case) => void
  onUse: (caseItem: GptImage2Case) => void
}) {
  return (
    <article className="grid min-h-[144px] grid-cols-[96px_minmax(0,1fr)] gap-2 overflow-hidden rounded-none border-2 border-black bg-white p-2 transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:border-white dark:bg-zinc-950 dark:hover:shadow-[3px_3px_0px_0px_rgba(255,255,255,1)] sm:grid-cols-[104px_minmax(0,1fr)]">
      <button
        type="button"
        onClick={() => onOpen(caseItem)}
        className="group relative block h-full min-h-[128px] overflow-hidden bg-slate-950 text-left"
      >
        <img
          src={caseItem.image}
          alt={caseItem.imageAlt}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        />
        <span className="absolute left-1.5 top-1.5 rounded-none border border-white/30 bg-black/80 px-1.5 py-0.5 text-[10px] font-black text-white backdrop-blur">
          {caseItem.id}
        </span>
        <span className="absolute bottom-1.5 right-1.5 hidden items-center gap-1 rounded-none border border-white/30 bg-black/80 px-1.5 py-0.5 text-[10px] font-black text-white backdrop-blur group-hover:inline-flex">
          <PhotoIcon className="h-3 w-3" />
          详情
        </span>
      </button>

      <div className="flex min-w-0 flex-col">
        <div className="mb-1 flex min-w-0 items-center justify-between gap-2 text-[10px] font-black text-slate-500 dark:text-gray-400">
          <span className="min-w-0 truncate">{getCaseCategoryLabel(caseItem.category)}</span>
          {caseItem.sourceUrl ? (
            <a
              href={caseItem.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-cyan-700 hover:text-cyan-900 dark:text-cyan-300 dark:hover:text-cyan-100"
            >
              {caseItem.sourceLabel}
            </a>
          ) : (
            <span className="shrink-0">{caseItem.sourceLabel}</span>
          )}
        </div>

        <h4 className="line-clamp-1 text-sm font-black leading-snug text-slate-900 dark:text-white">
          {caseItem.title}
        </h4>

        <p className="mt-1 line-clamp-2 break-words rounded-none border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] font-bold leading-relaxed text-slate-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-gray-300">
          {caseItem.promptPreview || getCasePromptPreview(caseItem.prompt, 120)}
        </p>

        <div className="mt-1.5 flex flex-wrap gap-1">
          {getCaseTags(caseItem, 3).map((tag) => (
            <span
              key={`${caseItem.id}-${tag}`}
              className="rounded-none border border-slate-300 bg-white px-1 py-0.5 text-[9px] font-bold leading-tight text-slate-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-gray-400"
            >
              {getCaseTagLabel(tag)}
            </span>
          ))}
        </div>

        <div className="mt-auto flex items-center gap-1.5 pt-2">
          <button type="button" onClick={() => onUse(caseItem)} className={compactActionButtonClass(true)}>
            使用
          </button>
          <button
            type="button"
            onClick={() => onCopy(caseItem)}
            className={compactActionButtonClass()}
            aria-label={copied ? 'Prompt 已复制' : '复制 Prompt'}
            title={copied ? '已复制' : '复制 Prompt'}
          >
            <CopyIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onOpen(caseItem)}
            className={compactActionButtonClass()}
            aria-label="查看详情"
            title="查看详情"
          >
            <PhotoIcon className="h-3.5 w-3.5" />
          </button>
          <a
            href={caseItem.githubUrl}
            target="_blank"
            rel="noreferrer"
            className={compactActionButtonClass()}
            aria-label="打开 GitHub 来源"
            title="打开 GitHub 来源"
          >
            <GithubIcon className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </article>
  )
}

function CaseDetailDialog({
  caseItem,
  copied,
  onClose,
  onCopy,
  onUse,
  onAppend,
}: {
  caseItem: GptImage2Case
  copied: boolean
  onClose: () => void
  onCopy: (caseItem: GptImage2Case) => void
  onUse: (caseItem: GptImage2Case) => void
  onAppend: (caseItem: GptImage2Case) => void
}) {
  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`案例 ${caseItem.id} 详情`}
        className="flex max-h-[90dvh] w-full max-w-5xl flex-col overflow-hidden rounded-none border-2 border-black bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] dark:border-white dark:bg-zinc-900 dark:shadow-[8px_8px_0px_0px_rgba(255,255,255,1)] lg:flex-row"
      >
        <div className="min-h-0 bg-slate-950 lg:w-[42%]">
          <img src={caseItem.image} alt={caseItem.imageAlt} className="h-full max-h-[42dvh] w-full object-contain lg:max-h-none" />
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-start justify-between gap-3 border-b-2 border-black p-4 dark:border-white">
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] font-black text-slate-500 dark:text-gray-400">
                <span className="border border-black bg-[#FFE66D] px-1.5 py-0.5 text-slate-900 dark:border-white dark:bg-yellow-400 dark:text-black">
                  案例 {caseItem.id}
                </span>
                <span>{getCaseCategoryLabel(caseItem.category)}</span>
                {caseItem.sourceUrl && (
                  <a href={caseItem.sourceUrl} target="_blank" rel="noreferrer" className="text-cyan-700 hover:text-cyan-900 dark:text-cyan-300 dark:hover:text-cyan-100">
                    {caseItem.sourceLabel}
                  </a>
                )}
              </div>
              <h3 className="text-lg font-black leading-tight text-slate-900 dark:text-white">{caseItem.title}</h3>
            </div>
            <button type="button" onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-none border-2 border-black bg-white text-slate-900 transition-all hover:bg-[#FFE66D] dark:border-white dark:bg-zinc-800 dark:text-gray-200 dark:hover:bg-yellow-400 dark:hover:text-black" aria-label="关闭详情">
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 custom-scrollbar">
            <div className="mb-3 flex flex-wrap gap-1">
              {getCaseTags(caseItem, 8).map((tag) => (
                <span key={`${caseItem.id}-detail-${tag}`} className="rounded-none border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-slate-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-gray-400">
                  {getCaseTagLabel(tag)}
                </span>
              ))}
            </div>

            <div className="rounded-none border-2 border-black bg-slate-50 p-3 dark:border-white dark:bg-zinc-950">
              <div className="mb-2 text-[11px] font-black text-slate-500 dark:text-gray-400">完整 Prompt</div>
              <p className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-slate-700 dark:text-gray-200">
                {caseItem.prompt}
              </p>
            </div>
          </div>

          <div className="grid shrink-0 grid-cols-2 gap-2 border-t-2 border-black p-4 dark:border-white sm:grid-cols-4">
            <button type="button" onClick={() => onUse(caseItem)} className={actionButtonClass(true)}>
              使用 Prompt
            </button>
            <button type="button" onClick={() => onAppend(caseItem)} className={actionButtonClass()}>
              追加
            </button>
            <button type="button" onClick={() => onCopy(caseItem)} className={actionButtonClass()}>
              <CopyIcon className="h-3.5 w-3.5" />
              {copied ? '已复制' : '复制 Prompt'}
            </button>
            <a href={caseItem.githubUrl} target="_blank" rel="noreferrer" className={actionButtonClass()}>
              <GithubIcon className="h-3.5 w-3.5" />
              GitHub
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}
