const video = document.getElementById("camera");
const startButton = document.getElementById("start");
const downloadButton = document.getElementById("download");
const uploadDriveButton = document.getElementById("uploadDrive");
const filterSelect = document.getElementById("filter");
const delaySelect = document.getElementById("delay");
const shotsSelect = document.getElementById("shots");
const borderSelect = document.getElementById("border");
const cameraSelect = document.getElementById("cameraSelect");
const statusEl = document.getElementById("status");
const countdownEl = document.getElementById("countdown");
const stripCanvas = document.getElementById("stripCanvas");
const previewShell = document.querySelector(".preview-shell");
const stripCtx = stripCanvas.getContext("2d");

let mediaStream;
let isCapturing = false;
let isUploading = false;
let latestStrip = null;
let latestCaptures = [];
let selectedDeviceId = "";

const DRIVE_WEB_APP_URL =
  "https://script.google.com/macros/s/AKfycbylUhDr9EoP17Nr-iGrSEx6ynky4_obhU0m241i1tLH6iEFv1e3mkYKDVKmtI-Owi4z/exec";
const DRIVE_FOLDER_ID = "19ykuBO9oRH4sZulVTRO6qKNvoFoXwVin";
const ASSET_CACHE_BUSTER = Date.now();

function enforceLandscapePreview() {
  if (!previewShell) {
    return;
  }

  const width = previewShell.clientWidth;
  if (!width) {
    return;
  }

  previewShell.style.aspectRatio = "16 / 9";
  previewShell.style.height = `${Math.round((width * 9) / 16)}px`;
}

const filterMap = {
  none: "none",
  mono: "grayscale(1) contrast(1.12)",
  warm: "sepia(0.25) saturate(1.25) brightness(1.04)",
  cool: "saturate(0.86) contrast(1.08) hue-rotate(10deg)",
  vivid: "saturate(1.45) contrast(1.12)",
};

const borderThemes = {
  classic: {
    stripBg: "#ffffff",
    topBar: "#f2f2ee",
    title: "#1f2026",
    meta: "#5f626a",
    frameOuter: "#1f2026",
    frameInner: "#ffffff",
    frameLabel: "rgba(255,255,255,0.87)",
    footer: "#1f2026",
  },
  mint: {
    stripBg: "#f1fcf9",
    topBar: "#d7f3ea",
    title: "#0d4f52",
    meta: "#3a7170",
    frameOuter: "#0d4f52",
    frameInner: "#b9e9de",
    frameLabel: "#d9fff5",
    footer: "#0d4f52",
  },
  sunset: {
    stripBg: "#fff6ef",
    topBar: "#ffd8c2",
    title: "#7b2d12",
    meta: "#99563f",
    frameOuter: "#7b2d12",
    frameInner: "#ffc8ab",
    frameLabel: "#ffe9dc",
    footer: "#7b2d12",
  },
  mono: {
    stripBg: "#f5f6f8",
    topBar: "#dfe2e8",
    title: "#17191d",
    meta: "#4f5563",
    frameOuter: "#17191d",
    frameInner: "#c6cdd8",
    frameLabel: "#ebedf2",
    footer: "#17191d",
  },
};

const borderAssets = {
  asset_halloween_2: "assets/Orange Illustration Playful Happy Halloween Photobooth Collage-2-2.png",
  asset_halloween_3: "assets/Orange Illustration Playful Happy Halloween Photobooth Collage-3-2.png",
  asset_halloween_4: "assets/Orange Illustration Playful Happy Halloween Photobooth Collage-4-2.png",
  asset_halloween_5: "assets/Orange Illustration Playful Happy Halloween Photobooth Collage-5.png",
};

const borderAssetLayouts = {
  asset_halloween_2: {
    fit: "cover",
    slotInset: { x: 0, y: 0 },
    focusX: 0.5,
    focusY: 0.5,
    zoom: 1,
    overlayMode: "full",
  },
  asset_halloween_3: {
    fit: "cover",
    slotInset: { x: 0, y: 0 },
    focusX: 0.5,
    focusY: 0.5,
    zoom: 1,
    overlayMode: "full",
  },
  asset_halloween_4: {
    slots: [
      { x: 0.092, y: 0.084, w: 0.816, h: 0.196 },
      { x: 0.092, y: 0.337, w: 0.816, h: 0.196 },
      { x: 0.092, y: 0.589, w: 0.816, h: 0.196 },
    ],
    fit: "cover",
    slotInset: { x: 0, y: 0 },
    focusX: 0.5,
    focusY: 0.62,
    zoom: 1,
    overlayMode: "full",
  },
  asset_halloween_5: {
    fit: "cover",
    slotInset: { x: 0, y: 0 },
    focusX: 0.5,
    focusY: 0.5,
    zoom: 1,
    overlayMode: "full",
  },
};
const fallbackTemplateSlots = [
  { x: 0.095, y: 0.095, w: 0.81, h: 0.255 },
  { x: 0.095, y: 0.375, w: 0.81, h: 0.255 },
  { x: 0.095, y: 0.657, w: 0.81, h: 0.255 },
];

