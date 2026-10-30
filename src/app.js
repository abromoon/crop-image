"use strict";

const startScreen = document.getElementById("start");
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");
const browseBtn = document.getElementById("browse-btn");

const editor = document.getElementById("editor");
const previewFrame = document.getElementById("preview-frame");
const previewImg = document.getElementById("preview-img");
const cropOverlay = document.getElementById("crop-overlay");
const startTitle = document.getElementById("start-title");
const startSubtitle = document.getElementById("start-subtitle");
const ratioTool = document.getElementById("ratio-tool");
const ratioSelect = document.getElementById("ratio-select");
const ratioCustom = document.getElementById("ratio-custom");
const ratioW = document.getElementById("ratio-w");
const ratioH = document.getElementById("ratio-h");
const ratioHint = document.getElementById("ratio-hint");
const presetTool = document.getElementById("preset-tool");
const presetButtons = document.querySelectorAll("[data-preset]");
const anchorTool = document.getElementById("anchor-tool");
const avatarTool = document.getElementById("avatar-tool");
const avatarSize = document.getElementById("avatar-size");
const avatarHint = document.getElementById("avatar-hint");
const avatarPreview = document.getElementById("avatar-preview");
const logoTool = document.getElementById("logo-tool");
const logoCaption = document.getElementById("logo-caption");
const trimBtn = document.getElementById("trim-btn");
const fullBtn = document.getElementById("full-btn");
const targetInfo = document.getElementById("target-info");
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
// Steam гарантированно принимает PNG и JPEG; WebP не рискуем — он уходит в PNG.
const STEAM_EXPORTABLE_TYPES = new Set(["image/png", "image/jpeg"]);
// Логотип — только PNG: у него прозрачный фон.
const ALPHA_EXPORTABLE_TYPES = new Set(["image/png"]);

// Сервисы из меню в шапке. Выбираются hash'ем (#ratio, #steam, #avatar) в одном
// документе: sw.js отдаёт index.html на любую навигацию, а смена hash не
// перезагружает страницу — открытая картинка переживает переключение.
// Пустой или неизвестный hash (в том числе старый #square) — первый сервис.
const SERVICES = {
  ratio: {
    label: "Обрезка по пропорциям",
    title: "Обрезка по пропорциям — SNIP",
    heading: "Обрезка изображения по пропорциям",
    subtitle:
      "Перетащите изображение, выберите пропорции (квадрат, форматы обоев рабочего стола или свои), якорь или передвиньте рамку на превью и сохраните результат.",
  },
  steam: {
    label: "Обложки Steam",
    title: "Обложки для Steam — SNIP",
    heading: "Обложки для библиотеки Steam",
    subtitle:
      "Перетащите изображение и выберите, что из него сделать: основное изображение, фон, логотип или широкое изображение. Пропорции подбираются сами, пиксели не масштабируются.",
  },
  avatar: {
    label: "Аватары",
    title: "Аватары — SNIP",
    heading: "Обрезка аватара",
    subtitle:
      "Перетащите изображение: рамка всегда квадратная. Задайте её размер в пикселях или потяните за угол, выберите якорь или передвиньте рамку — рядом сразу видно, как аватар будет выглядеть в разных размерах и скруглениях. Пиксели не масштабируются.",
  },
};

// Пресеты Steam. ratio — пропорции рамки максимального размера (null —
// свободная рамка с ручками), target — рекомендуемый размер Steam, только
// для справки: результат не масштабируется. Пресет сервиса «по пропорциям»
// собирает currentPreset() из выбранных пользователем пропорций.
const STEAM_PRESETS = {
  "steam-capsule": { ratio: [600, 900], suffix: "steam_capsule", target: [600, 900], exportTypes: STEAM_EXPORTABLE_TYPES },
  "steam-hero": { ratio: [3840, 1240], suffix: "steam_hero", target: [3840, 1240], exportTypes: STEAM_EXPORTABLE_TYPES },
  "steam-logo": { ratio: null, suffix: "steam_logo", target: [1280, 720], exportTypes: ALPHA_EXPORTABLE_TYPES, resize: "free" },
  "steam-wide": { ratio: [920, 430], suffix: "steam_wide", target: [920, 430], exportTypes: STEAM_EXPORTABLE_TYPES },
};

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
// Минимальная сторона свободной рамки в экранных px — чтобы её можно было
// ухватить обратно.
const MIN_FRAME_PX = 24;

