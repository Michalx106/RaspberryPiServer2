<template>
  <div class="cameras">
    <header class="cameras__header">
      <h1>Cameras</h1>
      <button
        class="refresh-button"
        type="button"
        @click="refreshCameras"
        :disabled="isFetching"
        :aria-busy="isFetching"
      >
        {{ isFetching ? 'Refreshing…' : 'Refresh' }}
      </button>
    </header>

    <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>

    <p
      v-if="isLoading"
      class="status"
      role="status"
      aria-live="polite"
    >
      Loading cameras…
    </p>

    <section
      v-else-if="hasCameras"
      class="camera-grid"
      role="list"
      aria-label="Available cameras"
    >
      <article
        v-for="camera in cameras"
        :key="camera.id ?? camera.name"
        class="camera-card"
        data-testid="camera-card"
        role="listitem"
        :aria-label="`Camera ${camera.name ?? 'Unnamed'}`"
      >
        <header class="camera-card__header">
          <h2 class="camera-card__title">{{ camera.name ?? 'Unnamed camera' }}</h2>
          <span v-if="camera.location" class="camera-location">{{ camera.location }}</span>
        </header>

        <figure v-if="camera.thumbnailUrl" class="camera-thumbnail">
          <img
            :src="buildThumbnailSrc(camera.thumbnailUrl)"
            :alt="`Latest snapshot from ${camera.name ?? 'camera'}`"
            class="camera-thumbnail__image"
            loading="lazy"
          />
          <figcaption class="camera-thumbnail__caption">Live snapshot</figcaption>
        </figure>

        <div v-else class="camera-thumbnail camera-thumbnail--empty" role="group" aria-label="Camera snapshot unavailable">
          <span class="camera-thumbnail__placeholder">Snapshot unavailable</span>
        </div>

        <div v-if="camera.streamUrl" class="camera-stream">
          <video
            v-if="!shouldRenderStreamInIframe(camera)"
            class="camera-stream__player"
            controls
            playsinline
            muted
            :aria-label="`Live stream for ${camera.name ?? 'camera'}`"
          >
            <source
              :src="camera.streamUrl"
              :type="streamMimeType(camera)"
            />
            <p class="camera-stream__fallback">
              Your browser cannot play this stream inline.
              <a :href="camera.streamUrl" target="_blank" rel="noreferrer">Open stream in a new tab</a>.
            </p>
          </video>
          <iframe
            v-else
            class="camera-stream__frame"
            :src="camera.streamUrl"
            :title="`Embedded stream for ${camera.name ?? 'camera'}`"
            loading="lazy"
            allow="autoplay; encrypted-media"
          ></iframe>
        </div>
      </article>
    </section>

    <p
      v-else
      class="empty-state"
      role="status"
      aria-live="polite"
    >
      No cameras have been configured yet. Add a camera to see live snapshots and streams.
    </p>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import axios from 'axios'

const cameras = ref([])
const isFetching = ref(false)
const hasLoadedOnce = ref(false)
const errorMessage = ref('')
const thumbnailRefreshKey = ref(Date.now())

const AUTO_REFRESH_INTERVAL_MS = 5000
let autoRefreshTimerId = null

const isLoading = computed(() => !hasLoadedOnce.value && isFetching.value)
const hasCameras = computed(() => cameras.value.length > 0)

const handleError = (error) => {
  console.error('Failed to load cameras:', error)
  const defaultMessage = 'Unable to load cameras at this time.'

  if (error?.response?.data?.error) {
    errorMessage.value = error.response.data.error
    return
  }

  errorMessage.value = error?.message ?? defaultMessage
}

const refreshCameras = async () => {
  if (isFetching.value) {
    return
  }

  isFetching.value = true
  errorMessage.value = ''

  try {
    const { data } = await axios.get('/api/cameras')
    cameras.value = Array.isArray(data) ? data : []
    thumbnailRefreshKey.value = Date.now()
  } catch (error) {
    handleError(error)
  } finally {
    isFetching.value = false
    hasLoadedOnce.value = true
  }
}

const buildThumbnailSrc = (thumbnailUrl) => {
  if (typeof thumbnailUrl !== 'string' || thumbnailUrl.length === 0) {
    return ''
  }

  const separator = thumbnailUrl.includes('?') ? '&' : '?'
  return `${thumbnailUrl}${separator}t=${thumbnailRefreshKey.value}`
}

const normaliseStreamType = (camera) => {
  const type = camera?.streamType ?? camera?.streamFormat ?? ''
  return typeof type === 'string' ? type.toLowerCase() : ''
}

const shouldRenderStreamInIframe = (camera) => {
  const type = normaliseStreamType(camera)
  return type === 'mjpeg' || type === 'mjpg' || type === 'iframe'
}