const borderAssetCache = new Map();

function detectOpaqueBounds(image) {
  const probeCanvas = document.createElement("canvas");
  probeCanvas.width = image.naturalWidth || image.width;
  probeCanvas.height = image.naturalHeight || image.height;
  const probeCtx = probeCanvas.getContext("2d", { willReadFrequently: true });
  probeCtx.drawImage(image, 0, 0);

  const { data, width, height } = probeCtx.getImageData(
    0,
    0,
    probeCanvas.width,
    probeCanvas.height,
  );

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 12) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return {
      sx: 0,
      sy: 0,
      sw: width,
      sh: height,
    };
  }

  return {
    sx: minX,
    sy: minY,
    sw: maxX - minX + 1,
    sh: maxY - minY + 1,
  };
}

function detectTransparentSlots(image, crop) {
  const slotCanvas = document.createElement("canvas");
  slotCanvas.width = crop.sw;
  slotCanvas.height = crop.sh;
  const slotCtx = slotCanvas.getContext("2d", { willReadFrequently: true });
  slotCtx.drawImage(image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, crop.sw, crop.sh);

  const { data, width, height } = slotCtx.getImageData(0, 0, crop.sw, crop.sh);
  const visited = new Uint8Array(width * height);
  const alphaMask = new Uint8Array(width * height);

  for (let i = 0; i < width * height; i += 1) {
    const alpha = data[i * 4 + 3];
    if (alpha < 20) {
      alphaMask[i] = 1;
    }
  }

  const components = [];
  const queue = new Int32Array(width * height);

  for (let start = 0; start < width * height; start += 1) {
    if (!alphaMask[start] || visited[start]) {
      continue;
    }

    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;

    let area = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    while (head < tail) {
      const idx = queue[head++];
      const x = idx % width;
      const y = Math.floor(idx / width);
      area += 1;

      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;

      const neighbors = [idx - 1, idx + 1, idx - width, idx + width];
      for (let i = 0; i < neighbors.length; i += 1) {
        const next = neighbors[i];
        if (next < 0 || next >= width * height || visited[next] || !alphaMask[next]) {
          continue;
        }

        const nx = next % width;
        const ny = Math.floor(next / width);
        if (Math.abs(nx - x) + Math.abs(ny - y) !== 1) {
          continue;
        }

        visited[next] = 1;
        queue[tail++] = next;
      }
    }

    const boxWidth = maxX - minX + 1;
    const boxHeight = maxY - minY + 1;
    const boxArea = boxWidth * boxHeight;
    const fillRatio = boxArea ? area / boxArea : 0;
    const minComponentArea = width * height * 0.02;
    const touchesEdge = minX === 0 || minY === 0 || maxX === width - 1 || maxY === height - 1;
    const isLandscapeLike = boxWidth / boxHeight > 1.1;

    if (area < minComponentArea || fillRatio < 0.92 || touchesEdge || !isLandscapeLike) {
      continue;
    }

    components.push({
      x: minX / width,
      y: minY / height,
      w: boxWidth / width,
      h: boxHeight / height,
      area,
    });
  }

  return components.sort((a, b) => b.area - a.area);
}

function detectPhotoSlots(image, crop) {
  const slotCanvas = document.createElement("canvas");
  slotCanvas.width = crop.sw;
  slotCanvas.height = crop.sh;
  const slotCtx = slotCanvas.getContext("2d", { willReadFrequently: true });
  slotCtx.drawImage(image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, crop.sw, crop.sh);

  const { data, width, height } = slotCtx.getImageData(0, 0, crop.sw, crop.sh);
  const visited = new Uint8Array(width * height);
  const whiteMask = new Uint8Array(width * height);

  for (let i = 0; i < width * height; i += 1) {
    const offset = i * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const a = data[offset + 3];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (a > 220 && min > 140 && max - min < 28) {
      whiteMask[i] = 1;
    }
  }

  const components = [];
  const queue = new Int32Array(width * height);

  for (let start = 0; start < width * height; start += 1) {
    if (!whiteMask[start] || visited[start]) {
      continue;
    }

    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;

    let area = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    while (head < tail) {
      const idx = queue[head++];
      const x = idx % width;
      const y = Math.floor(idx / width);
      area += 1;

      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;

      const neighbors = [idx - 1, idx + 1, idx - width, idx + width];
      for (let i = 0; i < neighbors.length; i += 1) {
        const next = neighbors[i];
        if (next < 0 || next >= width * height || visited[next] || !whiteMask[next]) {
          continue;
        }

        const nx = next % width;
        const ny = Math.floor(next / width);
        if (Math.abs(nx - x) + Math.abs(ny - y) !== 1) {
          continue;
        }

        visited[next] = 1;
        queue[tail++] = next;
      }
    }

    const boxWidth = maxX - minX + 1;
    const boxHeight = maxY - minY + 1;
    const boxArea = boxWidth * boxHeight;
    const fillRatio = boxArea ? area / boxArea : 0;
    const minComponentArea = width * height * 0.02;
    const touchesEdge = minX === 0 || minY === 0 || maxX === width - 1 || maxY === height - 1;

    if (area < minComponentArea || fillRatio < 0.82 || touchesEdge) {
      continue;
    }

    components.push({
      x: minX / width,
      y: minY / height,
      w: boxWidth / width,
      h: boxHeight / height,
      area,
    });
  }

  return components.sort((a, b) => b.area - a.area);
}

