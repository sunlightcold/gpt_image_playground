import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { DEFAULT_DROPDOWN_MAX_HEIGHT } from '../lib/dropdown'
import { ChevronDownIcon, EditIcon, PlusIcon, TrashIcon, DragHandleIcon } from './icons'

interface Option {
  label: string
  value: string | number
  variant?: 'action' | 'danger'
  draggable?: boolean
  actions?: Array<{
    label: string
    variant?: 'danger'
    onClick: () => void
  }>
}

interface SelectProps {
  value: string | number
  onChange: (value: any) => void
  onReorder?: (sourceValue: string | number, targetValue: string | number, position: 'before' | 'after' | null) => void
  options: Option[]
  disabled?: boolean
  className?: string
}

const Select: React.FC<SelectProps> = ({
  value,
  onChange,
  onReorder,
  options,
  disabled,
  className,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [menuMaxHeight, setMenuMaxHeight] = useState(DEFAULT_DROPDOWN_MAX_HEIGHT)
  const [placement, setPlacement] = useState<'bottom' | 'top'>('bottom')
  const [draggedValue, setDraggedValue] = useState<string | number | null>(null)
  const [dragOverValue, setDragOverValue] = useState<string | number | null>(null)
  const [dragDropPosition, setDragDropPosition] = useState<'before' | 'after' | null>(null)
  const [touchDragPreview, setTouchDragPreview] = useState<{
    label: string
    x: number
    y: number
    width: number
    height: number
    offsetX: number
    offsetY: number
  } | null>(null)

  const touchDragRef = useRef<{ value: string | number; startX: number; startY: number; moved: boolean } | null>(null)
  const dragScrollIntervalRef = useRef<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find((o) => o.value === value)

  useEffect(() => {
    return () => {
      if (dragScrollIntervalRef.current) {
        clearInterval(dragScrollIntervalRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!touchDragPreview) return

    const preventTouchScroll = (event: TouchEvent) => {
      event.preventDefault()
    }
    const listenerOptions = { passive: false, capture: true } as AddEventListenerOptions
    const previousOverflow = document.body.style.overflow
    const previousOverscroll = document.body.style.overscrollBehavior

    document.body.style.overflow = 'hidden'
    document.body.style.overscrollBehavior = 'none'
    window.addEventListener('touchmove', preventTouchScroll, listenerOptions)

    return () => {
      document.body.style.overflow = previousOverflow
      document.body.style.overscrollBehavior = previousOverscroll
      window.removeEventListener('touchmove', preventTouchScroll, listenerOptions)
    }
  }, [touchDragPreview])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!isOpen) return

    const handleUpdateMenuMaxHeight = () => {
      if (!triggerRef.current) return
      const trigger = triggerRef.current
      const rect = trigger.getBoundingClientRect()
      
      let availableBelow = window.innerHeight - rect.bottom - 8
      let availableAbove = rect.top - 8
      
      let parent = trigger.parentElement
      while (parent && parent !== document.body) {
        const style = window.getComputedStyle(parent)
        if (/(auto|scroll|hidden|clip)/.test(`${style.overflow} ${style.overflowY}`)) {
          const parentRect = parent.getBoundingClientRect()
          availableBelow = Math.min(availableBelow, parentRect.bottom - rect.bottom - 8)
          availableAbove = Math.min(availableAbove, rect.top - parentRect.top - 8)
        }
        parent = parent.parentElement
      }
      
      let newPlacement: 'bottom' | 'top' = 'bottom'
      let maxHeight = DEFAULT_DROPDOWN_MAX_HEIGHT
      
      if (availableBelow < 120 && availableAbove > availableBelow) {
        newPlacement = 'top'
        maxHeight = Math.min(DEFAULT_DROPDOWN_MAX_HEIGHT, Math.floor(availableAbove))
      } else {
        newPlacement = 'bottom'
        maxHeight = Math.min(DEFAULT_DROPDOWN_MAX_HEIGHT, Math.floor(availableBelow))
      }
      
      setPlacement(newPlacement)
      setMenuMaxHeight(Math.max(0, maxHeight))
    }

    handleUpdateMenuMaxHeight()
    window.addEventListener('resize', handleUpdateMenuMaxHeight)
    window.addEventListener('scroll', handleUpdateMenuMaxHeight, true)
    return () => {
      window.removeEventListener('resize', handleUpdateMenuMaxHeight)
      window.removeEventListener('scroll', handleUpdateMenuMaxHeight, true)
    }
  }, [isOpen])

  const handleToggle = (e: React.MouseEvent) => {
    if (disabled) return
    e.preventDefault()
    e.stopPropagation()
    setIsOpen(!isOpen)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setIsOpen(!isOpen)
    } else if (e.key === 'Escape') {
      setIsOpen(false)
    }
  }

  const handleClearTouchDrag = () => {
    touchDragRef.current = null
    setTouchDragPreview(null)
    setDraggedValue(null)
    setDragOverValue(null)
    setDragDropPosition(null)
    if (dragScrollIntervalRef.current) {
      clearInterval(dragScrollIntervalRef.current)
      dragScrollIntervalRef.current = null
    }
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div
        ref={triggerRef}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        tabIndex={disabled ? -1 : 0}
        role="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-disabled={disabled}
        aria-label="选择选项"
        className={`flex items-center justify-between gap-1 w-full cursor-pointer select-none ${className ?? ''} ${
          disabled ? '!opacity-50 !cursor-not-allowed !bg-gray-100/50 dark:!bg-white/[0.05]' : ''
        }`}
      >
        <span className="truncate">{selectedOption?.label ?? value}</span>
        <ChevronDownIcon className={`w-3.5 h-3.5 flex-shrink-0 text-slate-400 dark:text-zinc-500 transition-transform duration-250 ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <div
          role="listbox"
          className={`absolute z-50 w-full overflow-hidden overflow-y-auto rounded-none border-2 border-black dark:border-white bg-white dark:bg-zinc-950 py-1 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] custom-scrollbar ${
            placement === 'top' ? 'bottom-full mb-1.5 animate-dropdown-up' : 'top-full mt-1.5 animate-dropdown-down'
          }`}
          style={{ maxHeight: menuMaxHeight }}
        >
          {options.map((option) => {
            const handleItemDragStart = (e: React.DragEvent) => {
              if (!option.draggable) return
              setDraggedValue(option.value)
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', String(option.value))
            }

            const handleItemDragOver = (e: React.DragEvent) => {
              if (!option.draggable || !draggedValue) return
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'

              const targetElement = e.currentTarget as HTMLElement
              const rect = targetElement.getBoundingClientRect()
              const position = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'

              if (dragOverValue !== option.value || dragDropPosition !== position) {
                setDragOverValue(option.value)
                setDragDropPosition(position)
              }

              const scrollContainer = targetElement.parentElement
              if (scrollContainer) {
                const containerRect = scrollContainer.getBoundingClientRect()
                const scrollThreshold = 30

                if (e.clientY < containerRect.top + scrollThreshold) {
                  scrollContainer.scrollTop -= 10
                } else if (e.clientY > containerRect.bottom - scrollThreshold) {
                  scrollContainer.scrollTop += 10
                }
              }
            }

            const handleItemDragEnd = () => {
              setDraggedValue(null)
              setDragOverValue(null)
              setDragDropPosition(null)
            }

            const handleItemDrop = (e: React.DragEvent) => {
              if (!option.draggable || !onReorder) return
              e.preventDefault()
              setDraggedValue(null)
              setDragOverValue(null)
              setDragDropPosition(null)

              const sourceValue = e.dataTransfer.getData('text/plain')
              const sourceOption = options.find((o) => String(o.value) === sourceValue)
              if (sourceOption && sourceOption.value !== option.value) {
                onReorder(sourceOption.value, option.value, dragDropPosition)
              }
            }

            const handleItemTouchStart = (e: React.TouchEvent) => {
              if (!option.draggable) return
              const target = e.target as HTMLElement
              if (!target.closest('[data-drag-handle]')) return

              const touch = e.touches[0]
              const rect = e.currentTarget.getBoundingClientRect()
              e.stopPropagation()
              touchDragRef.current = { value: option.value, startX: touch.clientX, startY: touch.clientY, moved: false }
              setDraggedValue(option.value)
              setTouchDragPreview({
                label: option.label,
                x: touch.clientX,
                y: touch.clientY,
                width: rect.width,
                height: rect.height,
                offsetX: touch.clientX - rect.left,
                offsetY: touch.clientY - rect.top,
              })
            }

            const handleItemTouchMove = (e: React.TouchEvent) => {
              const drag = touchDragRef.current
              if (!drag || !option.draggable) return
              const touch = e.touches[0]

              if (!drag.moved) {
                if (Math.abs(touch.clientX - drag.startX) > 5 || Math.abs(touch.clientY - drag.startY) > 5) {
                  drag.moved = true
                } else {
                  return
                }
              }

              e.preventDefault()
              setTouchDragPreview((current) => current ? { ...current, x: touch.clientX, y: touch.clientY } : current)

              const previewEl = document.getElementById('touch-drag-preview')
              if (previewEl) previewEl.style.pointerEvents = 'none'

              const el = document.elementFromPoint(touch.clientX, touch.clientY)
              const targetDiv = el?.closest('[data-option-value]') as HTMLElement
              if (targetDiv) {
                const targetValueStr = targetDiv.getAttribute('data-option-value')
                if (targetValueStr) {
                  const targetOption = options.find((o) => String(o.value) === targetValueStr)
                  if (targetOption && targetOption.draggable) {
                    const rect = targetDiv.getBoundingClientRect()
                    const position = touch.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
                    if (dragOverValue !== targetOption.value || dragDropPosition !== position) {
                      setDragOverValue(targetOption.value)
                      setDragDropPosition(position)
                    }
                  }
                }
              }

              const scrollContainer = targetDiv?.closest('.custom-scrollbar') as HTMLElement
              if (scrollContainer) {
                const containerRect = scrollContainer.getBoundingClientRect()
                const scrollThreshold = 30

                if (dragScrollIntervalRef.current) {
                  clearInterval(dragScrollIntervalRef.current)
                  dragScrollIntervalRef.current = null
                }

                if (touch.clientY < containerRect.top + scrollThreshold) {
                  dragScrollIntervalRef.current = window.setInterval(() => {
                    scrollContainer.scrollTop -= 5
                  }, 16)
                } else if (touch.clientY > containerRect.bottom - scrollThreshold) {
                  dragScrollIntervalRef.current = window.setInterval(() => {
                    scrollContainer.scrollTop += 5
                  }, 16)
                }
              }
            }

            const handleItemTouchEnd = (e: React.TouchEvent) => {
              const drag = touchDragRef.current
              if (!drag || !drag.moved) {
                handleClearTouchDrag()
                return
              }

              e.preventDefault()

              if (onReorder && dragOverValue !== null && dragOverValue !== drag.value) {
                onReorder(drag.value, dragOverValue, dragDropPosition)
              }

              handleClearTouchDrag()
            }

            const handleItemClick = (e: React.MouseEvent) => {
              if ((e.target as HTMLElement).closest('button, [data-drag-handle]')) return
              e.preventDefault()
              onChange(option.value)
              setIsOpen(false)
            }

            const handleItemKeyDown = (e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onChange(option.value)
                setIsOpen(false)
              }
            }

            return (
              <div
                key={option.value}
                role="option"
                aria-selected={option.value === value}
                tabIndex={0}
                data-option-value={String(option.value)}
                draggable={option.draggable}
                onDragStart={handleItemDragStart}
                onDragOver={handleItemDragOver}
                onDragEnd={handleItemDragEnd}
                onDrop={handleItemDrop}
                onTouchStart={handleItemTouchStart}
                onTouchMove={handleItemTouchMove}
                onTouchEnd={handleItemTouchEnd}
                onTouchCancel={handleClearTouchDrag}
                onClick={handleItemClick}
                onKeyDown={handleItemKeyDown}
                className={`relative flex cursor-pointer items-center justify-between gap-2 px-3.5 py-2.5 text-xs transition-colors outline-none border-y border-transparent ${
                  draggedValue === option.value
                    ? 'opacity-40 bg-slate-100 dark:bg-zinc-800/40'
                    : option.variant === 'action'
                    ? 'font-bold text-black dark:text-white bg-[#FFE66D]/20 hover:bg-[#FFE66D] dark:hover:bg-yellow-400'
                    : option.variant === 'danger'
                    ? 'font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10'
                    : option.value === value
                    ? 'bg-[#FFE66D] dark:bg-yellow-400 text-black border-black dark:border-white font-black'
                    : 'text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-900 focus:bg-slate-100 dark:focus:bg-zinc-900'
                }`}
              >
                {dragOverValue === option.value && dragDropPosition === 'before' && draggedValue !== option.value && (
                  <div className="absolute -top-[1px] left-0 right-0 h-[2px] bg-indigo-500 rounded-full z-40 shadow-sm pointer-events-none" />
                )}
                {dragOverValue === option.value && dragDropPosition === 'after' && draggedValue !== option.value && (
                  <div className="absolute -bottom-[1px] left-0 right-0 h-[2px] bg-indigo-500 rounded-full z-40 shadow-sm pointer-events-none" />
                )}
                <div className="flex min-w-0 flex-1 items-center gap-2 pr-2">
                  {option.draggable && (
                    <div
                      data-drag-handle
                      className="flex cursor-grab active:cursor-grabbing items-center justify-center text-slate-400 opacity-60 transition-opacity hover:opacity-100 dark:text-zinc-500"
                      style={{ touchAction: 'none' }}
                      title="拖拽排序"
                    >
                      <DragHandleIcon className="h-3.5 w-3.5" />
                    </div>
                  )}
                  <span className="min-w-0 truncate">{option.label}</span>
                </div>
                {option.actions?.length ? (
                  <span className="ml-auto flex shrink-0 items-center gap-1">
                    {option.actions.map((action) => {
                      const handleActionClick = (event: React.MouseEvent) => {
                        event.preventDefault()
                        event.stopPropagation()
                        action.onClick()
                        setIsOpen(false)
                      }
                      return (
                        <button
                          key={action.label}
                          type="button"
                          title={action.label}
                          onPointerDown={(event) => {
                            event.stopPropagation()
                          }}
                          onClick={handleActionClick}
                          className={`rounded-md p-1.5 transition flex items-center justify-center ${
                            action.variant === 'danger'
                              ? 'text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10'
                              : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200'
                          }`}
                        >
                          {action.label === '编辑' ? (
                            <EditIcon className="w-3.5 h-3.5" />
                          ) : action.label === '删除' ? (
                            <TrashIcon className="w-3.5 h-3.5" />
                          ) : (
                            action.label
                          )}
                        </button>
                      )
                    })}
                  </span>
                ) : null}
                {option.variant === 'action' && (
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                    <PlusIcon className="h-4 w-4" />
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {touchDragPreview && createPortal(
        <div
          id="touch-drag-preview"
          className="fixed pointer-events-none z-[110] flex items-center justify-between gap-2 rounded-none border-2 border-black dark:border-white bg-white dark:bg-zinc-950 px-3.5 py-2.5 text-xs text-slate-900 dark:text-zinc-100 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)]"
          style={{
            left: touchDragPreview.x - touchDragPreview.offsetX,
            top: touchDragPreview.y - touchDragPreview.offsetY,
            width: touchDragPreview.width,
            minHeight: touchDragPreview.height,
          }}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2 pr-2">
            <DragHandleIcon className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-zinc-500" />
            <span className="min-w-0 truncate">{touchDragPreview.label}</span>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

export default Select
