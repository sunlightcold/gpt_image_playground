import { access, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA_FILE = path.join(ROOT_DIR, 'src/data/gptImage2Cases.ts')
const IMAGE_DIR = path.join(ROOT_DIR, 'data/gpt-image-2/images')

const UPSTREAM_REPO = process.env.PROMPT_CASE_UPSTREAM_REPO || 'freestylefly/awesome-gpt-image-2'
const UPSTREAM_REF = process.env.PROMPT_CASE_UPSTREAM_REF || 'main'
const LOCAL_REPO = process.env.PROMPT_CASE_LOCAL_REPO || 'sunlightcold/gpt_image_playground'
const LOCAL_BRANCH = process.env.PROMPT_CASE_LOCAL_BRANCH || 'main'
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || ''
const USER_AGENT = 'gpt-image-playground-prompt-case-sync'
const execFileAsync = promisify(execFile)

const args = new Set(process.argv.slice(2))
const DRY_RUN = args.has('--dry-run')
const FORCE_IMAGES = args.has('--force-images')
const SKIP_IMAGES = args.has('--no-images')
const USE_RAW_FETCH = args.has('--raw-fetch')
const FETCH_RETRIES = Number.parseInt(process.env.PROMPT_CASE_FETCH_RETRIES || '4', 10)

const CATEGORY_OPTIONS = [
  { value: 'Architecture & Spaces', label: '建筑与空间' },
  { value: 'Brand & Logos', label: '品牌与标志' },
  { value: 'Characters & People', label: '人物与角色' },
  { value: 'Charts & Infographics', label: '图表与信息可视化' },
  { value: 'Documents & Publishing', label: '文档与出版物' },
  { value: 'History & Classical Themes', label: '历史与古风' },
  { value: 'Illustration & Art', label: '插画与艺术' },
  { value: 'Other Use Cases', label: '其他应用' },
  { value: 'Photography & Realism', label: '摄影与写实' },
  { value: 'Posters & Typography', label: '海报与排版' },
  { value: 'Products & E-commerce', label: '商品与电商' },
  { value: 'Scenes & Storytelling', label: '场景与叙事' },
  { value: 'UI & Interfaces', label: 'UI 与界面' },
]

const STYLE_OPTIONS = [
  { value: '3D', label: '3D' },
  { value: 'Architecture', label: '建筑' },
  { value: 'Brand', label: '品牌' },
  { value: 'Character', label: '角色' },
  { value: 'Characters', label: '人物' },
  { value: 'Charts', label: '图表' },
  { value: 'Classical', label: '古典' },
  { value: 'Documents', label: '文档' },
  { value: 'History', label: '历史' },
  { value: 'Illustration', label: '插画' },
  { value: 'Infographic', label: '信息图' },
  { value: 'Other Use Cases', label: '其他应用' },
  { value: 'Photography', label: '摄影' },
  { value: 'Poster', label: '海报' },
  { value: 'Product', label: '商品' },
  { value: 'Products', label: '商品' },
  { value: 'Realistic', label: '写实' },
  { value: 'Scenes', label: '场景' },
  { value: 'UI', label: 'UI' },
]

const SCENE_OPTIONS = [
  { value: 'Commerce', label: '商业' },
  { value: 'Creative', label: '创意' },
  { value: 'Education', label: '教育' },
  { value: 'Fashion', label: '时尚' },
  { value: 'Food', label: '美食' },
  { value: 'History', label: '历史' },
  { value: 'Social', label: '社交' },
  { value: 'Story', label: '叙事' },
  { value: 'Tech', label: '科技' },
  { value: 'Travel', label: '旅行' },
]

function githubHeaders() {
  const headers = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': USER_AGENT,
  }
  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`
  return headers
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchWithError(url, options = {}) {
  let lastError
  const attempts = Math.max(1, FETCH_RETRIES)

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'User-Agent': USER_AGENT,
          ...(options.headers || {}),
        },
      })
      if (!response.ok) {
        const body = await response.text().catch(() => '')
        throw new Error(`Request failed: ${response.status} ${response.statusText} ${url}${body ? `\n${body.slice(0, 400)}` : ''}`)
      }
      return response
    } catch (error) {
      lastError = error
      if (attempt >= attempts) break
      const delay = 1000 * attempt * attempt
      console.warn(`Fetch failed (${attempt}/${attempts}), retrying in ${delay}ms: ${url}`)
      await sleep(delay)
    }
  }

  throw lastError
}

async function fetchJson(url) {
  const response = await fetchWithError(url, { headers: githubHeaders() })
  return response.json()
}

async function fetchText(url) {
  const response = await fetchWithError(url)
  return response.text()
}

async function fetchBuffer(url) {
  const response = await fetchWithError(url)
  return Buffer.from(await response.arrayBuffer())
}

function rawUrl(repo, ref, filePath) {
  return `https://raw.githubusercontent.com/${repo}/${ref}/${filePath}`
}