function detectNeutralGraySlots(image, crop) {
  const slotCanvas = document.createElement("canvas");
  slotCanvas.width = crop.sw;
  slotCanvas.height = crop.sh;
  const slotCtx = slotCanvas.getContext("2d", { willReadFrequently: true });
  slotCtx.drawImage(image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, crop.sw, crop.sh);

  const { data, width, height } = slotCtx.getImageData(0, 0, crop.sw, crop.sh);
  const visited = new Uint8Array(width * height);
  const grayMask = new Uint8Array(width * height);

  for (let i = 0; i < width * height; i += 1) {
    const offset = i * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const a = data[offset + 3];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lightness = (max + min) / 2;
    if (a > 220 && max - min < 14 && lightness >= 120 && lightness <= 225) {
      grayMask[i] = 1;
    }
  }

  const components = [];
  const queue = new Int32Array(width * height);

  for (let start = 0; start < width * height; start += 1) {
    if (!grayMask[start] || visited[start]) {
      continue;
    }

    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;

    let area = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    while (head < tail) {
      const idx = queue[head++];
      const x = idx % width;
      const y = Math.floor(idx / width);
      area += 1;

      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;

      const neighbors = [idx - 1, idx + 1, idx - width, idx + width];
      for (let i = 0; i < neighbors.length; i += 1) {
        const next = neighbors[i];
        if (next < 0 || next >= width * height || visited[next] || !grayMask[next]) {
          continue;
        }

        const nx = next % width;
        const ny = Math.floor(next / width);
        if (Math.abs(nx - x) + Math.abs(ny - y) !== 1) {
          continue;
        }

        visited[next] = 1;
        queue[tail++] = next;
      }
    }

    const boxWidth = maxX - minX + 1;
    const boxHeight = maxY - minY + 1;
    const boxArea = boxWidth * boxHeight;
    const fillRatio = boxArea ? area / boxArea : 0;
    const minComponentArea = width * height * 0.02;
    const touchesEdge = minX === 0 || minY === 0 || maxX === width - 1 || maxY === height - 1;
    const isLandscapeLike = boxWidth / boxHeight > 1.15;

    if (area < minComponentArea || fillRatio < 0.66 || touchesEdge || !isLandscapeLike) {
      continue;
    }

    components.push({
      x: minX / width,
      y: minY / height,
      w: boxWidth / width,
      h: boxHeight / height,
      area,
    });
  }

  return components.sort((a, b) => b.area - a.area);
}