let state = {
  file: null,
  objectUrl: null,
  image: null, // HTMLImageElement, уже загружен
  width: 0,
  height: 0,
  crop: null, // { x, y, w, h } в пикселях исходного изображения
  manual: false, // рамку сдвинули вручную и она не стоит на позиции якоря
  opaque: null, // границы непрозрачных пикселей { x, y, w, h }, считаются лениво
};

// Текущий сервис (по hash), выбранные якорь, пропорции и тип изображения
// Steam. Живут вне state, чтобы пережить «Другое», и только в памяти —
// в localStorage не пишутся.
let service = "ratio";
let anchorPref = "center";
let ratioPref = [1, 1]; // [ширина, высота]
let presetPref = "steam-capsule";
// Сторона квадратной рамки аватара в px исходника; null — максимальная.
// Меняется только ресайзом (поле размера, угол рамки), перемещение её не трогает.
let avatarSide = null;

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
  state = { file: null, objectUrl: null, image: null, width: 0, height: 0, crop: null, manual: false, opaque: null };
  avatarPreview.style.removeProperty("--av-img");
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
    state.opaque = null;
    avatarSide = null;

    previewImg.src = objectUrl;
    avatarPreview.style.setProperty("--av-img", `url("${objectUrl}")`);

    updateSourceInfo();
    applyPreset();

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

// Пресет текущего сервиса. У «по пропорциям» он собирается из выбранных
// пропорций (userRatio — их же показываем в инфо как заданные).
function currentPreset() {
  if (service === "steam") return STEAM_PRESETS[presetPref];
  // resize: "square" — рамка 1:1 любого размера, тянется за углы; имя файла
  // без якоря, зато с размером (рамка не максимальная, якорь не всё решает).
  if (service === "avatar") {
    const side = state.crop ? state.crop.w : 0;
    return { ratio: [1, 1], suffix: `avatar_${side}`, exportTypes: CANVAS_EXPORTABLE_TYPES, resize: "square", noAnchorSuffix: true };
  }
  return { ratio: ratioPref, suffix: ratioSlug(), exportTypes: CANVAS_EXPORTABLE_TYPES, userRatio: true };
}

// Рамка пропорций [rw, rh] максимального размера, вписанная в w×h.
// Целые пиксели, поэтому пропорции могут отличаться от заданных на полпикселя.
function fitRatio([rw, rh], w, h) {
  if (w * rh >= h * rw) {
    return { w: Math.max(1, Math.round((h * rw) / rh)), h };
  }
  return { w, h: Math.max(1, Math.round((w * rh) / rw)) };
}