async function runGit(gitArgs, options = {}) {
  return execFileAsync('git', gitArgs, {
    cwd: ROOT_DIR,
    timeout: 180000,
    maxBuffer: 10 * 1024 * 1024,
    ...options,
  })
}

async function resolveUpstreamCommit() {
  if (/^[0-9a-f]{40}$/i.test(UPSTREAM_REF)) return UPSTREAM_REF
  if (GITHUB_TOKEN) {
    const data = await fetchJson(`https://api.github.com/repos/${UPSTREAM_REPO}/commits/${encodeURIComponent(UPSTREAM_REF)}`)
    if (!data?.sha) throw new Error(`Unable to resolve upstream ref: ${UPSTREAM_REF}`)
    return data.sha
  }

  try {
    const { stdout } = await execFileAsync('git', ['ls-remote', `https://github.com/${UPSTREAM_REPO}.git`, `refs/heads/${UPSTREAM_REF}`], {
      cwd: ROOT_DIR,
      timeout: 30000,
    })
    const sha = stdout.trim().split(/\s+/)[0]
    if (/^[0-9a-f]{40}$/i.test(sha)) return sha
  } catch (error) {
    console.warn(`Unable to resolve upstream ref with git ls-remote: ${error instanceof Error ? error.message : String(error)}`)
  }

  const data = await fetchJson(`https://api.github.com/repos/${UPSTREAM_REPO}/commits/${encodeURIComponent(UPSTREAM_REF)}`)
  if (!data?.sha) throw new Error(`Unable to resolve upstream ref: ${UPSTREAM_REF}`)
  return data.sha
}

async function createUpstreamSnapshot(commit) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gpt-image-cases-'))
  const repoUrl = `https://github.com/${UPSTREAM_REPO}.git`
  const isShaRef = /^[0-9a-f]{40}$/i.test(UPSTREAM_REF)

  try {
    if (isShaRef) {
      await runGit(['clone', '--filter=blob:none', '--sparse', repoUrl, directory])
      await runGit(['sparse-checkout', 'set', 'docs', 'data/images'], { cwd: directory })
      await runGit(['checkout', commit], { cwd: directory })
    } else {
      await runGit(['clone', '--depth=1', '--filter=blob:none', '--sparse', '--branch', UPSTREAM_REF, repoUrl, directory])
      await runGit(['sparse-checkout', 'set', 'docs', 'data/images'], { cwd: directory })
    }

    const { stdout } = await runGit(['rev-parse', 'HEAD'], { cwd: directory })
    return {
      directory,
      commit: stdout.trim(),
    }
  } catch (error) {
    await rm(directory, { recursive: true, force: true })
    throw error
  }
}

