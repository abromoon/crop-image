"use strict";

const startScreen = document.getElementById("start");
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");
const browseBtn = document.getElementById("browse-btn");

const editor = document.getElementById("editor");
const previewFrame = document.getElementById("preview-frame");
const previewImg = document.getElementById("preview-img");
const cropOverlay = document.getElementById("crop-overlay");
const ratioSelect = document.getElementById("ratio-select");
const ratioCustom = document.getElementById("ratio-custom");
const ratioW = document.getElementById("ratio-w");
const ratioH = document.getElementById("ratio-h");
const ratioHint = document.getElementById("ratio-hint");
const anchorButtons = document.querySelectorAll("[data-anchor]");
const anchorMarker = document.getElementById("anchor-marker");
const anchorCaption = document.getElementById("anchor-caption");
const formatNote = document.getElementById("format-note");
const confirmBtn = document.getElementById("confirm-btn");
const resetBtn = document.getElementById("reset-btn");
const themeButtons = document.querySelectorAll("[data-theme-value]");
const themeColorMetas = document.querySelectorAll('meta[name="theme-color"]');

// Ячейки панели информации, по значению data-info.
const infoEls = {};
document.querySelectorAll("[data-info]").forEach((el) => {
  infoEls[el.dataset.info] = el;
});

const FORMAT_LABELS = {
  "image/png": "PNG",
  "image/jpeg": "JPEG",
  "image/webp": "WebP",
  "image/gif": "GIF",
  "image/avif": "AVIF",
  "image/bmp": "BMP",
  "image/svg+xml": "SVG",
  "image/tiff": "TIFF",
  "image/x-icon": "ICO",
  "image/vnd.microsoft.icon": "ICO",
  "image/heic": "HEIC",
};

// Единственное, что пишется в localStorage, — выбор темы.
// Изображение и параметры обрезки туда не попадают.
const THEME_KEY = "crop-image:theme";
// Цвет заголовка окна (= --bg темы), см. meta theme-color в index.html.
const THEME_COLORS = { light: "#f6f5f3", dark: "#161513" };

// Форматы, которые Canvas API кодирует по-настоящему без потерь.
const LOSSLESS_TYPES = new Set(["image/png"]);
// Форматы, которые Canvas умеет сохранять напрямую (пусть и с перекодированием).
const CANVAS_EXPORTABLE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

// Якоря сетки 3×3: col — 0 слева … 2 справа, row — 0 сверху … 2 снизу.
const ANCHORS = {
  "top-left": { col: 0, row: 0, label: "Сверху слева" },
  top: { col: 1, row: 0, label: "Сверху" },
  "top-right": { col: 2, row: 0, label: "Сверху справа" },
  left: { col: 0, row: 1, label: "Слева" },
  center: { col: 1, row: 1, label: "По центру" },
  right: { col: 2, row: 1, label: "Справа" },
  "bottom-left": { col: 0, row: 2, label: "Снизу слева" },
  bottom: { col: 1, row: 2, label: "Снизу" },
  "bottom-right": { col: 2, row: 2, label: "Снизу справа" },
};

// Пресеты пропорций — <option> в #ratio-select: value «ширина:высота» (они же
// и есть пропорции), data-hint — типичные разрешения. Рамка всегда максимального
// размера для картинки, без ресайза.
const RATIO_CUSTOM_HINT = "Целые числа от 1 до 9999.";

// Насколько близко (в экранных px) рамку надо подтащить к позиции якоря,
// чтобы она прилипла: при крупном исходнике точный центр мышью не поймать.
const SNAP_PX = 6;

let state = {
  file: null,
  objectUrl: null,
  image: null, // HTMLImageElement, уже загружен
  width: 0,
  height: 0,
  crop: null, // { x, y, w, h } в пикселях исходного изображения
  manual: false, // рамку сдвинули вручную и она не стоит на позиции якоря
};

// Выбранный якорь. Живёт вне state, чтобы пережить «Другое»,
// и только в памяти — в localStorage не пишется.
let anchorPref = "center";

