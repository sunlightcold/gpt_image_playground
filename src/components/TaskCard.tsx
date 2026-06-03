import { useEffect, useState, useRef, type ReactNode } from 'react'
import type { TaskRecord } from '../types'
import { useStore, ensureImageThumbnailCached, subscribeImageThumbnail, retryTask } from '../store'
import { formatImageRatio } from '../lib/size'
import { getParamDisplay, ActualValueBadge } from '../lib/paramDisplay'
import { DEFAULT_IMAGES_MODEL, DEFAULT_FAL_MODEL } from '../lib/apiProfiles'
import { isAgentTaskPromptPending } from '../lib/taskPromptDisplay'
import { CodeIcon } from './icons'
import ViewportTooltip from './ViewportTooltip'

interface Props {
  task: TaskRecord
  onReuse: () => void
  onEditOutputs: () => void
  onDelete: () => void
  onClick: (e: React.MouseEvent | React.TouchEvent) => void
  isSelected?: boolean
  disableSwipe?: boolean
}

const TaskActionButton: React.FC<{
  tooltip: string
  className: string
  disabled?: boolean
  onClick?: () => void
  children: ReactNode
}> = ({
  tooltip,
  disabled = false,
  onClick,
  children,
}) => {
  const [tooltipVisible, setTooltipVisible] = useState(false)

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setTooltipVisible(true)}
      onMouseLeave={() => setTooltipVisible(false)}
      onFocus={() => setTooltipVisible(true)}
      onBlur={() => setTooltipVisible(false)}
    >
      <button
        type="button"
        onClick={onClick}
        className="w-7 h-7 flex items-center justify-center border border-black dark:border-white bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[1px_1px_0px_0px_rgba(255,255,255,1)] hover:bg-[#FFE66D] hover:text-black dark:hover:bg-yellow-400 dark:hover:text-black active:translate-x-0 active:translate-y-0 active:shadow-none transition-all cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
        disabled={disabled}
        aria-label={tooltip}
      >
        {children}
      </button>
      <ViewportTooltip visible={tooltipVisible} className="whitespace-nowrap">
        {tooltip}
      </ViewportTooltip>
    </span>
  )
}

