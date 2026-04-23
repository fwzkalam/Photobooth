const video = document.getElementById("camera");
const startButton = document.getElementById("start");
const downloadButton = document.getElementById("download");
const filterSelect = document.getElementById("filter");
const delaySelect = document.getElementById("delay");
const shotsSelect = document.getElementById("shots");
const borderSelect = document.getElementById("border");
const cameraSelect = document.getElementById("cameraSelect");
const statusEl = document.getElementById("status");
const countdownEl = document.getElementById("countdown");
const stripCanvas = document.getElementById("stripCanvas");
const stripCtx = stripCanvas.getContext("2d");

let mediaStream;
let isCapturing = false;
let latestStrip = null;
let latestCaptures = [];
let selectedDeviceId = "";

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
  asset_frame_a: "assets/Photobooth_frame___ไม่นำไปใช้ในเชิงพาณิชย์นะคะ__-removebg-preview.png",
  asset_frame_b: "assets/_-2-removebg-preview.png",
};

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
        width: { ideal: 1080 },
        height: { ideal: 1350 },
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
  frameCanvas.width = 720;
  frameCanvas.height = 900;

  const frameCtx = frameCanvas.getContext("2d");
  frameCtx.filter = filterMap[filterSelect.value] || "none";

  const sourceWidth = video.videoWidth || frameCanvas.width;
  const sourceHeight = video.videoHeight || frameCanvas.height;
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = frameCanvas.width / frameCanvas.height;

  let sx = 0;
  let sy = 0;
  let sw = sourceWidth;
  let sh = sourceHeight;

  if (sourceRatio > targetRatio) {
    sw = sourceHeight * targetRatio;
    sx = (sourceWidth - sw) / 2;
  } else if (sourceRatio < targetRatio) {
    sh = sourceWidth / targetRatio;
    sy = (sourceHeight - sh) / 2;
  }

  frameCtx.save();
  frameCtx.translate(frameCanvas.width, 0);
  frameCtx.scale(-1, 1);
  frameCtx.drawImage(
    video,
    sx,
    sy,
    sw,
    sh,
    0,
    0,
    frameCanvas.width,
    frameCanvas.height,
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
        resolve({ image, crop });
      };
      image.onerror = () => reject(new Error(`Gagal memuat border asset: ${source}`));
      image.src = source;
    });
    borderAssetCache.set(source, loadPromise);
  }

  return borderAssetCache.get(source);
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

  stripCanvas.width = 420;
  const shotWidth = stripCanvas.width - margin * 2;
  const shotHeight = Math.round((shotWidth * 5) / 4);
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
    stripCtx.drawImage(image, margin, y, shotWidth, shotHeight);

    if (borderOverlay) {
      stripCtx.drawImage(
        borderOverlay.image,
        borderOverlay.crop.sx,
        borderOverlay.crop.sy,
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
    statusEl.textContent = "Selesai! Klik Download Strip untuk simpan hasil.";
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

startCamera();