// Выбранные пропорции [ширина, высота] — тоже только в памяти.
let ratioPref = [1, 1];

// Текущее перетаскивание рамки (null, если не тащим).
let drag = null;

// Оценка веса результата: таймер debounce и номер последнего запроса,
// чтобы отбрасывать устаревшие результаты.
let sizeTimer = null;
let sizeSeq = 0;

function resetState() {
  if (state.objectUrl) {
    URL.revokeObjectURL(state.objectUrl);
  }
  clearTimeout(sizeTimer);
  sizeSeq++;
  state = { file: null, objectUrl: null, image: null, width: 0, height: 0, crop: null, manual: false };
  fileInput.value = "";
  editor.hidden = true;
  startScreen.hidden = false;
}

function openFileDialog() {
  fileInput.click();
}

dropzone.addEventListener("click", openFileDialog);
dropzone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    openFileDialog();
  }
});
browseBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  openFileDialog();
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files && fileInput.files[0];
  if (file) loadFile(file);
});

["dragenter", "dragover"].forEach((evt) => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.add("dropzone--active");
  });
});

["dragleave", "dragend"].forEach((evt) => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove("dropzone--active");
  });
});

dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropzone.classList.remove("dropzone--active");
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) loadFile(file);
});

function loadFile(file) {
  if (!file.type.startsWith("image/")) {
    alert("Пожалуйста, выберите файл изображения.");
    return;
  }

  if (state.objectUrl) {
    URL.revokeObjectURL(state.objectUrl);
  }

  const objectUrl = URL.createObjectURL(file);
  const img = new Image();

  img.onload = () => {
    state.file = file;
    state.objectUrl = objectUrl;
    state.image = img;
    state.width = img.naturalWidth;
    state.height = img.naturalHeight;

    previewImg.src = objectUrl;

    updateSourceInfo();
    updateFormatNote(file.type);
    state.manual = false;
    applyAnchor();

    startScreen.hidden = true;
    editor.hidden = false;
  };

  img.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    alert("Не удалось прочитать файл как изображение.");
  };

  img.src = objectUrl;
}

function anchorAt(col, row) {
  return Object.keys(ANCHORS).find((name) => ANCHORS[name].col === col && ANCHORS[name].row === row);
}

// Смещение рамки по оси: index 0 — в начало, 1 — по центру, 2 — в конец
// свободного места (free = длина стороны исходника минус сторона рамки).
function axisOffset(index, free) {
  return Math.round((free * index) / 2);
}

// Рамка пропорций [rw, rh] максимального размера, вписанная в w×h.
// Целые пиксели, поэтому пропорции могут отличаться от заданных на полпикселя.
function fitRatio([rw, rh], w, h) {
  if (w * rh >= h * rw) {
    return { w: Math.max(1, Math.round((h * rw) / rh)), h };
  }
  return { w, h: Math.max(1, Math.round((w * rh) / rw)) };
}

function computeCropBox(anchor, w, h, ratio) {
  const size = fitRatio(ratio, w, h);
  const { col, row } = ANCHORS[anchor];
  return { x: axisOffset(col, w - size.w), y: axisOffset(row, h - size.h), ...size };
}

// Свободное место вокруг текущей рамки. Рамка максимального размера
// упирается в картинку по одной оси, так что свободна не больше чем одна.
function freeSpace() {
  return { x: state.width - state.crop.w, y: state.height - state.crop.h };
}

