import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { JSDOM } from 'jsdom'
import axios from 'axios'
import { compileScript, parse } from '@vue/compiler-sfc'

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0))

const loadComponent = async (relativePath) => {
  const importerDir = dirname(fileURLToPath(import.meta.url))
  const filename = resolve(importerDir, relativePath)
  const source = await readFile(filename, 'utf8')
  const { descriptor } = parse(source, { filename })
  const script = compileScript(descriptor, { id: filename, inlineTemplate: true })
  const tempDir = await mkdtemp(join(importerDir, '.tmp-cameras-'))
  const tempFile = join(tempDir, 'component.mjs')
  await writeFile(tempFile, script.content, 'utf8')
  try {
    const module = await import(pathToFileURL(tempFile).href)
    return module.default
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

let dom
let originalWindow
let originalDocument
let originalNavigator
let originalAxiosGet
let originalSVGElement
let originalElement
let originalNode
let mount
let nextTick

beforeEach(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' })
  originalWindow = globalThis.window
  originalDocument = globalThis.document
  originalNavigator = globalThis.navigator
  originalSVGElement = globalThis.SVGElement
  originalElement = globalThis.Element
  originalNode = globalThis.Node
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.navigator = dom.window.navigator
  globalThis.SVGElement = dom.window.SVGElement
  globalThis.Element = dom.window.Element
  globalThis.Node = dom.window.Node
  dom.window.setInterval = (handler) => {
    if (typeof handler === 'function') {
      handler()
    }
    return 1
  }
  dom.window.clearInterval = () => {}
  originalAxiosGet = axios.get
  if (!mount) {
    ;({ mount } = await import('@vue/test-utils'))
  }
  if (!nextTick) {
    ;({ nextTick } = await import('vue'))
  }
})

afterEach(() => {
  axios.get = originalAxiosGet
  if (dom) {
    dom.window.close()
  }
  if (originalWindow === undefined) {
    delete globalThis.window
  } else {
    globalThis.window = originalWindow
  }
  if (originalDocument === undefined) {
    delete globalThis.document
  } else {
    globalThis.document = originalDocument
  }
  if (originalNavigator === undefined) {
    delete globalThis.navigator
  } else {
    globalThis.navigator = originalNavigator
  }
  if (originalSVGElement === undefined) {
    delete globalThis.SVGElement
  } else {
    globalThis.SVGElement = originalSVGElement
  }
  if (originalElement === undefined) {
    delete globalThis.Element
  } else {
    globalThis.Element = originalElement
  }
  if (originalNode === undefined) {
    delete globalThis.Node
  } else {
    globalThis.Node = originalNode
  }
  dom = null
})

test('renders camera snapshots returned by the API', async () => {
  const CamerasView = await loadComponent('../src/views/Cameras.vue')
  assert.ok(globalThis.document, 'document should be available for Vue rendering tests')
  assert.ok(globalThis.window?.document, 'window.document should be available')
  axios.get = async () => ({
    data: [
      {
        id: 'front-door',
        name: 'Front door',
        thumbnailUrl: 'https://example.local/door/thumb.jpg',
        streamUrl: 'https://example.local/door/live.m3u8',
        streamType: 'hls'
      }
    ]
  })

  const wrapper = mount(CamerasView)

  try {
    await nextTick()
    await flushPromises()
    await nextTick()

    const cards = wrapper.findAll('[data-testid="camera-card"]')
    assert.equal(cards.length, 1)
    assert.match(cards[0].find('img').attributes('src'), /thumb\.jpg\?t=\d+$/)
    assert.equal(cards[0].text().includes('Front door'), true)
  } finally {
    wrapper.unmount()
  }
})