async function readUpstreamText(snapshotDir, commit, filePath) {
  if (snapshotDir) {
    return readFile(path.join(snapshotDir, ...filePath.split('/')), 'utf8')
  }
  return fetchText(rawUrl(UPSTREAM_REPO, commit, filePath))
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function normalizeLineEndings(value) {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function unescapeMarkdown(value) {
  return value
    .replace(/\\([\\`*_[\]()#+\-.!{}|>])/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim()
}

function stripMarkdown(value) {
  return unescapeMarkdown(value.replace(/[*_`]/g, '').trim())
}

function parseSource(rawSource) {
  const value = rawSource.trim()
  const link = value.match(/^\[([\s\S]+?)\]\((https?:\/\/[^)\s]+)\)$/)
  if (link) {
    return {
      sourceLabel: unescapeMarkdown(link[1]),
      sourceUrl: link[2],
    }
  }

  const inlineLink = value.match(/\[([\s\S]+?)\]\((https?:\/\/[^)\s]+)\)/)
  if (inlineLink) {
    return {
      sourceLabel: unescapeMarkdown(inlineLink[1]),
      sourceUrl: inlineLink[2],
    }
  }

  const label = stripMarkdown(value)
  return {
    sourceLabel: label === '未提供' ? '未提供' : label,
    sourceUrl: '',
  }
}

function resolveMarkdownPath(docPath, imagePath) {
  if (/^https?:\/\//i.test(imagePath)) return imagePath
  const dir = path.posix.dirname(docPath)
  return path.posix.normalize(path.posix.join(dir, imagePath))
}

function getPromptPreview(prompt, maxLength = 200) {
  const text = prompt.replace(/\s+/g, ' ').trim()
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term))
}

function addTag(tags, value) {
  if (!tags.includes(value)) tags.push(value)
}