const streamMimeType = (camera) => {
  if (camera?.streamMimeType) {
    return camera.streamMimeType
  }

  const type = normaliseStreamType(camera)
  switch (type) {
    case 'hls':
      return 'application/x-mpegURL'
    case 'dash':
      return 'application/dash+xml'
    case 'mp4':
      return 'video/mp4'
    case 'webm':
      return 'video/webm'
    case 'ogg':
      return 'video/ogg'
    case 'mjpeg':
    case 'mjpg':
      return 'video/x-motion-jpeg'
    default:
      return undefined
  }
}

const stopAutoRefresh = () => {
  if (autoRefreshTimerId !== null && typeof window !== 'undefined') {
    window.clearInterval(autoRefreshTimerId)
    autoRefreshTimerId = null
  }
}

const startAutoRefresh = () => {
  stopAutoRefresh()

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return
  }

  autoRefreshTimerId = window.setInterval(() => {
    if (!document.hidden) {
      refreshCameras()
    }
  }, AUTO_REFRESH_INTERVAL_MS)
}

const handleVisibilityChange = () => {
  if (typeof document === 'undefined') {
    return
  }

  if (!document.hidden) {
    refreshCameras()
  }
}

onMounted(() => {
  refreshCameras()
  startAutoRefresh()

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange)
  }
})

onUnmounted(() => {
  stopAutoRefresh()

  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  }
})

defineExpose({
  buildThumbnailSrc,
  shouldRenderStreamInIframe,
  streamMimeType
})
</script>

<style scoped>
.cameras {
  display: flex;
  flex-direction: column;
  gap: 2rem;
  padding: 2rem;
  max-width: 1100px;
  margin: 0 auto;
}

.cameras__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.refresh-button {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 999px;
  background: #2563eb;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 150ms ease-in-out, transform 150ms ease-in-out;
}

.refresh-button:disabled {
  background: #93c5fd;
  cursor: not-allowed;
}

.refresh-button:not(:disabled):hover {
  background: #1d4ed8;
}

.refresh-button:not(:disabled):active {
  transform: scale(0.97);
}

.status {
  font-size: 1rem;
  color: #475569;
}

.error {
  color: #dc2626;
  background: rgba(254, 226, 226, 0.75);
  border-radius: 0.75rem;
  padding: 0.75rem 1rem;
}

.camera-grid {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
}

.camera-card {
  background: #ffffff;
  border-radius: 1rem;
  padding: 1.5rem;
  box-shadow: 0 10px 25px -15px rgba(15, 23, 42, 0.3);
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.camera-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.camera-card__title {
  font-size: 1.25rem;
  margin: 0;
  color: #0f172a;
}

.camera-location {
  font-size: 0.85rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #64748b;
}

.camera-thumbnail {
  position: relative;
  border-radius: 0.75rem;
  overflow: hidden;
  background: linear-gradient(135deg, rgba(14, 116, 144, 0.08), rgba(37, 99, 235, 0.08));
  min-height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 0.5rem;
}

.camera-thumbnail__image {
  width: 100%;
  height: auto;
  display: block;
  object-fit: cover;
}

.camera-thumbnail__caption {
  font-size: 0.75rem;
  color: #475569;
}

.camera-thumbnail--empty {
  border: 2px dashed rgba(148, 163, 184, 0.6);
}

.camera-thumbnail__placeholder {
  font-size: 0.95rem;
  color: #64748b;
}

.camera-stream {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.camera-stream__player,
.camera-stream__frame {
  width: 100%;
  border-radius: 0.75rem;
  box-shadow: 0 12px 30px -18px rgba(15, 23, 42, 0.35);
  border: none;
  min-height: 220px;
  background: #020617;
}

.camera-stream__player {
  max-height: 320px;
}

.camera-stream__fallback {
  font-size: 0.85rem;
  color: #cbd5f5;
  padding: 0.75rem 1rem;
}

.camera-stream__fallback a {
  color: #bfdbfe;
  text-decoration: underline;
}

.empty-state {
  font-size: 1.05rem;
  color: #475569;
  text-align: center;
  background: rgba(226, 232, 240, 0.4);
  border-radius: 1rem;
  padding: 2rem 1.5rem;
}

@media (prefers-color-scheme: dark) {
  .cameras {
    color: #e2e8f0;
  }

  .camera-card {
    background: rgba(15, 23, 42, 0.85);
    box-shadow: 0 18px 40px -20px rgba(15, 23, 42, 0.75);
  }

  .camera-card__title {
    color: #e2e8f0;
  }

  .camera-thumbnail {
    background: linear-gradient(135deg, rgba(14, 116, 144, 0.18), rgba(37, 99, 235, 0.18));
  }

  .camera-thumbnail__caption {
    color: #cbd5f5;
  }

  .camera-thumbnail__placeholder {
    color: #cbd5f5;
  }

  .camera-stream__fallback {
    color: #cbd5f5;
    background: rgba(15, 23, 42, 0.6);
  }

  .empty-state {
    color: #cbd5f5;
    background: rgba(30, 41, 59, 0.6);
  }
}
</style>