// side — сторона квадрата (аватар); без неё рамка максимального размера.
function computeCropBox(anchor, w, h, ratio, side = null) {
  const size = side ? { w: clamp(side, 1, Math.min(w, h)), h: clamp(side, 1, Math.min(w, h)) } : fitRatio(ratio, w, h);
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

// Границы непрозрачных пикселей — стартовая рамка логотипа. Пиксели читаются
// только в памяти. Ищем с краёв внутрь, так что у непрозрачной картинки
// проверка заканчивается на первом пикселе.
function opaqueBounds() {
  if (state.opaque) return state.opaque;
  const { width: w, height: h } = state;
  let bounds = { x: 0, y: 0, w, h };

  // У JPEG альфы не бывает — незачем читать пиксели.
  if (state.file.type !== "image/jpeg") {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(state.image, 0, 0);
      const data = ctx.getImageData(0, 0, w, h).data;
      const alphaAt = (x, y) => data[(y * w + x) * 4 + 3];
      const rowHasPixels = (y) => {
        for (let x = 0; x < w; x++) if (alphaAt(x, y)) return true;
        return false;
      };
      const colHasPixels = (x, top, bottom) => {
        for (let y = top; y <= bottom; y++) if (alphaAt(x, y)) return true;
        return false;
      };

      let top = 0;
      while (top < h && !rowHasPixels(top)) top++;
      // Полностью прозрачная картинка — оставляем всё изображение.
      if (top < h) {
        let bottom = h - 1;
        while (!rowHasPixels(bottom)) bottom--;
        let left = 0;
        while (!colHasPixels(left, top, bottom)) left++;
        let right = w - 1;
        while (!colHasPixels(right, top, bottom)) right--;
        bounds = { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
      }
    } catch {
      // Слишком большой холст или чтение пикселей недоступно — берём всё.
    }
  }

  state.opaque = bounds;
  return bounds;
}

function sameBox(a, b) {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

// Пересчитывает рамку под текущий пресет: максимальная рамка по якорю
// или, у логотипа, границы непрозрачной части.
function applyPreset() {
  updateToolsUI();
  if (!state.image) return;
  const preset = currentPreset();
  state.manual = false;
  state.crop = preset.ratio
    ? computeCropBox(anchorPref, state.width, state.height, preset.ratio, service === "avatar" ? avatarSide : null)
    : { ...opaqueBounds() };
  updateFormatNote();
  updateOverlay();
  scheduleSizeEstimate();
}

function setCrop(crop) {
  state.crop = crop;
  updateOverlay();
  scheduleSizeEstimate();
}

function updateToolsUI() {
  const preset = currentPreset();
  ratioTool.hidden = service !== "ratio";
  presetTool.hidden = service !== "steam";
  avatarTool.hidden = service !== "avatar";
  avatarPreview.hidden = service !== "avatar";
  presetButtons.forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.preset === presetPref));
  });
  anchorTool.hidden = !preset.ratio;
  logoTool.hidden = Boolean(preset.ratio);
  cropOverlay.classList.toggle("crop-overlay--resizable", Boolean(preset.resize));
  cropOverlay.classList.toggle("crop-overlay--square", preset.resize === "square");
  targetInfo.hidden = !preset.target;
}

function updateOverlay() {
  if (!state.crop) return;
  const { x, y, w, h } = state.crop;

  cropOverlay.style.left = `${(x / state.width) * 100}%`;
  cropOverlay.style.top = `${(y / state.height) * 100}%`;
  cropOverlay.style.width = `${(w / state.width) * 100}%`;
  cropOverlay.style.height = `${(h / state.height) * 100}%`;

  updateOutputInfo();
  if (service === "avatar") updateAvatarUI();
  if (currentPreset().ratio) {
    updateAnchorUI();
  } else {
    updateLogoUI();
  }
}