function inferMetadata(caseItem) {
  const text = `${caseItem.title}\n${caseItem.imageAlt}\n${caseItem.prompt}`.toLowerCase()
  let category = 'Other Use Cases'

  if (includesAny(text, ['ui', 'interface', 'app ', 'apps', 'website', 'dashboard', 'youtube', 'instagram', 'x 的', 'x screenshot', 'screenshot', '界面', '网页', '直播', '社媒', '小红书', '截图'])) {
    category = 'UI & Interfaces'
  }
  if (includesAny(text, ['infographic', 'diagram', 'chart', 'timeline', 'knowledge graph', '信息图', '可视化', '图谱', '图表', '科普', '百科', '关系图', '流程图'])) {
    category = 'Charts & Infographics'
  }
  if (includesAny(text, ['poster', 'typography', 'cover', 'campaign', '海报', '封面', '版式', '字体', '排版'])) {
    category = 'Posters & Typography'
  }
  if (includesAny(text, ['product', 'e-commerce', 'commerce', 'packaging', '商品', '电商', '包装', '详情页', '广告', '商业'])) {
    category = 'Products & E-commerce'
  }
  if (includesAny(text, ['brand', 'logo', 'identity', 'vi ', '品牌', '标志', '徽标', '视觉识别'])) {
    category = 'Brand & Logos'
  }
  if (includesAny(text, ['architecture', 'interior', 'building', 'city map', 'travel poster', '建筑', '室内', '空间', '城市地图', '旅行海报'])) {
    category = 'Architecture & Spaces'
  }
  if (includesAny(text, ['photorealistic', 'ultra-realistic', 'realistic', 'photo', 'portrait', 'cinematic portrait', '摄影', '写真', '人像', '写实', '胶片'])) {
    category = 'Photography & Realism'
  }
  if (includesAny(text, ['illustration', 'watercolor', 'sketch', 'doodle', 'pencil', 'anime', 'manga', '插画', '水彩', '手绘', '涂鸦', '铅笔', '漫画', '纸艺'])) {
    category = 'Illustration & Art'
  }
  if (includesAny(text, ['character', 'chibi', 'figure', 'toy', 'playing-card', 'card artwork', '角色', '设定', '玩具', '卡牌', '扑克牌'])) {
    category = 'Characters & People'
  }
  if (includesAny(text, ['storyboard', 'storytelling', 'narrative', 'scene', 'film still', '故事', '叙事', '场景', '电影感', '分镜'])) {
    category = 'Scenes & Storytelling'
  }
  if (includesAny(text, ['history', 'classical', 'tang dynasty', 'song dynasty', '唐朝', '宋朝', '明朝', '古风', '历史', '李白', '苏轼', '杜甫', '武则天'])) {
    category = 'History & Classical Themes'
  }
  if (includesAny(text, ['document', 'publishing', 'paper', 'newspaper', 'prescription', '文档', '出版', '试卷', '处方', '书法', '手写', '报纸', '画册'])) {
    category = 'Documents & Publishing'
  }

  const styles = []
  const scenes = []

  switch (category) {
    case 'UI & Interfaces':
      addTag(styles, 'UI')
      break
    case 'Charts & Infographics':
      addTag(styles, 'Infographic')
      if (includesAny(text, ['chart', 'graph', '图表'])) addTag(styles, 'Charts')
      break
    case 'Posters & Typography':
      addTag(styles, 'Poster')
      break
    case 'Products & E-commerce':
      addTag(styles, 'Product')
      break
    case 'Brand & Logos':
      addTag(styles, 'Brand')
      break
    case 'Architecture & Spaces':
      addTag(styles, 'Architecture')
      break
    case 'Photography & Realism':
      addTag(styles, 'Realistic')
      addTag(styles, 'Photography')
      break
    case 'Illustration & Art':
      addTag(styles, 'Illustration')
      break
    case 'Characters & People':
      addTag(styles, 'Character')
      break
    case 'History & Classical Themes':
      addTag(styles, 'History')
      addTag(styles, 'Classical')
      break
    case 'Documents & Publishing':
      addTag(styles, 'Documents')
      break
    case 'Scenes & Storytelling':
      addTag(styles, 'Scenes')
      break
    default:
      addTag(styles, 'Other Use Cases')
      break
  }

  if (includesAny(text, ['3d', 'render', 'pixar', 'octane', 'toy', 'figure', '立体', '三维'])) addTag(styles, '3D')
  if (includesAny(text, ['ai', 'gpt', 'tech', 'app', 'website', 'software', 'cyber', 'data', '科技', '智能', '数据'])) addTag(scenes, 'Tech')
  if (includesAny(text, ['brand', 'product', 'e-commerce', 'commercial', 'campaign', 'logo', 'ad ', '商品', '电商', '品牌', '商业', '广告'])) addTag(scenes, 'Commerce')
  if (includesAny(text, ['fashion', 'outfit', 'dress', 'portrait', 'woman', 'girl', 'beauty', '时尚', '穿搭', '服装', '写真', '人像', '美女'])) addTag(scenes, 'Fashion')
  if (includesAny(text, ['infographic', 'education', 'science', 'learn', 'report', 'document', '科普', '百科', '学习', '报告', '文档'])) addTag(scenes, 'Education')
  if (includesAny(text, ['travel', 'city', 'street', 'paris', 'tokyo', 'map', '旅行', '城市', '街头', '地图'])) addTag(scenes, 'Travel')
  if (includesAny(text, ['food', 'restaurant', 'coffee', 'snack', '美食', '餐厅', '咖啡', '零食'])) addTag(scenes, 'Food')
  if (includesAny(text, ['history', 'classical', '古风', '历史', '唐朝', '宋朝', '明朝'])) addTag(scenes, 'History')
  if (includesAny(text, ['social', 'instagram', 'x.com', 'twitter', 'xiaohongshu', 'live', '社交', '小红书', '直播', '朋友圈'])) addTag(scenes, 'Social')
  if (includesAny(text, ['story', 'storyboard', 'narrative', 'scene', 'fantasy', 'film', '故事', '叙事', '场景', '电影'])) addTag(scenes, 'Story')
  if (scenes.length === 0) addTag(scenes, 'Creative')

  return {
    category,
    styles: styles.slice(0, 3),
    scenes: scenes.slice(0, 3),
    featured: false,
  }
}