function detectDarkSlots(image, crop) {
  const slotCanvas = document.createElement("canvas");
  slotCanvas.width = crop.sw;
  slotCanvas.height = crop.sh;
  const slotCtx = slotCanvas.getContext("2d", { willReadFrequently: true });
  slotCtx.drawImage(image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, crop.sw, crop.sh);

  const { data, width, height } = slotCtx.getImageData(0, 0, crop.sw, crop.sh);
  const visited = new Uint8Array(width * height);
  const darkMask = new Uint8Array(width * height);

  for (let i = 0; i < width * height; i += 1) {
    const offset = i * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const a = data[offset + 3];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lightness = (max + min) / 2;
    if (a > 220 && lightness <= 46 && max - min < 22) {
      darkMask[i] = 1;
    }
  }

  const components = [];
  const queue = new Int32Array(width * height);

  for (let start = 0; start < width * height; start += 1) {
    if (!darkMask[start] || visited[start]) {
      continue;
    }

    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;

    let area = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    while (head < tail) {
      const idx = queue[head++];
      const x = idx % width;
      const y = Math.floor(idx / width);
      area += 1;

      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;

      const neighbors = [idx - 1, idx + 1, idx - width, idx + width];
      for (let i = 0; i < neighbors.length; i += 1) {
        const next = neighbors[i];
        if (next < 0 || next >= width * height || visited[next] || !darkMask[next]) {
          continue;
        }

        const nx = next % width;
        const ny = Math.floor(next / width);
        if (Math.abs(nx - x) + Math.abs(ny - y) !== 1) {
          continue;
        }

        visited[next] = 1;
        queue[tail++] = next;
      }
    }

    const boxWidth = maxX - minX + 1;
    const boxHeight = maxY - minY + 1;
    const boxArea = boxWidth * boxHeight;
    const fillRatio = boxArea ? area / boxArea : 0;
    const minComponentArea = width * height * 0.02;
    const touchesEdge = minX === 0 || minY === 0 || maxX === width - 1 || maxY === height - 1;
    const isLandscapeLike = boxWidth / boxHeight > 1.15;

    if (area < minComponentArea || fillRatio < 0.75 || touchesEdge || !isLandscapeLike) {
      continue;
    }

    components.push({
      x: minX / width,
      y: minY / height,
      w: boxWidth / width,
      h: boxHeight / height,
      area,
    });
  }

  return components.sort((a, b) => b.area - a.area);
}

function pickMainPhotoSlot(slots) {
  if (!slots.length) {
    return null;
  }

  const landscapeSlots = slots.filter((slot) => slot.w / slot.h >= 1.1);
  const pool = landscapeSlots.length ? landscapeSlots : slots;
  return pool.reduce((best, slot) => (slot.area > best.area ? slot : best), pool[0]);
}

function buildOverlayForeground(image, crop, slots) {
  const fgCanvas = document.createElement("canvas");
  fgCanvas.width = crop.sw;
  fgCanvas.height = crop.sh;
  const fgCtx = fgCanvas.getContext("2d");
  fgCtx.drawImage(image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, crop.sw, crop.sh);

  slots.forEach((slot) => {
    const x = Math.round(slot.x * crop.sw);
    const y = Math.round(slot.y * crop.sh);
    const w = Math.round(slot.w * crop.sw);
    const h = Math.round(slot.h * crop.sh);
    fgCtx.clearRect(x, y, w, h);
  });

  return fgCanvas;
}

function isVideoReady() {
  return Boolean(video.videoWidth && video.videoHeight) && video.readyState >= 2;
}

async function waitForVideoReady(timeoutMs = 4000) {
  if (isVideoReady()) {
    return;
  }

  await new Promise((resolve, reject) => {
    const onReady = () => {
      cleanup();
      resolve();
    };

    const onTimeout = () => {
      cleanup();
      reject(new Error("Video stream belum siap"));
    };

    const cleanup = () => {
      clearTimeout(timeoutId);
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("canplay", onReady);
    };

    const timeoutId = setTimeout(onTimeout, timeoutMs);
    video.addEventListener("loadeddata", onReady);
    video.addEventListener("canplay", onReady);
  });
}

async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    statusEl.textContent = "Browser ini belum mendukung akses kamera.";
    return;
  }

  try {
    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
      mediaStream = null;
    }

    const preferredConstraints = {
      video: {
        ...(selectedDeviceId
          ? { deviceId: { exact: selectedDeviceId } }
          : { facingMode: "user" }),
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    };

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia(preferredConstraints);
    } catch {
      mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }

    video.srcObject = mediaStream;
    video.muted = true;
    await video.play();
    await waitForVideoReady();
    enforceLandscapePreview();
    await populateCameraList();
    const activeTrack = mediaStream.getVideoTracks()[0];
    const activeLabel = activeTrack?.label || "kamera";
    statusEl.textContent = `Kamera aktif: ${activeLabel}. Siap ambil foto.`;
  } catch (error) {
    statusEl.textContent = "Kamera gagal diakses. Cek izin browser dan pilih kamera lain.";
    console.error(error);
  }
}

