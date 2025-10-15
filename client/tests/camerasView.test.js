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
let originalXMLSerializer
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
  originalXMLSerializer = globalThis.XMLSerializer
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.navigator = dom.window.navigator
  dom.window.navigator.clipboard = {
    async writeText() {}
  }
  globalThis.navigator.clipboard = dom.window.navigator.clipboard
  globalThis.SVGElement = dom.window.SVGElement
  globalThis.Element = dom.window.Element
  globalThis.Node = dom.window.Node
  globalThis.XMLSerializer = dom.window.XMLSerializer
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
  if (originalXMLSerializer === undefined) {
    delete globalThis.XMLSerializer
  } else {
    globalThis.XMLSerializer = originalXMLSerializer
  }
  dom = null
})

test('renders camera snapshots returned by the API', async () => {
  const CamerasView = await loadComponent('../src/views/Cameras.vue')
  assert.ok(globalThis.document, 'document should be available for Vue rendering tests')
  assert.ok(globalThis.window?.document, 'window.document should be available')
  axios.get = async () => ({
    data: {
      cameras: [
        {
          id: 'front-door',
          name: 'Front door',
          thumbnailUrl: 'https://example.local/door/thumb.jpg',
          streamUrl: 'https://example.local/door/live.m3u8',
          streamType: 'hls'
        }
      ]
    }
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

test('renders camera data provided via integration metadata urls', async () => {
  const CamerasView = await loadComponent('../src/views/Cameras.vue')
  axios.get = async () => ({
    data: {
      cameras: [
        {
          id: 'cam-1',
          name: 'Balkon',
          urls: {
            snapshotProxy: '/api/cameras/cam-1/snapshot',
            streamProxy: '/api/cameras/cam-1/stream',
            streamType: 'hls'
          }
        }
      ]
    }
  })

  const wrapper = mount(CamerasView)

  try {
    await nextTick()
    await flushPromises()
    await nextTick()

    const markup = wrapper.html()
    assert.equal(markup.includes('Snapshot unavailable'), false)
    assert.match(markup, /<img[^>]+src="\/api\/cameras\/cam-1\/snapshot\?t=\d+"/)
    assert.match(markup, /<source[^>]+src="\/api\/cameras\/cam-1\/stream"/)
    assert.match(markup, /<source[^>]+type="application\/x-mpegURL"/)
  } finally {
    wrapper.unmount()
  }
})

test('shows an RTSP helper message instead of embedding an unsupported stream', async () => {
  const CamerasView = await loadComponent('../src/views/Cameras.vue')
  axios.get = async () => ({
    data: {
      cameras: [
        {
          id: 'cam-rtsp',
          name: 'Back garden',
          streamUrl: 'rtsp://admin:123456@192.168.0.171/live/ch0'
        }
      ]
    }
  })

  const wrapper = mount(CamerasView)

  try {
    await nextTick()
    await flushPromises()
    await nextTick()

    const markup = wrapper.html()
    assert.equal(markup.includes('camera-stream__player'), false)
    assert.equal(markup.includes('camera-stream__frame'), false)
    assert.match(
      markup,
      /RTSP stream that cannot be played directly in the\s+browser/,
      'fallback copy should mention RTSP limitation'
    )
    assert.match(
      markup,
      /<code[^>]*>rtsp:\/\/admin:123456@192\.168\.0\.171\/live\/ch0<\/code>/,
      'RTSP address should be rendered in a code block for easy copying'
    )
    assert.match(
      markup,
      /<button[^>]+class="[^"]*camera-stream__copy[^"]*"[^>]*>Copy link<\/button>/,
      'Copy button should be rendered for RTSP streams'
    )
    assert.equal(markup.includes('href="rtsp://'), false)
  } finally {
    wrapper.unmount()
  }
})

test('allows copying RTSP stream URLs for external players', async () => {
  const CamerasView = await loadComponent('../src/views/Cameras.vue')
  const clipboardWrites = []
  dom.window.navigator.clipboard.writeText = async (value) => {
    clipboardWrites.push(value)
  }
  axios.get = async () => ({
    data: {
      cameras: [
        {
          id: 'cam-rtsp',
          name: 'Back garden',
          streamUrl: 'rtsp://admin:123456@192.168.0.171/live/ch0'
        }
      ]
    }
  })

  const wrapper = mount(CamerasView)

  try {
    await nextTick()
    await flushPromises()
    await nextTick()

    const copyButtonEl = wrapper.element.querySelector('.camera-stream__copy')
    assert.ok(copyButtonEl, 'Copy button should be present')

    copyButtonEl.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
    await flushPromises()
    await nextTick()

    assert.deepEqual(clipboardWrites, [
      'rtsp://admin:123456@192.168.0.171/live/ch0'
    ])
    const updatedButtonEl = wrapper.element.querySelector('.camera-stream__copy')
    assert.ok(updatedButtonEl, 'Copy button should remain in the DOM')
    assert.equal(updatedButtonEl.textContent, 'Copied!')
  } finally {
    wrapper.unmount()
  }
})