const TaskCard: React.FC<Props> = ({
  task,
  onReuse,
  onEditOutputs,
  onDelete,
  onClick,
  isSelected,
  disableSwipe,
}) => {
  const [thumbSrc, setThumbSrc] = useState<string>('')
  const [coverRatio, setCoverRatio] = useState<string>('')
  const [coverSize, setCoverSize] = useState<string>('')
  const [now, setNow] = useState(Date.now())
  const [isSwiping, setIsSwiping] = useState(false)
  const [swipeStartedSelected, setSwipeStartedSelected] = useState(false)
  const [swipeActionActive, setSwipeActionActive] = useState(false)
  const [swipeDirection, setSwipeDirection] = useState<-1 | 0 | 1>(0)
  const [streamPreviewLoaded, setStreamPreviewLoaded] = useState(false)
  const toggleTaskSelection = useStore((s) => s.toggleTaskSelection)
  const settings = useStore((s) => s.settings)
  const openFavoritePicker = useStore((s) => s.openFavoritePicker)
  const streamPreviewSrc = useStore((s) => s.streamPreviews[task.id] || '')
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const swipeResetTimerRef = useRef<number | null>(null)
  const suppressClickUntilRef = useRef(0)
  const horizontalSwipeRef = useRef(false)
  const swipeDirectionRef = useRef<-1 | 0 | 1>(0)
  const swipeActionActiveRef = useRef(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const swipeOffsetRef = useRef(0)
  const pendingSwipeOffsetRef = useRef(0)
  const swipeFrameRef = useRef<number | null>(null)

  const updateSwipeDirection = (nextDirection: -1 | 0 | 1) => {
    if (swipeDirectionRef.current === nextDirection) return
    swipeDirectionRef.current = nextDirection
    setSwipeDirection(nextDirection)
  }

  const updateSwipeActionActive = (nextActive: boolean) => {
    if (swipeActionActiveRef.current === nextActive) return
    swipeActionActiveRef.current = nextActive
    setSwipeActionActive(nextActive)
  }

  const getTargetSwipeOffset = () => {
    if (!swipeActionActiveRef.current) return 0
    return swipeDirectionRef.current * 72
  }

  const renderSwipeOffset = () => {
    if (!cardRef.current) return
    const offset = swipeOffsetRef.current
    cardRef.current.style.transform = offset === 0 ? '' : `translate3d(${offset}px, 0, 0)`
  }

  const animateSwipeOffset = () => {
    if (swipeFrameRef.current) cancelAnimationFrame(swipeFrameRef.current)
    const target = getTargetSwipeOffset()
    const current = swipeOffsetRef.current
    if (Math.abs(target - current) < 1) {
      swipeOffsetRef.current = target
      renderSwipeOffset()
      return
    }
    swipeOffsetRef.current = current + (target - current) * 0.25
    renderSwipeOffset()
    swipeFrameRef.current = requestAnimationFrame(animateSwipeOffset)
  }

  const isTagScrollTarget = (target: EventTarget | null) => {
    return target instanceof Element && Boolean(target.closest('[data-tag-scroll-area]'))
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    if (disableSwipe || isTagScrollTarget(e.target)) return
    if (task.status === 'running') return
    const touch = e.touches[0]
    touchStartRef.current = { x: touch.clientX, y: touch.clientY }
    setIsSwiping(true)
    setSwipeStartedSelected(isSelected ?? false)
    horizontalSwipeRef.current = false
    updateSwipeDirection(0)
    updateSwipeActionActive(false)
    if (swipeResetTimerRef.current) {
      clearTimeout(swipeResetTimerRef.current)
      swipeResetTimerRef.current = null
    }
    if (swipeFrameRef.current) {
      cancelAnimationFrame(swipeFrameRef.current)
      swipeFrameRef.current = null
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isTagScrollTarget(e.target)) return
    if (!touchStartRef.current) return
    const touch = e.touches[0]
    const dx = touch.clientX - touchStartRef.current.x
    const dy = touch.clientY - touchStartRef.current.y

    if (!horizontalSwipeRef.current) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
        horizontalSwipeRef.current = true
        if (e.cancelable) e.preventDefault()
      } else if (Math.abs(dy) > 10) {
        touchStartRef.current = null
        setIsSwiping(false)
        return
      } else {
        return
      }
    }

    if (e.cancelable) e.preventDefault()

    const rawOffset = dx
    const direction: -1 | 0 | 1 = rawOffset > 0 ? 1 : rawOffset < 0 ? -1 : 0
    updateSwipeDirection(direction)

    const threshold = 60
    const active = Math.abs(rawOffset) > threshold
    updateSwipeActionActive(active)

    let finalOffset = rawOffset
    if (Math.abs(rawOffset) > threshold) {
      const extra = Math.abs(rawOffset) - threshold
      finalOffset = direction * (threshold + extra * 0.4)
    }

    pendingSwipeOffsetRef.current = finalOffset
    if (!swipeFrameRef.current) {
      swipeFrameRef.current = requestAnimationFrame(() => {
        swipeOffsetRef.current = pendingSwipeOffsetRef.current
        renderSwipeOffset()
        swipeFrameRef.current = null
      })
    }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (isTagScrollTarget(e.target)) {
      touchStartRef.current = null
      horizontalSwipeRef.current = false
      setIsSwiping(false)
      updateSwipeDirection(0)
      updateSwipeActionActive(false)
      return
    }

    if (!touchStartRef.current) return
    touchStartRef.current = null
    setIsSwiping(false)

    if (horizontalSwipeRef.current) {
      suppressClickUntilRef.current = Date.now() + 200
      if (swipeActionActiveRef.current) {
        toggleTaskSelection(task.id)
      }
      animateSwipeOffset()
      swipeResetTimerRef.current = window.setTimeout(() => {
        updateSwipeDirection(0)
        updateSwipeActionActive(false)
        animateSwipeOffset()
      }, 800)
    }
  }

  const handleTouchCancel = () => {
    if (!touchStartRef.current) return
    touchStartRef.current = null
    setIsSwiping(false)
    if (horizontalSwipeRef.current) {
      updateSwipeDirection(0)
      updateSwipeActionActive(false)
      animateSwipeOffset()
    }
  }

  useEffect(() => {
    if (task.status !== 'running' && !(task.status === 'error' && (task.falRecoverable || task.customRecoverable))) return
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    setNow(Date.now())
    return () => window.clearInterval(interval)
  }, [task.customRecoverable, task.falRecoverable, task.status])

  useEffect(() => {
    setCoverRatio('')
    setCoverSize('')
    setThumbSrc('')

    let cancelled = false
    const imageId = task.outputImages?.[0]
    let unsubscribe: (() => void) | undefined

    const applyThumbnail = (thumbnail: { dataUrl: string; width?: number; height?: number }) => {
      if (cancelled) return
      setThumbSrc(thumbnail.dataUrl)
      if (thumbnail.width && thumbnail.height) {
        setCoverRatio(formatImageRatio(thumbnail.width, thumbnail.height))
        setCoverSize(`${thumbnail.width}×${thumbnail.height}`)
      }
    }

    if (imageId) {
      unsubscribe = subscribeImageThumbnail(imageId, applyThumbnail)
      ensureImageThumbnailCached(imageId).then((thumbnail) => {
        if (cancelled || !thumbnail) return
        applyThumbnail(thumbnail)
      }).catch(() => {
        if (!cancelled) setThumbSrc('')
      })
    }

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [task.outputImages])

  useEffect(() => {
    setStreamPreviewLoaded(false)
  }, [streamPreviewSrc, task.id])

  const duration = (() => {
    let seconds: number
    if (task.status === 'running' || task.falRecoverable || task.customRecoverable) {
      seconds = Math.max(0, Math.floor((now - task.createdAt) / 1000))
    } else if (task.elapsed != null) {
      seconds = Math.floor(task.elapsed / 1000)
    } else {
      return '00:00'
    }
    const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
    const ss = String(seconds % 60).padStart(2, '0')
    return `${mm}:${ss}`
  })()
  const showSwipeAction = swipeActionActive
  const isFalReconnecting = task.status === 'error' && task.falRecoverable
  const isCustomReconnecting = task.status === 'error' && task.customRecoverable
  const showRunningTimer = task.status === 'running' || isFalReconnecting || isCustomReconnecting
  const swipeBgClass = showSwipeAction
    ? swipeStartedSelected
      ? 'bg-slate-500 dark:bg-zinc-600'
      : 'bg-indigo-600'
    : 'bg-slate-200 dark:bg-zinc-800'

  const qualityDisplay = getParamDisplay(task, 'quality')
  const showQuality = task.params.quality !== 'auto' || qualityDisplay.isMismatch

  const sizeDisplay = getParamDisplay(task, 'size')
  const showSize = task.params.size !== 'auto' || sizeDisplay.isMismatch

  const formatDisplay = getParamDisplay(task, 'output_format')
  const showFormat = task.params.output_format !== 'png' || formatDisplay.isMismatch

  const nDisplay = getParamDisplay(task, 'n')
  const isAgentTask = task.sourceMode === 'agent' || Boolean(task.agentConversationId || task.agentRoundId)
  const showPendingPrompt = isAgentTaskPromptPending(task)
  const showN = !isAgentTask && (task.params.n > 1 || nDisplay.isMismatch)

  const defaultModelForProvider = task.apiProvider === 'fal' ? DEFAULT_FAL_MODEL : DEFAULT_IMAGES_MODEL
  const showModel = task.apiModel && task.apiModel !== defaultModelForProvider
  const isInterrupted = task.status === 'error' && task.error === '已停止生成。'

  return (
    <div className="relative rounded-none">
      {/* 侧滑底图 */}
      <div
        className={`absolute inset-0 rounded-none flex items-center transition-opacity duration-200 pointer-events-none ${
          isSwiping || swipeDirection !== 0 || swipeActionActive ? 'opacity-100' : 'opacity-0'
        } ${swipeBgClass} ${
          swipeDirection > 0 ? 'justify-start pl-6' : 'justify-end pr-6'
        }`}
      >
        <svg className={`w-8 h-8 transition-transform duration-150 ${showSwipeAction ? 'scale-110 text-white' : 'scale-90 text-white/60'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {swipeStartedSelected && showSwipeAction ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          )}
        </svg>
      </div>

      <div
        ref={cardRef}
        className={`group relative bg-white dark:bg-zinc-900 rounded-sm border-2 border-black dark:border-white overflow-hidden cursor-pointer touch-pan-y will-change-transform duration-300 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[6px_6px_0px_0px_rgba(255,255,255,1)] ${
          isSwiping ? '!bg-white dark:!bg-zinc-950' : ''
        } ${
          !isSwiping ? 'transition-[box-shadow,border-color,background-color,transform]' : 'transition-[box-shadow,border-color,background-color]'
        } ${
          task.status === 'running'
            ? 'border-indigo-650 dark:border-indigo-400 bg-indigo-500/5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] generating'
            : isSelected
            ? 'bg-[#FFE66D]/10 dark:bg-yellow-400/10 border-black dark:border-white shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:shadow-[6px_6px_0px_0px_rgba(255,255,255,1)]'
            : 'shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)]'
        }`}
        onClick={(e) => {
          if (Date.now() < suppressClickUntilRef.current) {
            e.preventDefault()
            e.stopPropagation()
            return
          }
          onClick(e)
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        draggable={task.status === 'done' && task.outputImages?.length > 0}
        onDragStart={(e) => {
          if (task.status !== 'done' || !task.outputImages?.length) return
          const imageIds = task.outputImages
          e.dataTransfer.setData('text/plain', `agent-images:${imageIds.join(',')}`)
          e.dataTransfer.effectAllowed = 'copy'
          if (thumbSrc) {
            const preview = document.createElement('div')
            preview.style.cssText = 'position:fixed;left:-1000px;top:-1000px;width:100px;height:100px;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.25);'
            const previewImg = document.createElement('img')
            previewImg.src = thumbSrc
            previewImg.style.cssText = 'width:100px;height:100px;object-fit:cover;display:block;'
            preview.appendChild(previewImg)
            document.body.appendChild(preview)
            e.dataTransfer.setDragImage(preview, 50, 50)
            setTimeout(() => preview.remove(), 0)
          }
        }}
      >
        {/* 选中时的角标 */}
        {isSelected && (
          <div className="absolute top-2 right-2 z-10 w-6 h-6 bg-[#FFE66D] text-black border-2 border-black dark:border-white flex items-center justify-center shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">
            <svg className="w-4 h-4 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}
        <div className="flex h-40">
          {/* 左侧图片区域 */}
          <div className="w-40 min-w-[10rem] h-full bg-slate-100 dark:bg-black/30 border-r-2 border-black dark:border-white relative flex items-center justify-center overflow-hidden flex-shrink-0">
            {task.status === 'running' && streamPreviewSrc && (
              <>
                <img
                  src={streamPreviewSrc}
                  className={`h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] ${streamPreviewLoaded ? '' : 'hidden'}`}
                  alt=""
                  onLoad={() => setStreamPreviewLoaded(true)}
                  onError={() => setStreamPreviewLoaded(false)}
                />
                {streamPreviewLoaded && (
                  <span className="absolute top-1.5 right-1.5 flex items-center gap-1 rounded bg-indigo-500 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm shadow-sm">
                    预览
                  </span>
                )}
              </>
            )}
            {task.status === 'running' && (!streamPreviewSrc || !streamPreviewLoaded) && (
              <div className="flex flex-col items-center gap-2">
                <svg
                  className="w-8 h-8 text-indigo-500 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                <span className="text-[11px] font-medium text-slate-400 dark:text-zinc-500">生成中...</span>
              </div>
            )}
            {task.status === 'error' && isFalReconnecting && (
              <div className="flex flex-col items-center gap-1.5 px-2">
                <svg
                  className="w-7 h-7 text-yellow-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                <span className="text-[11px] font-medium text-yellow-500 text-center leading-tight">
                  重连中
                </span>
              </div>
            )}
            {task.status === 'error' && !isFalReconnecting && (
              <div className="flex flex-col items-center gap-1.5 px-2">
                <svg
                  className={`w-7 h-7 ${isInterrupted ? 'text-yellow-500' : 'text-rose-500'}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span className={`text-[11px] font-medium text-center leading-tight ${isInterrupted ? 'text-yellow-500' : 'text-rose-500'}`}>
                  {isInterrupted ? '已停止' : '失败'}
                </span>
              </div>
            )}
            {task.status === 'done' && thumbSrc && (
              <>
                <img
                  src={thumbSrc}
                  data-image-id={task.outputImages[0]}
                  data-output-image-ids={task.outputImages.join(',')}
                  className="saveable-image w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                  loading="lazy"
                  alt=""
                />
                {task.outputImages.length > 1 && (
                  <span className="absolute bottom-1.5 right-1.5 bg-black/75 backdrop-blur-sm text-white/95 text-[10px] font-bold px-1.5 py-0.5 rounded border border-white/[0.05]">
                    {task.outputImages.length}
                  </span>
                )}
              </>
            )}
            {task.status === 'done' && !thumbSrc && (
              <svg
                className="w-8 h-8 text-slate-300 dark:text-zinc-700"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            )}
            {/* 运行中显示耗时，完成后显示封面图比例与分辨率标签 */}
            <div className="absolute top-1.5 left-1.5 flex items-center gap-1.5 z-10">
              {showRunningTimer || task.status !== 'done' || !coverRatio || !coverSize ? (
                <span className="flex items-center gap-1 bg-black/70 backdrop-blur-sm text-white text-[10px] px-1.5 py-0.5 rounded border border-white/[0.05] font-mono leading-none">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {duration}
                </span>
              ) : (
                <>
                  <span className="bg-black/70 backdrop-blur-sm text-white text-[10px] px-1.5 py-0.5 rounded border border-white/[0.05] font-mono font-bold leading-none">
                    {coverRatio}
                  </span>
                  <span className="bg-black/70 backdrop-blur-sm text-white/90 text-[10px] px-1.5 py-0.5 rounded border border-white/[0.05] font-mono leading-none">
                    {coverSize}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* 右侧信息区域 */}
          <div className="flex-1 p-3.5 flex flex-col min-w-0">
            <div className="flex-1 min-h-0 mb-2 overflow-hidden">
              {showPendingPrompt ? (
                <div className="leading-relaxed">
                  <p className="text-sm font-medium text-slate-700 dark:text-zinc-300">正在生成……</p>
                  <p className="mt-1 text-xs text-slate-400 dark:text-zinc-500">输入内容将在响应完成时接收</p>
                </div>
              ) : (
                <p className="text-sm text-slate-700 dark:text-zinc-200 leading-relaxed line-clamp-3 font-medium">
                  {task.prompt || '(无提示词)'}
                </p>
              )}
            </div>
            <div className="mt-auto flex flex-col gap-1.5">
              {/* 参数与信息：横向滚动 */}
              <div 
                data-tag-scroll-area
                className="flex overflow-x-auto hide-scrollbar pt-0.5 gap-1.5 whitespace-nowrap mask-edge-r min-w-0 pr-2"
                onTouchStart={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}
                onTouchCancel={(e) => e.stopPropagation()}
              >
                {/* API Name */}
                {(task.apiProfileName || task.apiProvider) && (
                  <span 
                    className="flex items-center gap-1 px-2 py-0.5 border border-black dark:border-white bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 text-[10px] font-bold flex-shrink-0"
                    title={task.apiProfileName || task.apiProvider}
                  >
                    <CodeIcon className="w-3 h-3 flex-shrink-0 text-slate-400" />
                    <span className="truncate max-w-[8rem]">
                      {task.apiProfileName || task.apiProvider}
                    </span>
                  </span>
                )}
                {/* Model */}
                {showModel && (
                  <span 
                    className="flex items-center gap-1 px-2 py-0.5 border border-black dark:border-white bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 text-[10px] font-bold flex-shrink-0"
                    title={task.apiModel}
                  >
                    <svg className="w-3 h-3 flex-shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                    </svg>
                    <span className="truncate max-w-[8rem]">
                      {task.apiModel}
                    </span>
                  </span>
                )}
                {/* Mask */}
                {task.maskImageId && (
                  <span className="flex items-center gap-1 px-2 py-0.5 border border-black dark:border-white bg-[#FFE66D] dark:bg-yellow-400 text-black text-[10px] font-bold flex-shrink-0">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    局部重绘
                  </span>
                )}
                {/* Params: only show if not default or mismatch */}
                {showQuality && (
                  <span className="flex items-center gap-1 px-2 py-0.5 border border-black dark:border-white bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 text-[10px] font-bold flex-shrink-0">
                    <span className="text-slate-400">质量</span>
                    {qualityDisplay.isMismatch ? <ActualValueBadge value={qualityDisplay.displayValue} className="px-1 rounded-none" /> : <span className="text-slate-600 dark:text-zinc-300 font-extrabold">{qualityDisplay.displayValue}</span>}
                  </span>
                )}
                {showSize && (
                  <span className="flex items-center gap-1 px-2 py-0.5 border border-black dark:border-white bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 text-[10px] font-bold flex-shrink-0">
                    <span className="text-slate-400">尺寸</span>
                    {sizeDisplay.isMismatch ? <ActualValueBadge value={sizeDisplay.displayValue} className="px-1 rounded-none" /> : <span className="text-slate-600 dark:text-zinc-300 font-extrabold">{sizeDisplay.displayValue}</span>}
                  </span>
                )}
                {showFormat && (
                  <span className="flex items-center gap-1 px-2 py-0.5 border border-black dark:border-white bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 text-[10px] font-bold flex-shrink-0">
                    <span className="text-slate-400">格式</span>
                    {formatDisplay.isMismatch ? <ActualValueBadge value={formatDisplay.displayValue} className="px-1 rounded-none" /> : <span className="text-slate-600 dark:text-zinc-300 font-extrabold">{formatDisplay.displayValue}</span>}
                  </span>
                )}
                {showN && (
                  <span className="flex items-center gap-1 px-2 py-0.5 border border-black dark:border-white bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 text-[10px] font-bold flex-shrink-0">
                    <span className="text-slate-400">数量</span>
                    {nDisplay.isMismatch ? <ActualValueBadge value={nDisplay.displayValue} className="px-1 rounded-none" /> : <span className="text-slate-600 dark:text-zinc-300 font-extrabold">{nDisplay.displayValue}</span>}
                  </span>
                )}
              </div>
              {/* 操作按钮 */}
              <div
                data-tag-scroll-area
                className="flex items-center gap-1 flex-shrink-0 mt-0.5 ml-auto max-w-full overflow-x-auto hide-scrollbar mask-edge-r pr-2"
                onClick={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}
                onTouchCancel={(e) => e.stopPropagation()}
              >
                {((task.status === 'error' && !isFalReconnecting) || settings.alwaysShowRetryButton) && (
                  <TaskActionButton
                    tooltip="重试任务"
                    onClick={() => retryTask(task)}
                    className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/20 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition hover:scale-105 active:scale-95"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </TaskActionButton>
                )}
                <TaskActionButton
                  tooltip={task.isFavorite ? '编辑收藏夹' : '收藏任务'}
                  onClick={() => openFavoritePicker([task.id])}
                  className={`p-1.5 rounded-lg transition hover:scale-105 active:scale-95 ${
                    task.isFavorite
                      ? 'text-amber-500 hover:bg-amber-500/10'
                      : 'text-gray-400 hover:text-amber-500 hover:bg-amber-500/10'
                  }`}
                >
                  <svg
                    className="w-4 h-4"
                    fill={task.isFavorite ? 'currentColor' : 'none'}
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                    />
                  </svg>
                </TaskActionButton>
                <TaskActionButton
                  tooltip="复用配置"
                  onClick={onReuse}
                  className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/20 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition hover:scale-105 active:scale-95"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                    />
                  </svg>
                </TaskActionButton>
                <TaskActionButton
                  tooltip="编辑输出"
                  onClick={onEditOutputs}
                  className="p-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-950/20 text-gray-400 hover:text-green-500 transition hover:scale-105 active:scale-95 disabled:opacity-30"
                  disabled={!task.outputImages?.length}
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                </TaskActionButton>
                <TaskActionButton
                  tooltip="删除任务"
                  onClick={onDelete}
                  className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 text-gray-400 hover:text-red-500 transition hover:scale-105 active:scale-95"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </TaskActionButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TaskCard