async function populateCameraList() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return;
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  const cameras = devices.filter((device) => device.kind === "videoinput");
  const currentValue = selectedDeviceId;
  const activeLabel = mediaStream?.getVideoTracks()?.[0]?.label;

  cameraSelect.innerHTML = "";
  cameras.forEach((camera, idx) => {
    const option = document.createElement("option");
    option.value = camera.deviceId;
    option.textContent = camera.label || `Camera ${idx + 1}`;
    cameraSelect.append(option);
  });

  const shouldUseCurrent = cameras.some((camera) => camera.deviceId === currentValue);
  if (shouldUseCurrent) {
    cameraSelect.value = currentValue;
    return;
  }

  const activeMatch = cameras.find((camera) => camera.label === activeLabel);
  if (activeMatch) {
    selectedDeviceId = activeMatch.deviceId;
    cameraSelect.value = activeMatch.deviceId;
    return;
  }

  if (cameras[0]) {
    selectedDeviceId = cameras[0].deviceId;
    cameraSelect.value = cameras[0].deviceId;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runCountdown(seconds) {
  countdownEl.classList.remove("hidden");
  for (let tick = seconds; tick > 0; tick -= 1) {
    countdownEl.textContent = String(tick);
    await sleep(1000);
  }
  countdownEl.classList.add("hidden");
}

function snapFrame() {
  const frameCanvas = document.createElement("canvas");
  frameCanvas.width = 960;
  frameCanvas.height = 540;

  const frameCtx = frameCanvas.getContext("2d");
  frameCtx.filter = filterMap[filterSelect.value] || "none";

  const sourceWidth = video.videoWidth || frameCanvas.width;
  const sourceHeight = video.videoHeight || frameCanvas.height;
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = frameCanvas.width / frameCanvas.height;

  let drawWidth = frameCanvas.width;
  let drawHeight = frameCanvas.height;
  if (sourceRatio > targetRatio) {
    drawHeight = frameCanvas.width / sourceRatio;
  } else if (sourceRatio < targetRatio) {
    drawWidth = frameCanvas.height * sourceRatio;
  }

  const dx = (frameCanvas.width - drawWidth) / 2;
  const dy = (frameCanvas.height - drawHeight) / 2;

  frameCtx.fillStyle = "#101218";
  frameCtx.fillRect(0, 0, frameCanvas.width, frameCanvas.height);

  frameCtx.save();
  frameCtx.translate(frameCanvas.width, 0);
  frameCtx.scale(-1, 1);
  frameCtx.drawImage(
    video,
    0,
    0,
    sourceWidth,
    sourceHeight,
    dx,
    dy,
    drawWidth,
    drawHeight,
  );
  frameCtx.restore();

  return frameCanvas;
}

async function getBorderAsset() {
  const borderKey = borderSelect.value;
  const source = borderAssets[borderKey];
  if (!source) {
    return null;
  }

  if (!borderAssetCache.has(source)) {
    const loadPromise = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const crop = detectOpaqueBounds(image);
        const layout = borderAssetLayouts[borderKey];
        const transparentSlots = detectTransparentSlots(image, crop);
        const darkSlots = detectDarkSlots(image, crop);
        const graySlots = detectNeutralGraySlots(image, crop);
        const detectedSlots =
          transparentSlots.length >= 2
            ? transparentSlots
            : darkSlots.length >= 2
            ? darkSlots
            : graySlots.length >= 2
              ? graySlots
              : detectPhotoSlots(image, crop);
        const slots = layout?.slots?.length
          ? layout.slots
          : detectedSlots.length >= 2
            ? detectedSlots
            : fallbackTemplateSlots;
        const photoSlot = pickMainPhotoSlot(slots);
        const foreground = buildOverlayForeground(image, crop, slots);
        resolve({
          image,
          crop,
          slots,
          photoSlot,
          foreground,
          fit: layout?.fit || "cover",
          slotInset: layout?.slotInset || { x: 0, y: 0 },
          focusX: layout?.focusX ?? 0.5,
          focusY: layout?.focusY ?? 0.5,
          zoom: layout?.zoom ?? 1,
          overlayMode: layout?.overlayMode || "cutout",
        });
      };
      image.onerror = () => reject(new Error(`Gagal memuat border asset: ${source}`));
      image.src = `${source}?v=${ASSET_CACHE_BUSTER}`;
    });
    borderAssetCache.set(source, loadPromise);
  }

  return borderAssetCache.get(source);
}

function drawImageCover(ctx, image, dx, dy, dw, dh, focusX = 0.5, focusY = 0.5, zoom = 1) {
  const sourceWidth = image.width || image.videoWidth || dw;
  const sourceHeight = image.height || image.videoHeight || dh;
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = dw / dh;
  const normalizedFocusX = Math.min(Math.max(focusX, 0), 1);
  const normalizedFocusY = Math.min(Math.max(focusY, 0), 1);
  const normalizedZoom = Math.min(Math.max(zoom, 1), 2.5);

  let sx = 0;
  let sy = 0;
  let sw = sourceWidth;
  let sh = sourceHeight;

  if (sourceRatio > targetRatio) {
    sw = sourceHeight * targetRatio;
    sx = (sourceWidth - sw) * normalizedFocusX;
  } else if (sourceRatio < targetRatio) {
    sh = sourceWidth / targetRatio;
    sy = (sourceHeight - sh) * normalizedFocusY;
  }

  if (normalizedZoom > 1) {
    const focusPxX = sx + sw * normalizedFocusX;
    const focusPxY = sy + sh * normalizedFocusY;
    const zoomedSw = sw / normalizedZoom;
    const zoomedSh = sh / normalizedZoom;
    sx = focusPxX - zoomedSw * normalizedFocusX;
    sy = focusPxY - zoomedSh * normalizedFocusY;
    sw = zoomedSw;
    sh = zoomedSh;

    sx = Math.min(Math.max(sx, 0), sourceWidth - sw);
    sy = Math.min(Math.max(sy, 0), sourceHeight - sh);
  }

  ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
}

