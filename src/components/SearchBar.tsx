import type React from 'react'
import { clearFailedTasks, useStore } from '../store'
import Select from './Select'
import { ChevronLeftIcon, FavoriteIcon, CollectionManageIcon, TrashIcon } from './icons'

const SearchBar: React.FC = () => {
  const searchQuery = useStore((s) => s.searchQuery)
  const setSearchQuery = useStore((s) => s.setSearchQuery)
  const filterStatus = useStore((s) => s.filterStatus)
  const setFilterStatus = useStore((s) => s.setFilterStatus)
  const filterFavorite = useStore((s) => s.filterFavorite)
  const setFilterFavorite = useStore((s) => s.setFilterFavorite)
  const activeFavoriteCollectionId = useStore((s) => s.activeFavoriteCollectionId)
  const setActiveFavoriteCollectionId = useStore((s) => s.setActiveFavoriteCollectionId)
  const openManageCollectionsModal = useStore((s) => s.openManageCollectionsModal)
  const tasks = useStore((s) => s.tasks)
  const setConfirmDialog = useStore((s) => s.setConfirmDialog)
  const inCollectionOverview = filterFavorite && !activeFavoriteCollectionId
  const failedCount = tasks.filter((task) => task.status === 'error').length

  const handleFavoriteClick = () => {
    if (activeFavoriteCollectionId) {
      setActiveFavoriteCollectionId(null)
      return
    }
    setFilterFavorite(!filterFavorite)
  }

  const handleClearFailed = () => {
    if (failedCount === 0) return
    setConfirmDialog({
      title: '清除失败记录',
      message: `确定要删除 ${failedCount} 条失败记录吗？关联的孤立图片资源也会被清理。`,
      confirmText: '删除',
      cancelText: '取消',
      tone: 'danger',
      action: () => {
        void clearFailedTasks()
      },
    })
  }

  return (
    <div data-no-drag-select className="mt-6 mb-4 flex gap-3">
      <div className="flex gap-2 flex-shrink-0 z-20">
        <button
          onClick={handleFavoriteClick}
          className={`p-2.5 rounded-sm border-2 transition-all duration-200 active:scale-95 ${
            filterFavorite
              ? 'border-black dark:border-white bg-[#FFE66D] dark:bg-yellow-400 text-black shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] dark:shadow-[1px_1px_0px_0px_rgba(255,255,255,1)] font-bold'
              : 'border-black dark:border-white bg-white dark:bg-zinc-855 text-slate-700 dark:text-zinc-200 hover:-translate-x-0.5 hover:-translate-y-0.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)] hover:bg-slate-50 dark:hover:bg-zinc-800'
          }`}
          title={activeFavoriteCollectionId ? '返回收藏夹' : filterFavorite ? '退出收藏夹视图' : '收藏夹'}
        >
          {activeFavoriteCollectionId ? <ChevronLeftIcon className="w-5 h-5" /> : <FavoriteIcon filled={filterFavorite} className="w-5 h-5" />}
        </button>
        {inCollectionOverview && (
          <button
            onClick={openManageCollectionsModal}
            className="p-2.5 rounded-sm border-2 border-black dark:border-white bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)] active:translate-x-0 active:translate-y-0 active:shadow-none transition-all duration-200 active:scale-95"
            title="管理收藏夹"
          >
            <CollectionManageIcon className="w-5 h-5" />
          </button>
        )}
        {!inCollectionOverview && (
          <>
            <div className="relative w-28">
              <Select
                value={filterStatus}
                onChange={(val) => setFilterStatus(val as any)}
                options={[
                  { label: '全部状态', value: 'all' },
                  { label: '已完成', value: 'done' },
                  { label: '生成中', value: 'running' },
                  { label: '失败', value: 'error' },
                ]}
                className="px-3 py-2.5 rounded-sm border-2 border-black dark:border-white bg-white dark:bg-zinc-800 text-sm font-bold text-slate-700 dark:text-zinc-200 focus:outline-none shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)] hover:bg-slate-50 transition-all cursor-pointer"
              />
            </div>
            <button
              type="button"
              onClick={handleClearFailed}
              disabled={failedCount === 0}
              title={failedCount > 0 ? `清理 ${failedCount} 条失败记录` : '没有失败记录'}
              aria-label={failedCount > 0 ? `清理 ${failedCount} 条失败记录` : '没有失败记录'}
              className="p-2.5 rounded-sm border-2 border-black dark:border-white bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)] transition-all duration-200 active:scale-95 enabled:hover:-translate-x-0.5 enabled:hover:-translate-y-0.5 enabled:hover:bg-[#FFE66D] enabled:hover:text-black disabled:cursor-not-allowed disabled:opacity-45"
            >
              <TrashIcon className="w-5 h-5" />
            </button>
          </>
        )}
      </div>
      <div className="relative flex-1 z-10">
        <svg
          className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          type="text"
          placeholder={inCollectionOverview ? '搜索收藏夹名称...' : '搜索提示词、参数...'}
          className="w-full pl-10 pr-4 py-2.5 rounded-sm border-2 border-black dark:border-white bg-white dark:bg-zinc-900 text-slate-900 dark:text-white text-sm focus:outline-none shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)] hover:bg-slate-50/50 dark:hover:bg-zinc-900/20 transition-all duration-200"
        />
      </div>
    </div>
  )
}

export default SearchBar