function updateAnchorUI() {
  const { manual } = state;
  const free = freeSpace();
  const nothingToCrop = free.x === 0 && free.y === 0;
  // У аватара рамка может быть меньше максимума и свободны обе оси, так что
  // «эквивалентных» якорей нет — нажата клетка, на позиции которой стоит рамка.
  const avatar = service === "avatar";
  const current = avatar ? anchorPref : effectiveAnchor(anchorPref, free);

  anchorButtons.forEach((btn) => {
    const name = btn.dataset.anchor;
    const pressed = !manual && name === anchorPref;
    btn.setAttribute("aria-pressed", String(pressed));
    btn.classList.toggle(
      "is-equivalent",
      !avatar && !manual && !pressed && !nothingToCrop && effectiveAnchor(name, free) === current
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
    caption = avatar
      ? "Рамка занимает всё изображение — уменьшите её, чтобы выбрать якорь"
      : "Изображение уже нужных пропорций — обрезать нечего";
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

function updateLogoUI() {
  const full = { x: 0, y: 0, w: state.width, h: state.height };
  const opaque = opaqueBounds();
  const hasMargins = !sameBox(opaque, full);
  trimBtn.disabled = !hasMargins;

  let caption;
  if (hasMargins && sameBox(state.crop, opaque)) {
    caption = "По границам логотипа — прозрачные поля отрезаны";
  } else if (sameBox(state.crop, full)) {
    caption = hasMargins ? "Всё изображение" : "Всё изображение — прозрачных полей нет";
  } else {
    caption = "Вручную";
  }
  if (logoCaption.textContent !== caption) logoCaption.textContent = caption;
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
  applyPreset();
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

// Поле размера и превью аватара. Фон плиток — CSS поверх object URL: размеры
// и позиция в процентах от стороны плитки, так что они подходят любому размеру.
function updateAvatarUI() {
  const { crop, width, height } = state;
  const max = Math.min(width, height);
  avatarSize.max = max;
  if (document.activeElement !== avatarSize) avatarSize.value = crop.w;
  const hint = `Сторона квадрата в пикселях исходника, от 1 до ${max}. Рамку можно тянуть за углы и двигать на превью.`;
  if (avatarHint.textContent !== hint) avatarHint.textContent = hint;

  const place = (offset, total) => (total > crop.w ? (offset / (total - crop.w)) * 100 : 0);
  avatarPreview.style.setProperty("--av-w", `${(width / crop.w) * 100}%`);
  avatarPreview.style.setProperty("--av-h", `${(height / crop.w) * 100}%`);
  avatarPreview.style.setProperty("--av-x", `${place(crop.x, width)}%`);
  avatarPreview.style.setProperty("--av-y", `${place(crop.y, height)}%`);
}

// Размер меняется вокруг центра рамки, пока она помещается в изображение.
avatarSize.addEventListener("input", () => {
  if (!state.crop || !avatarSize.checkValidity()) return;
  const side = clamp(avatarSize.valueAsNumber, 1, Math.min(state.width, state.height));
  const { x, y, w } = state.crop;
  invalidateSizeEstimate();
  avatarSide = side;
  state.crop = {
    x: clamp(Math.round(x + (w - side) / 2), 0, state.width - side),
    y: clamp(Math.round(y + (w - side) / 2), 0, state.height - side),
    w: side,
    h: side,
  };
  syncAnchorWithCrop();
  updateOverlay();
  scheduleSizeEstimate();
});

// Уходя из поля, возвращаем в него фактическое значение (если ввели лишнее).
avatarSize.addEventListener("change", () => {
  if (state.crop) avatarSize.value = state.crop.w;
});

anchorButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    anchorPref = btn.dataset.anchor;
    applyPreset();
  });
});

presetButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    presetPref = btn.dataset.preset;
    applyPreset();
  });
});

trimBtn.addEventListener("click", () => setCrop({ ...opaqueBounds() }));
fullBtn.addEventListener("click", () => setCrop({ x: 0, y: 0, w: state.width, h: state.height }));

// Ближайшая из целевых позиций в пределах допуска, иначе само значение.
// Берём ближайшую, а не первую попавшую в допуск: у почти квадратной
// картинки окна допуска соседних позиций перекрываются.
function snapTo(value, targets, tolerance) {
  let nearest = value;
  let best = Infinity;
  for (const target of targets) {
    const distance = Math.abs(value - target);
    if (distance < best) {
      best = distance;
      nearest = target;
    }
  }
  return best <= tolerance ? nearest : value;
}

function snapToAnchor(value, free, tolerance) {
  return snapTo(value, [0, 1, 2].map((index) => axisOffset(index, free)), tolerance);
}