function drawImageContain(ctx, image, dx, dy, dw, dh, fill = "#101218") {
  const sourceWidth = image.width || image.videoWidth || dw;
  const sourceHeight = image.height || image.videoHeight || dh;
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = dw / dh;

  let renderW = dw;
  let renderH = dh;
  if (sourceRatio > targetRatio) {
    renderH = dw / sourceRatio;
  } else if (sourceRatio < targetRatio) {
    renderW = dh * sourceRatio;
  }

  const x = dx + (dw - renderW) / 2;
  const y = dy + (dh - renderH) / 2;
  ctx.fillStyle = fill;
  ctx.fillRect(dx, dy, dw, dh);
  ctx.drawImage(image, 0, 0, sourceWidth, sourceHeight, x, y, renderW, renderH);
}

async function drawStrip(images) {
  const totalShots = images.length;
  const margin = 26;
  const gap = 16;
  const header = 108;
  const footer = 86;
  const borderTheme = borderThemes[borderSelect.value] || borderThemes.classic;
  const borderOverlay = await getBorderAsset().catch((error) => {
    console.error(error);
    statusEl.textContent = "Border asset gagal dimuat. Memakai border warna default.";
    return null;
  });

  const hasTemplateSlots = Boolean(borderOverlay?.slots?.length >= 2);

  stripCanvas.width = 420;
  if (hasTemplateSlots) {
    const frameWidth = stripCanvas.width - margin * 2;
    const frameHeight = Math.round((frameWidth * borderOverlay.crop.sh) / borderOverlay.crop.sw);
    stripCanvas.height = header + footer + gap * 2 + frameHeight;

    stripCtx.fillStyle = borderTheme.stripBg;
    stripCtx.fillRect(0, 0, stripCanvas.width, stripCanvas.height);

    stripCtx.fillStyle = borderTheme.topBar;
    stripCtx.fillRect(0, 0, stripCanvas.width, 18);

    stripCtx.fillStyle = borderTheme.title;
    stripCtx.font = "700 44px 'Bebas Neue', sans-serif";
    stripCtx.fillText("ailesh", margin, 58);

    stripCtx.fillStyle = borderTheme.meta;
    stripCtx.font = "500 16px 'Space Grotesk', sans-serif";
    stripCtx.fillText(new Date().toLocaleString("id-ID"), margin, 84);

    const frameX = margin;
    const frameY = header + gap;
    const sortedSlots = borderOverlay.slots
      .slice()
      .sort((a, b) => a.y - b.y || a.x - b.x);

    const framesToDraw = Math.min(images.length, sortedSlots.length);
    for (let idx = 0; idx < framesToDraw; idx += 1) {
      const slot = sortedSlots[idx];
      const insetX = Math.min(Math.max(borderOverlay.slotInset?.x || 0, 0), 0.2);
      const insetY = Math.min(Math.max(borderOverlay.slotInset?.y || 0, 0), 0.2);
      const slotX = frameX + (slot.x + slot.w * insetX) * frameWidth;
      const slotY = frameY + (slot.y + slot.h * insetY) * frameHeight;
      const slotW = slot.w * frameWidth * (1 - insetX * 2);
      const slotH = slot.h * frameHeight * (1 - insetY * 2);
      if (borderOverlay.fit === "contain") {
        drawImageContain(stripCtx, images[idx], slotX, slotY, slotW, slotH);
      } else {
        drawImageCover(
          stripCtx,
          images[idx],
          slotX,
          slotY,
          slotW,
          slotH,
          borderOverlay.focusX,
          borderOverlay.focusY,
          borderOverlay.zoom,
        );
      }
    }

    const useFullOverlay = borderOverlay.overlayMode === "full";
    const overlaySource = useFullOverlay
      ? borderOverlay.image
      : borderOverlay.foreground || borderOverlay.image;
    const overlaySx = useFullOverlay ? borderOverlay.crop.sx : borderOverlay.foreground ? 0 : borderOverlay.crop.sx;
    const overlaySy = useFullOverlay ? borderOverlay.crop.sy : borderOverlay.foreground ? 0 : borderOverlay.crop.sy;
    stripCtx.drawImage(
      overlaySource,
      overlaySx,
      overlaySy,
      borderOverlay.crop.sw,
      borderOverlay.crop.sh,
      frameX,
      frameY,
      frameWidth,
      frameHeight,
    );

    stripCtx.fillStyle = borderTheme.footer;
    stripCtx.font = "600 16px 'Space Grotesk', sans-serif";
    stripCtx.fillText("ailesh_id", margin, stripCanvas.height - 30);

    latestStrip = stripCanvas.toDataURL("image/jpeg", 0.95);
    return;
  }

  const shotWidth = stripCanvas.width - margin * 2;
  const defaultShotRatio = 16 / 9;
  const overlayRatio = borderOverlay?.photoSlot
    ? borderOverlay.photoSlot.w / borderOverlay.photoSlot.h
    : borderOverlay
      ? borderOverlay.crop.sw / borderOverlay.crop.sh
      : defaultShotRatio;
  const shotRatio = Number.isFinite(overlayRatio) && overlayRatio > 0 ? overlayRatio : defaultShotRatio;
  const shotHeight = Math.round(shotWidth / shotRatio);
  stripCanvas.height = header + footer + gap * (totalShots + 1) + shotHeight * totalShots;

  stripCtx.fillStyle = borderTheme.stripBg;
  stripCtx.fillRect(0, 0, stripCanvas.width, stripCanvas.height);

  stripCtx.fillStyle = borderTheme.topBar;
  stripCtx.fillRect(0, 0, stripCanvas.width, 18);

  stripCtx.fillStyle = borderTheme.title;
  stripCtx.font = "700 44px 'Bebas Neue', sans-serif";
  stripCtx.fillText("ailesh", margin, 58);

  stripCtx.fillStyle = borderTheme.meta;
  stripCtx.font = "500 16px 'Space Grotesk', sans-serif";
  stripCtx.fillText(new Date().toLocaleString("id-ID"), margin, 84);

  let y = header + gap;
  images.forEach((image, idx) => {
    stripCtx.fillStyle = borderTheme.frameOuter;
    stripCtx.fillRect(margin - 3, y - 3, shotWidth + 6, shotHeight + 6);
    stripCtx.fillStyle = borderTheme.frameInner;
    stripCtx.fillRect(margin - 1, y - 1, shotWidth + 2, shotHeight + 2);

    if (borderOverlay?.photoSlot) {
      const slotX = margin + borderOverlay.photoSlot.x * shotWidth;
      const slotY = y + borderOverlay.photoSlot.y * shotHeight;
      const slotW = borderOverlay.photoSlot.w * shotWidth;
      const slotH = borderOverlay.photoSlot.h * shotHeight;
      drawImageCover(
        stripCtx,
        image,
        slotX,
        slotY,
        slotW,
        slotH,
        borderOverlay.focusX,
        borderOverlay.focusY,
        borderOverlay.zoom,
      );
    } else {
      drawImageCover(stripCtx, image, margin, y, shotWidth, shotHeight, 0.5, 0.5);
    }

    if (borderOverlay) {
      const useFullOverlay = borderOverlay.overlayMode === "full";
      const overlaySource = useFullOverlay
        ? borderOverlay.image
        : borderOverlay.foreground || borderOverlay.image;
      const overlaySx = useFullOverlay ? borderOverlay.crop.sx : borderOverlay.foreground ? 0 : borderOverlay.crop.sx;
      const overlaySy = useFullOverlay ? borderOverlay.crop.sy : borderOverlay.foreground ? 0 : borderOverlay.crop.sy;
      stripCtx.drawImage(
        overlaySource,
        overlaySx,
        overlaySy,
        borderOverlay.crop.sw,
        borderOverlay.crop.sh,
        margin,
        y,
        shotWidth,
        shotHeight,
      );
    }

    stripCtx.fillStyle = borderTheme.frameLabel;
    stripCtx.font = "700 14px 'Space Grotesk', sans-serif";
    stripCtx.fillText(`#${idx + 1}`, margin + 12, y + 24);
    y += shotHeight + gap;
  });

  stripCtx.fillStyle = borderTheme.footer;
  stripCtx.font = "600 16px 'Space Grotesk', sans-serif";
  stripCtx.fillText("ailesh_id", margin, stripCanvas.height - 30);

  latestStrip = stripCanvas.toDataURL("image/jpeg", 0.95);
}