// Рамка сдвигается только по одной оси, поэтому для конкретной картинки якорь
// сводится к одной из трёх позиций: если есть место по горизонтали — важна
// колонка, по вертикали — ряд, если места нет совсем — ничего.
function effectiveAnchor(anchor, free) {
  const { col, row } = ANCHORS[anchor];
  if (free.x > 0) return anchorAt(col, 1);
  if (free.y > 0) return anchorAt(1, row);
  return "center";
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function applyAnchor() {
  if (!state.image) return;
  state.crop = computeCropBox(anchorPref, state.width, state.height, ratioPref);
  updateOverlay();
  scheduleSizeEstimate();
}

function updateOverlay() {
  if (!state.crop) return;
  const { x, y, w, h } = state.crop;

  cropOverlay.style.left = `${(x / state.width) * 100}%`;
  cropOverlay.style.top = `${(y / state.height) * 100}%`;
  cropOverlay.style.width = `${(w / state.width) * 100}%`;
  cropOverlay.style.height = `${(h / state.height) * 100}%`;

  updateOutputInfo();
  updateAnchorUI();
}

function updateAnchorUI() {
  const { manual } = state;
  const free = freeSpace();
  const nothingToCrop = free.x === 0 && free.y === 0;
  const current = effectiveAnchor(anchorPref, free);

  anchorButtons.forEach((btn) => {
    const name = btn.dataset.anchor;
    const pressed = !manual && name === anchorPref;
    btn.setAttribute("aria-pressed", String(pressed));
    btn.classList.toggle(
      "is-equivalent",
      !manual && !pressed && !nothingToCrop && effectiveAnchor(name, free) === current
    );
    btn.disabled = nothingToCrop;
  });

  // Точка показывает фактическое положение рамки, когда ни один якорь не подходит.
  anchorMarker.hidden = !manual;
  if (manual) {
    const { crop } = state;
    anchorMarker.style.setProperty("--fx", free.x ? crop.x / free.x : 0.5);
    anchorMarker.style.setProperty("--fy", free.y ? crop.y / free.y : 0.5);
  }

  let caption;
  if (nothingToCrop) {
    caption = "Изображение уже нужных пропорций — обрезать нечего";
  } else if (manual) {
    caption = "Вручную";
  } else if (current === anchorPref) {
    caption = ANCHORS[anchorPref].label;
  } else {
    caption = `${ANCHORS[anchorPref].label} — для этого изображения как «${ANCHORS[current].label}»`;
  }
  // Подпись — aria-live: трогаем её, только когда текст правда изменился,
  // а не на каждое движение рамки.
  if (anchorCaption.textContent !== caption) anchorCaption.textContent = caption;
}

// Подсказка под списком и поля «Свои»: отражают выбранный пункт списка.
function updateRatioUI() {
  const custom = ratioSelect.value === "custom";
  ratioCustom.hidden = !custom;
  const hint = custom ? RATIO_CUSTOM_HINT : ratioSelect.selectedOptions[0].dataset.hint;
  if (ratioHint.textContent !== hint) ratioHint.textContent = hint;
}

// Новые пропорции делают прежнюю позицию рамки бессмысленной —
// ставим рамку по выбранному якорю.
function applyRatio(ratio) {
  ratioPref = ratio;
  state.manual = false;
  applyAnchor();
}

ratioSelect.addEventListener("change", () => {
  updateRatioUI();
  if (ratioSelect.value === "custom") {
    // Поля стартуют с текущих пропорций, чтобы их можно было подправить.
    [ratioW.value, ratioH.value] = ratioPref;
  } else {
    applyRatio(ratioSelect.value.split(":").map(Number));
  }
});

// Корректность (целые 1…9999) проверяет сам браузер по атрибутам полей; пока
// в них не два корректных числа, прежние пропорции остаются в силе.
ratioCustom.addEventListener("input", () => {
  if (ratioW.checkValidity() && ratioH.checkValidity()) {
    applyRatio([ratioW.valueAsNumber, ratioH.valueAsNumber]);
  }
});

// Браузер мог восстановить выбор в списке после перезагрузки — возвращаем
// его в согласие с ratioPref.
ratioSelect.value = "1:1";
updateRatioUI();

anchorButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    anchorPref = btn.dataset.anchor;
    state.manual = false;
    applyAnchor();
  });
});