// После ручного сдвига: если рамка стоит на позиции якоря, выбираем его,
// иначе — режим «Вручную». У якоря меняется только подвижная ось, вторая
// сохраняется: «сверху слева», дотащенное до правого края, станет «сверху справа».
function syncAnchorWithCrop() {
  const { crop } = state;
  const { col, row } = ANCHORS[anchorPref];
  const free = freeSpace();

  if (service === "avatar") {
    // Свободны обе оси: якорь — только если рамка стоит ровно на позиции клетки.
    const found = Object.keys(ANCHORS).find(
      (name) =>
        axisOffset(ANCHORS[name].col, free.x) === crop.x && axisOffset(ANCHORS[name].row, free.y) === crop.y
    );
    state.manual = !found;
    if (found) anchorPref = found;
    return;
  }

  const horizontal = free.x > 0;
  const pos = horizontal ? crop.x : crop.y;
  const size = horizontal ? free.x : free.y;
  const index = [0, 1, 2].find((i) => axisOffset(i, size) === pos);

  state.manual = index === undefined;
  if (!state.manual) anchorPref = horizontal ? anchorAt(index, row) : anchorAt(col, index);
}

// Ручное перемещение рамки по превью и, у свободной рамки, изменение размера
// за ручки. Координаты указателя переводятся в пиксели исходного изображения
// через масштаб отображаемого превью.
previewFrame.addEventListener("pointerdown", (e) => {
  if (!state.crop || e.button !== 0) return;
  e.preventDefault();
  const resize = currentPreset().resize;
  let handle = resize ? e.target.closest("[data-handle]") : null;
  // У квадратной рамки работают только угловые ручки; за боковые рамка просто двигается.
  if (resize === "square" && handle && handle.dataset.handle.length !== 2) handle = null;
  drag = {
    pointerId: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    startCrop: { ...state.crop },
    scale: state.width / previewImg.getBoundingClientRect().width,
    edges: handle ? handle.dataset.handle : null, // например "nw" — двигаются верхний и левый края
    square: resize === "square",
  };
  previewFrame.setPointerCapture(e.pointerId);
  previewFrame.classList.add("preview-frame--dragging");
  // Пока тянем ручку, указатель захвачен рамкой — показываем курсор ручки.
  if (handle) previewFrame.style.cursor = getComputedStyle(handle).cursor;
});

function movedCrop(e) {
  const { startCrop, scale } = drag;
  const { x: freeX, y: freeY } = freeSpace();
  const tolerance = SNAP_PX * scale;
  const x = snapToAnchor(clamp(Math.round(startCrop.x + (e.clientX - drag.startX) * scale), 0, freeX), freeX, tolerance);
  const y = snapToAnchor(clamp(Math.round(startCrop.y + (e.clientY - drag.startY) * scale), 0, freeY), freeY, tolerance);
  return { x, y, w: startCrop.w, h: startCrop.h };
}

// Края свободной рамки двигаются независимо, не выходят за изображение
// и прилипают к краям изображения и границам непрозрачной части.
function resizedCrop(e) {
  const { startCrop, scale, edges } = drag;
  const { width: W, height: H } = state;
  const opaque = opaqueBounds();
  const tolerance = SNAP_PX * scale;
  const minW = Math.min(W, Math.max(1, Math.round(MIN_FRAME_PX * scale)));
  const minH = Math.min(H, Math.max(1, Math.round(MIN_FRAME_PX * scale)));
  const dx = (e.clientX - drag.startX) * scale;
  const dy = (e.clientY - drag.startY) * scale;

  let left = startCrop.x;
  let top = startCrop.y;
  let right = startCrop.x + startCrop.w;
  let bottom = startCrop.y + startCrop.h;
  if (edges.includes("w")) left = clamp(snapTo(Math.round(left + dx), [0, opaque.x], tolerance), 0, right - minW);
  if (edges.includes("e")) right = clamp(snapTo(Math.round(right + dx), [W, opaque.x + opaque.w], tolerance), left + minW, W);
  if (edges.includes("n")) top = clamp(snapTo(Math.round(top + dy), [0, opaque.y], tolerance), 0, bottom - minH);
  if (edges.includes("s")) bottom = clamp(snapTo(Math.round(bottom + dy), [H, opaque.y + opaque.h], tolerance), top + minH, H);
  return { x: left, y: top, w: right - left, h: bottom - top };
}