function extractDriveLink(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const directKeys = [
    "url",
    "fileUrl",
    "webViewLink",
    "webContentLink",
    "downloadUrl",
    "link",
  ];

  for (let i = 0; i < directKeys.length; i += 1) {
    const value = payload[directKeys[i]];
    if (typeof value === "string" && value.startsWith("http")) {
      return value;
    }
  }

  const nestedKeys = ["data", "result", "file"];
  for (let i = 0; i < nestedKeys.length; i += 1) {
    const nested = payload[nestedKeys[i]];
    if (nested && typeof nested === "object") {
      const nestedLink = extractDriveLink(nested);
      if (nestedLink) {
        return nestedLink;
      }
    }
  }

  return "";
}

async function uploadStripToDrive() {
  if (!latestStrip || isUploading) {
    return;
  }

  isUploading = true;
  uploadDriveButton.disabled = true;
  downloadButton.disabled = true;
  statusEl.textContent = "Mengunggah photostrip ke Google Drive...";

  try {
    const base64 = latestStrip.split(",")[1] || "";
    const fileName = `ailesh-${Date.now()}.jpg`;
    const payload = {
      source: "ailesh-photobooth",
      action: "upload_photostrip",
      folderId: DRIVE_FOLDER_ID,
      fileName,
      mimeType: "image/jpeg",
      imageBase64: base64,
      imageDataUrl: latestStrip,
      createdAt: new Date().toISOString(),
    };

    const response = await fetch(DRIVE_WEB_APP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(payload),
    });

    const rawBody = await response.text();
    let parsed = null;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      parsed = { message: rawBody };
    }

    if (!response.ok) {
      throw new Error(parsed?.message || `Upload gagal (${response.status}).`);
    }

    const driveLink = extractDriveLink(parsed);
    if (driveLink) {
      statusEl.textContent = `Upload berhasil ke Drive: ${driveLink}`;
    } else {
      statusEl.textContent = "Upload selesai ke Drive. Link file tidak dikirim oleh web app.";
    }
  } catch (error) {
    console.error(error);
    statusEl.textContent = "Upload ke Drive gagal. Cek Apps Script (doPost + CORS) lalu coba lagi.";
  } finally {
    isUploading = false;
    downloadButton.disabled = !latestStrip;
    uploadDriveButton.disabled = !latestStrip;
  }
}