function parseGalleryCases(markdown, docPath, commit) {
  const normalized = normalizeLineEndings(markdown)
  const anchors = [...normalized.matchAll(/<a\s+name=["']case-(\d+)["']><\/a>/gi)]
  const cases = []

  anchors.forEach((anchor, index) => {
    const id = Number(anchor[1])
    const start = anchor.index ?? 0
    const end = anchors[index + 1]?.index ?? normalized.length
    const block = normalized.slice(start, end)

    const titleMatch = block.match(/###\s*例\s*\d+\s*[：:]\s*(.+)/)
    const imageMatch = block.match(/!\[((?:\\.|[^\]])*)\]\(([^)\s]+)\)/)
    const sourceMatch = block.match(/\*\*来源：\*\*\s*([^\n]+)/)
    const promptStart = block.search(/\*\*提示词：\*\*/)
    const promptMatch = promptStart >= 0
      ? block.slice(promptStart).match(/```[^\n]*\n([\s\S]*?)\n```/)
      : null

    if (!Number.isFinite(id) || !titleMatch || !imageMatch || !promptMatch) {
      console.warn(`Skip unparsable case block in ${docPath}: case ${id || 'unknown'}`)
      return
    }

    const title = unescapeMarkdown(titleMatch[1])
    const imageAlt = unescapeMarkdown(imageMatch[1] || title)
    const upstreamImagePath = resolveMarkdownPath(docPath, imageMatch[2])
    const source = parseSource(sourceMatch?.[1] ?? '未提供')
    const prompt = normalizeLineEndings(promptMatch[1]).trim()
    const extension = path.posix.extname(upstreamImagePath) || '.jpg'
    const imageFileName = `case${id}${extension}`
    const localImageRelative = `data/gpt-image-2/images/${imageFileName}`

    cases.push({
      id,
      title,
      imageAlt,
      upstreamImagePath,
      imageFileName,
      localImageRelative,
      image: `https://raw.githubusercontent.com/${LOCAL_REPO}/${LOCAL_BRANCH}/${localImageRelative}`,
      ...source,
      prompt,
      promptPreview: getPromptPreview(prompt),
      githubUrl: `https://github.com/${UPSTREAM_REPO}/blob/${commit}/${docPath}#case-${id}`,
    })
  })

  return cases
}

function readBalancedJson(text, startIndex, openChar, closeChar) {
  let depth = 0
  let inString = false
  let escaping = false

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index]
    if (inString) {
      if (escaping) {
        escaping = false
      } else if (char === '\\') {
        escaping = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
    } else if (char === openChar) {
      depth += 1
    } else if (char === closeChar) {
      depth -= 1
      if (depth === 0) return text.slice(startIndex, index + 1)
    }
  }

  throw new Error(`Unable to read balanced JSON starting at ${startIndex}`)
}

function extractExportJson(text, exportName, openChar, closeChar) {
  const marker = `export const ${exportName}`
  const markerIndex = text.indexOf(marker)
  if (markerIndex < 0) return null
  const equalsIndex = text.indexOf('=', markerIndex)
  const jsonStart = text.indexOf(openChar, equalsIndex)
  if (equalsIndex < 0 || jsonStart < 0) return null
  return JSON.parse(readBalancedJson(text, jsonStart, openChar, closeChar))
}

async function readExistingData() {
  const text = await readFile(DATA_FILE, 'utf8')
  const cases = extractExportJson(text, 'GPT_IMAGE_2_CASES', '[', ']') ?? []
  return {
    cases,
    categories: extractExportJson(text, 'GPT_IMAGE_2_CASE_CATEGORIES', '[', ']') ?? CATEGORY_OPTIONS,
    styles: extractExportJson(text, 'GPT_IMAGE_2_CASE_STYLES', '[', ']') ?? STYLE_OPTIONS,
    scenes: extractExportJson(text, 'GPT_IMAGE_2_CASE_SCENES', '[', ']') ?? SCENE_OPTIONS,
  }
}

async function discoverGalleryDocs(commit, snapshotDir) {
  try {
    const gallery = await readUpstreamText(snapshotDir, commit, 'docs/gallery.md')
    const docs = unique(
      [...gallery.matchAll(/\((?:\.\/)?(gallery-part-\d+\.md)(?:#[^)]+)?\)/g)]
        .map((match) => `docs/${match[1]}`),
    )
    if (docs.length > 0) {
      return docs.sort((a, b) => {
        const aIndex = Number(a.match(/part-(\d+)/)?.[1] ?? 0)
        const bIndex = Number(b.match(/part-(\d+)/)?.[1] ?? 0)
        return aIndex - bIndex
      })
    }
  } catch (error) {
    console.warn(`Unable to discover gallery docs, using fallback list: ${error instanceof Error ? error.message : String(error)}`)
  }

  return ['docs/gallery-part-1.md', 'docs/gallery-part-2.md']
}

async function fileExists(filePath) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function downloadImage(caseItem, commit, snapshotDir) {
  const target = path.join(ROOT_DIR, caseItem.localImageRelative)
  if (!FORCE_IMAGES && await fileExists(target)) return 'skipped'

  if (!DRY_RUN) {
    await mkdir(path.dirname(target), { recursive: true })
    if (snapshotDir && !/^https?:\/\//i.test(caseItem.upstreamImagePath)) {
      await copyFile(path.join(snapshotDir, ...caseItem.upstreamImagePath.split('/')), target)
    } else {
      const sourceUrl = /^https?:\/\//i.test(caseItem.upstreamImagePath)
        ? caseItem.upstreamImagePath
        : rawUrl(UPSTREAM_REPO, commit, caseItem.upstreamImagePath)
      const bytes = await fetchBuffer(sourceUrl)
      if (bytes.length === 0) throw new Error(`Empty image response for case ${caseItem.id}`)
      await writeFile(target, bytes)
    }
  }
  return 'downloaded'
}

function mergeCases(upstreamCases, existingCases) {
  const existingById = new Map(existingCases.map((caseItem) => [caseItem.id, caseItem]))
  return upstreamCases
    .map((caseItem) => {
      const existing = existingById.get(caseItem.id)
      const inferred = inferMetadata(caseItem)
      return {
        id: caseItem.id,
        title: caseItem.title,
        image: caseItem.image,
        imageAlt: caseItem.imageAlt,
        sourceLabel: caseItem.sourceLabel,
        sourceUrl: caseItem.sourceUrl,
        prompt: caseItem.prompt,
        promptPreview: getPromptPreview(caseItem.prompt),
        category: existing?.category || inferred.category,
        styles: Array.isArray(existing?.styles) && existing.styles.length > 0 ? existing.styles : inferred.styles,
        scenes: Array.isArray(existing?.scenes) && existing.scenes.length > 0 ? existing.scenes : inferred.scenes,
        featured: typeof existing?.featured === 'boolean' ? existing.featured : inferred.featured,
        githubUrl: caseItem.githubUrl,
      }
    })
    .sort((a, b) => b.id - a.id)
}

function ensureOptions(options, values) {
  const labels = new Map(options.map((option) => [option.value, option.label]))
  return unique([...options.map((option) => option.value), ...values])
    .map((value) => ({ value, label: labels.get(value) ?? value }))
}

function formatExport(name, type, value) {
  return `export const ${name}: ${type} = ${JSON.stringify(value, null, 2)}`
}

function generateDataFile({ commit, cases, categories, styles, scenes }) {
  const usedCategories = cases.map((caseItem) => caseItem.category)
  const usedStyles = cases.flatMap((caseItem) => caseItem.styles)
  const usedScenes = cases.flatMap((caseItem) => caseItem.scenes)

  const source = {
    repository: `https://github.com/${UPSTREAM_REPO}`,
    commit,
    license: 'MIT',
    totalCases: cases.length,
  }

  return `export type GptImage2CaseOption = {
  value: string
  label: string
}

export type GptImage2Case = {
  id: number
  title: string
  image: string
  imageAlt: string
  sourceLabel: string
  sourceUrl?: string
  prompt: string
  promptPreview: string
  category: string
  styles: string[]
  scenes: string[]
  featured: boolean
  githubUrl: string
}

${formatExport('GPT_IMAGE_2_CASE_SOURCE', '{ repository: string; commit: string; license: string; totalCases: number }', source)}

${formatExport('GPT_IMAGE_2_CASE_CATEGORIES', 'GptImage2CaseOption[]', ensureOptions(categories, usedCategories))}

${formatExport('GPT_IMAGE_2_CASE_STYLES', 'GptImage2CaseOption[]', ensureOptions(styles, usedStyles))}

${formatExport('GPT_IMAGE_2_CASE_SCENES', 'GptImage2CaseOption[]', ensureOptions(scenes, usedScenes))}

${formatExport('GPT_IMAGE_2_CASES', 'GptImage2Case[]', cases)}
`
}

async function main() {
  const existing = await readExistingData()
  let commit = await resolveUpstreamCommit()
  let snapshotDir = ''

  if (!USE_RAW_FETCH) {
    try {
      const snapshot = await createUpstreamSnapshot(commit)
      snapshotDir = snapshot.directory
      commit = snapshot.commit
      console.log(`Using upstream git snapshot: ${snapshotDir}`)
    } catch (error) {
      console.warn(`Unable to create upstream git snapshot, falling back to raw fetch: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  try {
    const docs = await discoverGalleryDocs(commit, snapshotDir)
    const upstreamCases = []

    for (const docPath of docs) {
      const markdown = await readUpstreamText(snapshotDir, commit, docPath)
      upstreamCases.push(...parseGalleryCases(markdown, docPath, commit))
    }

    const duplicateIds = upstreamCases
      .map((caseItem) => caseItem.id)
      .filter((id, index, ids) => ids.indexOf(id) !== index)
    if (duplicateIds.length > 0) {
      throw new Error(`Duplicate upstream case ids: ${unique(duplicateIds).join(', ')}`)
    }

    const mergedCases = mergeCases(upstreamCases, existing.cases)
    const nextFile = generateDataFile({
      commit,
      cases: mergedCases,
      categories: existing.categories,
      styles: existing.styles,
      scenes: existing.scenes,
    })

    let downloaded = 0
    let skipped = 0
    if (!SKIP_IMAGES) {
      await mkdir(IMAGE_DIR, { recursive: true })
      for (const caseItem of upstreamCases) {
        const status = await downloadImage(caseItem, commit, snapshotDir)
        if (status === 'downloaded') downloaded += 1
        if (status === 'skipped') skipped += 1
      }
    }

    const previousFile = await readFile(DATA_FILE, 'utf8')
    const changed = previousFile !== nextFile
    if (!DRY_RUN && changed) await writeFile(DATA_FILE, nextFile)

    const previousIds = new Set(existing.cases.map((caseItem) => caseItem.id))
    const addedIds = mergedCases.map((caseItem) => caseItem.id).filter((id) => !previousIds.has(id))
    const upstreamIds = new Set(upstreamCases.map((caseItem) => caseItem.id))
    const removedIds = existing.cases.map((caseItem) => caseItem.id).filter((id) => !upstreamIds.has(id))

    console.log(`Upstream: https://github.com/${UPSTREAM_REPO}/commit/${commit}`)
    console.log(`Gallery docs: ${docs.join(', ')}`)
    console.log(`Cases: ${existing.cases.length} -> ${mergedCases.length}`)
    console.log(`Added ids: ${addedIds.length ? addedIds.sort((a, b) => a - b).join(', ') : 'none'}`)
    console.log(`Removed upstream ids: ${removedIds.length ? removedIds.sort((a, b) => a - b).join(', ') : 'none'}`)
    console.log(`Images: ${SKIP_IMAGES ? 'skipped by --no-images' : `${downloaded} downloaded, ${skipped} already present`}`)
    console.log(`Data file: ${changed ? (DRY_RUN ? 'would update' : 'updated') : 'already up to date'}`)
  } finally {
    if (snapshotDir) await rm(snapshotDir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