// Квадрат тянется за угол: противоположный угол неподвижен, сторона — среднее
// смещений по обеим осям. Не выходит за изображение и прилипает к максимуму.
function squareResizedCrop(e) {
  const { startCrop, scale, edges } = drag;
  const { width: W, height: H } = state;
  const sx = edges.includes("e") ? 1 : -1;
  const sy = edges.includes("s") ? 1 : -1;
  // Неподвижный угол.
  const fx = sx > 0 ? startCrop.x : startCrop.x + startCrop.w;
  const fy = sy > 0 ? startCrop.y : startCrop.y + startCrop.h;
  const limit = Math.min(sx > 0 ? W - fx : fx, sy > 0 ? H - fy : fy);
  const min = Math.min(limit, Math.max(1, Math.round(MIN_FRAME_PX * scale)));
  const dx = (e.clientX - drag.startX) * scale;
  const dy = (e.clientY - drag.startY) * scale;
  const wanted = Math.round((startCrop.w + sx * dx + startCrop.h + sy * dy) / 2);
  const side = clamp(snapTo(wanted, [limit], SNAP_PX * scale), min, limit);
  return { x: sx > 0 ? fx : fx - side, y: sy > 0 ? fy : fy - side, w: side, h: side };
}

previewFrame.addEventListener("pointermove", (e) => {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const crop = drag.edges ? (drag.square ? squareResizedCrop(e) : resizedCrop(e)) : movedCrop(e);
  if (sameBox(crop, state.crop)) return;

  if (!drag.moved) {
    drag.moved = true;
    invalidateSizeEstimate();
  }
  state.crop = crop;
  if (drag.square) avatarSide = crop.w;
  if (currentPreset().ratio) syncAnchorWithCrop();
  updateOverlay();
});

function endDrag(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const { moved } = drag;
  drag = null;
  previewFrame.classList.remove("preview-frame--dragging");
  previewFrame.style.cursor = "";
  if (moved) scheduleSizeEstimate();
}

previewFrame.addEventListener("pointerup", endDrag);
previewFrame.addEventListener("pointercancel", endDrag);

function updateFormatNote() {
  const mimeType = state.file.type;
  const exportType = pickExportType(mimeType);
  const isLogo = !currentPreset().ratio;

  if (exportType === mimeType) {
    if (mimeType === "image/jpeg") {
      formatNote.textContent =
        "JPEG в браузере невозможно обрезать совсем без перекодирования — при сохранении файл будет пережат заново с максимальным качеством (потери минимальны, но не гарантированно нулевые).";
    } else if (mimeType === "image/webp") {
      formatNote.textContent =
        "WebP при обрезке в браузере перекодируется заново с максимальным качеством (потери минимальны, но не гарантированно нулевые).";
    } else {
      formatNote.hidden = true;
      return;
    }
  } else if (isLogo && mimeType === "image/jpeg") {
    formatNote.textContent =
      "У JPEG нет прозрачности — логотип сохранится как PNG без потерь, но фон вокруг него останется непрозрачным.";
  } else if (isLogo && CANVAS_EXPORTABLE_TYPES.has(mimeType)) {
    // WebP → PNG у логотипа: без потерь и с прозрачностью, предупреждать не о чем.
    formatNote.hidden = true;
    return;
  } else if (CANVAS_EXPORTABLE_TYPES.has(mimeType)) {
    formatNote.textContent = `Steam надёжно принимает только PNG и JPEG — ${formatLabel(mimeType)} будет сохранён как PNG без потерь (файл может получиться больше исходного).`;
  } else {
    formatNote.textContent = `Формат «${mimeType || "неизвестен"}» браузер не умеет сохранять напрямую — результат будет сохранён как PNG (без потерь).`;
  }

  formatNote.hidden = false;
}