async function runSession() {
  if (!mediaStream || isCapturing) {
    return;
  }

  if (video.paused) {
    try {
      await video.play();
    } catch {
      statusEl.textContent = "Klik area halaman dulu, lalu coba lagi untuk aktifkan kamera.";
      return;
    }
  }

  if (!isVideoReady()) {
    try {
      await waitForVideoReady();
    } catch {
      statusEl.textContent = "Feed kamera belum siap. Refresh halaman lalu coba lagi.";
      return;
    }
  }

  isCapturing = true;
  startButton.disabled = true;
  downloadButton.disabled = true;
  uploadDriveButton.disabled = true;

  const shotCount = Number(shotsSelect.value);
  const delay = Number(delaySelect.value);
  const captures = [];
  latestCaptures = [];

  try {
    for (let i = 0; i < shotCount; i += 1) {
      statusEl.textContent = `Ambil foto ${i + 1} dari ${shotCount}...`;
      await runCountdown(delay);
      captures.push(snapFrame());
      latestCaptures = captures.slice();
      await drawStrip(latestCaptures);
      statusEl.textContent = `Foto ${i + 1} tersimpan (${i + 1}/${shotCount}).`;
      await sleep(350);
    }

    latestCaptures = captures;
    downloadButton.disabled = false;
    uploadDriveButton.disabled = false;
    statusEl.textContent = "Selesai! Kamu bisa Download atau Upload ke Drive.";
  } finally {
    isCapturing = false;
    startButton.disabled = false;
  }
}

function downloadStrip() {
  if (!latestStrip) {
    return;
  }

  const link = document.createElement("a");
  link.href = latestStrip;
  link.download = `ailesh-${Date.now()}.jpg`;
  link.click();
}

filterSelect.addEventListener("change", () => {
  video.style.filter = filterMap[filterSelect.value] || "none";
});
startButton.addEventListener("click", runSession);
downloadButton.addEventListener("click", downloadStrip);
uploadDriveButton.addEventListener("click", uploadStripToDrive);
cameraSelect.addEventListener("change", async () => {
  selectedDeviceId = cameraSelect.value;
  statusEl.textContent = "Mengganti kamera...";
  await startCamera();
});
borderSelect.addEventListener("change", () => {
  if (!latestCaptures.length || isCapturing) {
    return;
  }

  drawStrip(latestCaptures)
    .then(() => {
      statusEl.textContent = "Border strip diperbarui.";
    })
    .catch((error) => {
      console.error(error);
      statusEl.textContent = "Gagal menerapkan border. Coba pilih border lain.";
    });
});

window.addEventListener("resize", enforceLandscapePreview);
window.addEventListener("orientationchange", enforceLandscapePreview);

enforceLandscapePreview();
startCamera();