// Берём ближайшую позицию якоря, а не первую попавшую в допуск: у почти
// квадратной картинки окна допуска соседних позиций перекрываются.
function snapToAnchor(value, free, tolerance) {
  let nearest = value;
  let best = Infinity;
  for (let index = 0; index <= 2; index++) {
    const target = axisOffset(index, free);
    const distance = Math.abs(value - target);
    if (distance < best) {
      best = distance;
      nearest = target;
    }
  }
  return best <= tolerance ? nearest : value;
}

// После ручного сдвига: если рамка стоит на позиции якоря, выбираем его,
// иначе — режим «Вручную». У якоря меняется только подвижная ось, вторая
// сохраняется: «сверху слева», дотащенное до правого края, станет «сверху справа».
function syncAnchorWithCrop() {
  const { crop } = state;
  const { col, row } = ANCHORS[anchorPref];
  const free = freeSpace();
  const horizontal = free.x > 0;
  const pos = horizontal ? crop.x : crop.y;
  const size = horizontal ? free.x : free.y;
  const index = [0, 1, 2].find((i) => axisOffset(i, size) === pos);

  state.manual = index === undefined;
  if (!state.manual) anchorPref = horizontal ? anchorAt(index, row) : anchorAt(col, index);
}

// Ручное перемещение рамки по превью. Координаты указателя переводятся
// в пиксели исходного изображения через масштаб отображаемого превью.
previewFrame.addEventListener("pointerdown", (e) => {
  if (!state.crop || e.button !== 0) return;
  e.preventDefault();
  drag = {
    pointerId: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    startCrop: { ...state.crop },
    scale: state.width / previewImg.getBoundingClientRect().width,
  };
  previewFrame.setPointerCapture(e.pointerId);
  previewFrame.classList.add("preview-frame--dragging");
});

previewFrame.addEventListener("pointermove", (e) => {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const { startCrop, scale } = drag;
  const { x: freeX, y: freeY } = freeSpace();
  const tolerance = SNAP_PX * scale;
  const x = snapToAnchor(clamp(Math.round(startCrop.x + (e.clientX - drag.startX) * scale), 0, freeX), freeX, tolerance);
  const y = snapToAnchor(clamp(Math.round(startCrop.y + (e.clientY - drag.startY) * scale), 0, freeY), freeY, tolerance);
  if (x === state.crop.x && y === state.crop.y) return;

  if (!drag.moved) {
    drag.moved = true;
    invalidateSizeEstimate();
  }
  state.crop = { x, y, w: startCrop.w, h: startCrop.h };
  syncAnchorWithCrop();
  updateOverlay();
});

function endDrag(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const { moved } = drag;
  drag = null;
  previewFrame.classList.remove("preview-frame--dragging");
  if (moved) scheduleSizeEstimate();
}

previewFrame.addEventListener("pointerup", endDrag);
previewFrame.addEventListener("pointercancel", endDrag);

function updateFormatNote(mimeType) {
  if (LOSSLESS_TYPES.has(mimeType)) {
    formatNote.hidden = true;
    return;
  }

  if (mimeType === "image/jpeg") {
    formatNote.textContent =
      "JPEG в браузере невозможно обрезать совсем без перекодирования — при сохранении файл будет пережат заново с максимальным качеством (потери минимальны, но не гарантированно нулевые).";
  } else if (mimeType === "image/webp") {
    formatNote.textContent =
      "WebP при обрезке в браузере перекодируется заново с максимальным качеством (потери минимальны, но не гарантированно нулевые).";
  } else if (CANVAS_EXPORTABLE_TYPES.has(mimeType)) {
    formatNote.textContent = "Изображение будет пересохранено без потерь.";
    formatNote.hidden = true;
    return;
  } else {
    formatNote.textContent = `Формат «${mimeType || "неизвестен"}» браузер не умеет сохранять напрямую — результат будет сохранён как PNG (без потерь).`;
  }

  formatNote.hidden = false;
}

function pickExportType(mimeType) {
  if (CANVAS_EXPORTABLE_TYPES.has(mimeType)) return mimeType;
  return "image/png";
}