// Какие форматы сохраняются как есть, решает пресет; остальное — PNG.
// Меняя правила, обнови и updateFormatNote.
function pickExportType(mimeType) {
  return currentPreset().exportTypes.has(mimeType) ? mimeType : "image/png";
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
  const preset = currentPreset();
  const exportType = pickExportType(state.file.type);
  let suffix = preset.suffix;
  if (preset.ratio && !preset.noAnchorSuffix) suffix += `_${state.manual ? "custom" : effectiveAnchor(anchorPref, freeSpace())}`;
  return `${baseNameOf(state.file.name)}_${suffix}.${extensionFor(exportType)}`;
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

// Сравнение с рекомендуемым размером Steam — только справка: результат
// не масштабируется, Steam сам подгоняет картинку при показе.
function targetText(preset, w, h) {
  const [tw, th] = preset.target;
  if (!preset.ratio) {
    return w <= tw && h <= th
      ? `в пределах ${tw} × ${th}`
      : `больше ${tw} × ${th} — уменьшит сам`;
  }
  const recommended = `рекомендует ${tw} × ${th}`;
  if (w === tw) return `${recommended} — совпадает`;
  return w > tw ? `${recommended}; крупнее — уменьшит сам` : `${recommended}; мельче — растянет, может быть нерезко`;
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
  const preset = currentPreset();
  const exportType = pickExportType(file.type);

  let mode;
  if (!LOSSLESS_TYPES.has(exportType)) {
    mode = "перекодирование, качество 100%";
  } else if (exportType !== file.type) {
    mode = `без потерь, конвертация из ${formatLabel(file.type)}`;
  } else {
    mode = "без потерь";
  }

  const trimmed = [];
  if (w < width) trimmed.push(`слева ${x} px, справа ${width - w - x} px`);
  if (h < height) trimmed.push(`сверху ${y} px, снизу ${height - h - y} px`);

  setInfo("out-name", outputFileName());
  setInfo("out-format", `${formatLabel(exportType)}, ${mode}`);
  setInfo("out-dimensions", formatDimensions(w, h));
  setInfo("out-aspect", preset.userRatio ? ratioLabel(w, h) : formatAspect(w, h));
  if (preset.target) setInfo("out-target", targetText(preset, w, h));
  setInfo("out-position", `x = ${x}, y = ${y}`);
  setInfo("out-trim", trimmed.join("; ") || "ничего");
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
// закрытием по клику снаружи, по Escape и по выбору пункта.

const serviceMenu = document.querySelector(".service-menu");
const serviceSummary = serviceMenu.querySelector("summary");
const serviceLinks = serviceMenu.querySelectorAll("[data-service]");

function applyService() {
  const name = location.hash.slice(1);
  const next = Object.hasOwn(SERVICES, name) ? name : "ratio";
  if (next !== service) avatarSide = null;
  service = next;
  const config = SERVICES[service];

  document.title = config.title;
  startTitle.textContent = config.heading;
  startSubtitle.textContent = config.subtitle;

  serviceLinks.forEach((link) => {
    if (link.dataset.service !== service) {
      link.removeAttribute("aria-current");
      return;
    }
    link.setAttribute("aria-current", "page");
    serviceSummary
      .querySelector(".service-menu__icon")
      .replaceWith(link.querySelector(".service-menu__icon").cloneNode(true));
  });
  serviceSummary.querySelector(".service-menu__label").textContent = config.label;

  applyPreset();
}

window.addEventListener("hashchange", applyService);
applyService();

serviceLinks.forEach((link) => {
  link.addEventListener("click", () => {
    serviceMenu.open = false;
  });
});

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
