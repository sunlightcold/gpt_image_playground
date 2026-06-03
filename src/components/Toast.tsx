import { useStore } from '../store'

export default function Toast() {
  const toast = useStore((s) => s.toast)

  if (!toast) return null

  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return (
          <div className="flex items-center justify-center w-5 h-5 rounded-none border border-black bg-green-400 text-black">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )
      case 'error':
        return (
          <div className="flex items-center justify-center w-5 h-5 rounded-none border border-black bg-rose-500 text-white">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
        )
      default:
        return (
          <div className="flex items-center justify-center w-5 h-5 rounded-none border border-black bg-blue-400 text-black">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        )
    }
  }

  return (
    <div className="fixed top-[calc(var(--safe-area-top)+1rem)] left-1/2 z-[120] pointer-events-none toast-enter">
      <div className="flex items-center gap-2.5 w-max max-w-[calc(100vw-32px)] sm:max-w-[min(44rem,80vw)] px-5 py-3 bg-white dark:bg-zinc-900 border-2 border-black dark:border-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] text-sm font-bold text-gray-800 dark:text-gray-200 rounded-none">
        <span className="flex-shrink-0">{getIcon()}</span>
        <span className="leading-5 whitespace-pre-line text-center">{toast.message}</span>
      </div>
    </div>
  )
}