function extensionFor(mimeType) {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    default:
      return "png";
  }
}

function baseNameOf(fileName) {
  const idx = fileName.lastIndexOf(".");
  return idx > 0 ? fileName.slice(0, idx) : fileName;
}

// «square» для 1:1 (как раньше), иначе «16x9», «21x9» и т. д. — как выбрано,
// без сокращения (21:9 не должно превращаться в 7:3).
function ratioSlug() {
  return ratioPref[0] === ratioPref[1] ? "square" : ratioPref.join("x");
}

function outputFileName() {
  const exportType = pickExportType(state.file.type);
  const suffix = state.manual ? "custom" : effectiveAnchor(anchorPref, freeSpace());
  return `${baseNameOf(state.file.name)}_${ratioSlug()}_${suffix}.${extensionFor(exportType)}`;
}

// Кодирует текущую область обрезки в файл. Используется и для скачивания,
// и для оценки веса результата в панели информации.
function renderCropBlob() {
  const { x, y, w, h } = state.crop;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(state.image, x, y, w, h, 0, 0, w, h);

  const exportType = pickExportType(state.file.type);
  const quality = exportType === "image/png" ? undefined : 1.0;

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob вернул null"))),
      exportType,
      quality
    );
  });
}

confirmBtn.addEventListener("click", () => {
  if (!state.crop) return;

  const fileName = outputFileName();
  renderCropBlob().then(
    (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    () => alert("Не удалось создать файл изображения.")
  );
});

function setInfo(key, text) {
  infoEls[key].textContent = text;
}

function formatLabel(mimeType) {
  return FORMAT_LABELS[mimeType] || mimeType || "неизвестен";
}

function formatNumber(value) {
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${formatNumber(bytes / 1024)} КБ`;
  return `${formatNumber(bytes / (1024 * 1024))} МБ`;
}

function formatDimensions(w, h) {
  const megapixels = (w * h) / 1e6;
  // У маленьких картинок мегапиксели округлились бы до «0 Мп» — не показываем.
  return megapixels < 0.1 ? `${w} × ${h} px` : `${w} × ${h} px (${formatNumber(megapixels)} Мп)`;
}

function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}

function formatAspect(w, h) {
  const g = gcd(w, h);
  if (w / g <= 50 && h / g <= 50) return `${w / g}:${h / g}`;
  return w >= h ? `${formatNumber(w / h)}:1` : `1:${formatNumber(h / w)}`;
}

// Пропорции результата: заданные, а если из-за округления до пикселей
// рамка чуть отличается от них — с «≈».
function ratioLabel(w, h) {
  const [rw, rh] = ratioPref;
  const label = ratioPref.join(":");
  return w * rh === h * rw ? label : `≈ ${label}`;
}

function updateSourceInfo() {
  const { file, width, height } = state;
  setInfo("src-name", file.name);
  setInfo("src-format", formatLabel(file.type));
  setInfo("src-dimensions", formatDimensions(width, height));
  setInfo("src-aspect", formatAspect(width, height));
  setInfo("src-bytes", formatBytes(file.size));
  setInfo(
    "src-modified",
    new Date(file.lastModified).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" })
  );
}

function updateOutputInfo() {
  const { file, width, height } = state;
  const { x, y, w, h } = state.crop;
  const free = freeSpace();
  const exportType = pickExportType(file.type);

  let mode;
  if (!LOSSLESS_TYPES.has(exportType)) {
    mode = "перекодирование, качество 100%";
  } else if (exportType !== file.type) {
    mode = `без потерь, конвертация из ${formatLabel(file.type)}`;
  } else {
    mode = "без потерь";
  }

  let trim;
  if (free.x > 0) {
    trim = `слева ${x} px, справа ${free.x - x} px`;
  } else if (free.y > 0) {
    trim = `сверху ${y} px, снизу ${free.y - y} px`;
  } else {
    trim = "ничего";
  }

  setInfo("out-name", outputFileName());
  setInfo("out-format", `${formatLabel(exportType)}, ${mode}`);
  setInfo("out-dimensions", formatDimensions(w, h));
  setInfo("out-aspect", ratioLabel(w, h));
  setInfo("out-position", `x = ${x}, y = ${y}`);
  setInfo("out-trim", trim);
  setInfo("out-area", `${formatNumber(((w * h) / (width * height)) * 100)} % исходной`);
}

function invalidateSizeEstimate() {
  clearTimeout(sizeTimer);
  sizeSeq++;
  setInfo("out-bytes", "вычисляется…");
}

// Реальный вес результата известен только после кодирования, поэтому
// кодируем обрезку с задержкой, когда рамка перестала двигаться.
function scheduleSizeEstimate() {
  invalidateSizeEstimate();
  const seq = sizeSeq;
  sizeTimer = setTimeout(() => {
    renderCropBlob().then(
      (blob) => {
        if (seq === sizeSeq) setInfo("out-bytes", formatBytes(blob.size));
      },
      () => {
        if (seq === sizeSeq) setInfo("out-bytes", "не удалось вычислить");
      }
    );
  }, 300);
}

resetBtn.addEventListener("click", resetState);

function readStoredTheme() {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : "auto";
  } catch {
    return "auto";
  }
}

function saveTheme(theme) {
  try {
    if (theme === "auto") {
      localStorage.removeItem(THEME_KEY);
    } else {
      localStorage.setItem(THEME_KEY, theme);
    }
  } catch {
    // Хранилище недоступно (приватный режим и т. п.) — тема просто не запомнится.
  }
}

function applyTheme(theme) {
  if (theme === "auto") {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = theme;
  }
  themeButtons.forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.themeValue === theme));
  });
  // В «Авто» каждая meta отвечает за свою схему (по атрибуту media),
  // при ручном выборе обе получают цвет выбранной темы.
  themeColorMetas.forEach((meta) => {
    const metaScheme = meta.media.includes("dark") ? "dark" : "light";
    meta.content = THEME_COLORS[theme === "auto" ? metaScheme : theme];
  });
}

themeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const theme = btn.dataset.themeValue;
    applyTheme(theme);
    saveTheme(theme);
  });
});

applyTheme(readStoredTheme());

// --- Меню сервисов в шапке ---
// Открытие/закрытие и клавиатуру даёт нативный <details>; дополняем
// закрытием по клику снаружи и по Escape.

const serviceMenu = document.querySelector(".service-menu");

document.addEventListener("click", (e) => {
  if (serviceMenu.open && !serviceMenu.contains(e.target)) {
    serviceMenu.open = false;
  }
});

serviceMenu.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && serviceMenu.open) {
    serviceMenu.open = false;
    serviceMenu.querySelector("summary").focus();
  }
});

// --- PWA ---

if ("serviceWorker" in navigator) {
  // На file:// регистрация не пройдёт — страница просто работает без офлайна.
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

// Картинка, открытая через «Открыть с помощью» в установленном приложении.
if ("launchQueue" in window) {
  window.launchQueue.setConsumer(async ({ files }) => {
    if (files && files.length) loadFile(await files[0].getFile());
  });
}

// Картинка из «Поделиться»: sw.js принял POST и перенаправил сюда,
// а сам файл держит в памяти — забираем его сообщением.
if (new URLSearchParams(location.search).has("share-target")) {
  history.replaceState(null, "", "./");
  receiveSharedFile();
}

async function receiveSharedFile() {
  if (!("serviceWorker" in navigator)) return;
  await navigator.serviceWorker.ready;
  const worker = navigator.serviceWorker.controller;
  if (!worker) return;

  const channel = new MessageChannel();
  channel.port1.onmessage = (e) => {
    if (e.data instanceof File) loadFile(e.data);
  };
  worker.postMessage({ type: "get-shared-file" }, [channel.port2]);
}
