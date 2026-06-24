/* ============================================================
   CLOTHING MATCH — app.js  v2
   + Borrador de fondo (flood-fill en Canvas)
   + Persistencia del catálogo con localStorage
   ============================================================ */

// ——————————————————————————————————————————
// ESTADO GLOBAL
// ——————————————————————————————————————————
const state = {
  catalogItems: [],   // { id, src, name, category }
  placedItems:  [],   // { id, catalogId, src, name, x, y, w, h }
  currentFilter: 'all',
  nextId: 1,
};

// ——————————————————————————————————————————
// ELEMENTOS DEL DOM
// ——————————————————————————————————————————
const fileInput          = document.getElementById('fileInput');
const catalogGrid        = document.getElementById('catalogGrid');
const clothesLayer       = document.getElementById('clothesLayer');
const mannequinWrapper   = document.getElementById('mannequinWrapper');
const mannequinContainer = document.getElementById('mannequinContainer');
const dropOverlay        = document.getElementById('dropOverlay');
const outfitList         = document.getElementById('outfitList');
const itemCountEl        = document.getElementById('itemCount');
const uploadZone         = document.getElementById('uploadZone');
const nextCategoryEl     = document.getElementById('nextCategory');

// ============================================================
// ██████  PERSISTENCIA — localStorage
// ============================================================

const LS_KEY = 'clothingmatch_catalog_v2';

/** Guarda el catálogo completo en localStorage */
function saveCatalog() {
  try {
    // Guardamos solo los datos esenciales (src es base64, puede ser grande)
    const data = state.catalogItems.map(({ id, src, name, category }) =>
      ({ id, src, name, category })
    );
    localStorage.setItem(LS_KEY, JSON.stringify(data));
    // Actualizamos nextId para evitar colisiones
    localStorage.setItem(LS_KEY + '_nextId', String(state.nextId));
  } catch (e) {
    // Si el storage está lleno (muchas imágenes base64) avisamos
    if (e.name === 'QuotaExceededError') {
      showToast('⚠️ Almacenamiento lleno — elimina prendas antiguas');
    }
  }
}

/** Carga el catálogo guardado al iniciar */
function loadCatalog() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    state.catalogItems = data;
    state.nextId = parseInt(localStorage.getItem(LS_KEY + '_nextId') || '1', 10);
    renderCatalog();
    if (state.catalogItems.length > 0) {
      showToast(`Catálogo restaurado: ${state.catalogItems.length} prendas ✓`);
    }
  } catch (e) {
    console.warn('No se pudo restaurar el catálogo:', e);
  }
}

// ============================================================
// ██████  BORRADOR DE FONDO — Canvas Flood-Fill
// ============================================================

/**
 * Abre el modal de edición de fondo para un item del catálogo.
 * @param {object} item – item del catálogo
 */
function openBgRemover(item) {
  // Crear modal dinámicamente
  const modal = document.createElement('div');
  modal.id = 'bgModal';
  modal.innerHTML = `
    <div class="bgm-backdrop"></div>
    <div class="bgm-box">
      <div class="bgm-header">
        <h3>✂️ Borrar fondo</h3>
        <button class="bgm-close" id="bgmClose">✕</button>
      </div>
      <p class="bgm-hint">
        Haz clic sobre el color de fondo que quieres eliminar.<br/>
        Ajusta la tolerancia si elimina demasiado o muy poco.
      </p>
      <div class="bgm-controls">
        <label>Tolerancia:
          <input type="range" id="bgmTolerance" min="5" max="120" value="30" />
          <span id="bgmToleranceVal">30</span>
        </label>
        <button class="bgm-btn-reset" id="bgmReset">↩ Restaurar original</button>
      </div>
      <div class="bgm-canvas-wrap">
        <canvas id="bgmCanvas"></canvas>
        <p class="bgm-click-hint">👆 Haz clic en el fondo de la prenda</p>
      </div>
      <div class="bgm-footer">
        <button class="bgm-btn-cancel" id="bgmCancel">Cancelar</button>
        <button class="bgm-btn-apply" id="bgmApply">Aplicar y guardar ✓</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const canvas    = document.getElementById('bgmCanvas');
  const ctx       = canvas.getContext('2d');
  const tolSlider = document.getElementById('bgmTolerance');
  const tolVal    = document.getElementById('bgmToleranceVal');

  // Cargar imagen en canvas
  const img = new Image();
  img.onload = () => {
    // Escalar para que quepa en el modal (máx 420px)
    const maxW = 420, maxH = 380;
    let w = img.width, h = img.height;
    if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
    if (h > maxH) { w = Math.round(w * maxH / h); h = maxH; }
    canvas.width  = w;
    canvas.height = h;
    ctx.drawImage(img, 0, 0, w, h);
  };
  img.src = item.src;   // src puede ser la original o ya procesada

  // Guardar copia original para restaurar
  let originalSrc = item.src;

  // Actualizar label tolerancia
  tolSlider.addEventListener('input', () => {
    tolVal.textContent = tolSlider.value;
  });

  // Clic en el canvas → flood-fill
  canvas.addEventListener('click', (e) => {
    const rect  = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top)  * scaleY);
    const tolerance = parseInt(tolSlider.value, 10);
    removeBackground(canvas, ctx, x, y, tolerance);
  });

  // Restaurar imagen original
  document.getElementById('bgmReset').addEventListener('click', () => {
    const img2 = new Image();
    img2.onload = () => { ctx.drawImage(img2, 0, 0, canvas.width, canvas.height); };
    img2.src = originalSrc;
  });

  // Cerrar sin guardar
  const closeModal = () => document.body.removeChild(modal);
  document.getElementById('bgmClose').addEventListener('click', closeModal);
  document.getElementById('bgmCancel').addEventListener('click', closeModal);
  modal.querySelector('.bgm-backdrop').addEventListener('click', closeModal);

  // Aplicar → convertir canvas a base64 y actualizar el item
  document.getElementById('bgmApply').addEventListener('click', () => {
    const newSrc = canvas.toDataURL('image/png');
    item.src = newSrc;
    // Actualizar también cualquier prenda colocada de este item
    state.placedItems
      .filter(p => p.catalogId === item.id)
      .forEach(p => {
        p.src = newSrc;
        const el = clothesLayer.querySelector(`[data-id="${p.id}"] img`);
        if (el) el.src = newSrc;
      });
    saveCatalog();
    renderCatalog();
    closeModal();
    showToast('Fondo eliminado y guardado ✓');
  });
}

/**
 * Flood-fill que pone en transparente todos los píxeles del color clicado.
 */
function removeBackground(canvas, ctx, startX, startY, tolerance) {
  const w = canvas.width;
  const h = canvas.height;
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  const idx = (y, x) => (y * w + x) * 4;
  const target = idx(startY, startX);
  const tr = data[target], tg = data[target+1], tb = data[target+2];

  // Si el píxel ya es transparente, salir
  if (data[target+3] < 20) return;

  const colorMatch = (i) => {
    const dr = data[i]   - tr;
    const dg = data[i+1] - tg;
    const db = data[i+2] - tb;
    return Math.sqrt(dr*dr + dg*dg + db*db) <= tolerance;
  };

  // BFS flood-fill
  const visited = new Uint8Array(w * h);
  const queue = [[startX, startY]];
  visited[startY * w + startX] = 1;

  while (queue.length) {
    const [x, y] = queue.shift();
    const i = idx(y, x);
    // Volver transparente
    data[i+3] = 0;

    const neighbors = [[x-1,y],[x+1,y],[x,y-1],[x,y+1]];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (visited[ni]) continue;
      visited[ni] = 1;
      if (colorMatch(idx(ny, nx))) {
        queue.push([nx, ny]);
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

// ——————————————————————————————————————————
// ARRASTRE DESDE CATÁLOGO → MANIQUÍ
// ——————————————————————————————————————————
let draggingCatalogItem = null;

mannequinWrapper.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropOverlay.classList.add('active');
});

mannequinWrapper.addEventListener('dragleave', (e) => {
  if (!mannequinWrapper.contains(e.relatedTarget)) {
    dropOverlay.classList.remove('active');
  }
});

mannequinWrapper.addEventListener('drop', (e) => {
  e.preventDefault();
  dropOverlay.classList.remove('active');
  if (!draggingCatalogItem) return;
  const rect = mannequinContainer.getBoundingClientRect();
  const defaultW = 140, defaultH = 140;
  const x = e.clientX - rect.left - defaultW / 2;
  const y = e.clientY - rect.top  - defaultH / 2;
  placeClothe(draggingCatalogItem, x, y, defaultW, defaultH);
  draggingCatalogItem = null;
});

// ——————————————————————————————————————————
// SUBIR ARCHIVOS
// ——————————————————————————————————————————
fileInput.addEventListener('change', (e) => {
  handleFiles(e.target.files);
  fileInput.value = '';
});

uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadZone.classList.add('drag-over');
});
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  if (!draggingCatalogItem) handleFiles(e.dataTransfer.files);
});

function handleFiles(files) {
  Array.from(files).forEach(file => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const item = {
        id:       state.nextId++,
        src:      ev.target.result,
        name:     file.name.replace(/\.[^.]+$/, ''),
        category: nextCategoryEl.value,
      };
      state.catalogItems.push(item);
      saveCatalog();        // ← guardar al añadir
      renderCatalog();
      showToast(`"${item.name}" añadida al catálogo ✓`);
    };
    reader.readAsDataURL(file);
  });
}

// ——————————————————————————————————————————
// RENDERIZAR CATÁLOGO
// ——————————————————————————————————————————
function renderCatalog() {
  const filtered = state.currentFilter === 'all'
    ? state.catalogItems
    : state.catalogItems.filter(i => i.category === state.currentFilter);

  catalogGrid.innerHTML = '';

  if (filtered.length === 0) {
    const msg = document.createElement('p');
    msg.className = 'catalog-empty';
    msg.innerHTML = state.catalogItems.length === 0
      ? 'Tu catálogo está vacío.<br/>¡Sube tu primera prenda!'
      : 'No hay prendas en esta categoría.';
    catalogGrid.appendChild(msg);
    return;
  }

  filtered.forEach(item => {
    const card = document.createElement('div');
    card.className = 'catalog-item';
    card.draggable = true;
    card.dataset.id = item.id;

    card.innerHTML = `
      <img src="${item.src}" alt="${item.name}" />
      <span class="item-label">${categoryLabel(item.category)}</span>
      <button class="item-delete" title="Eliminar del catálogo">✕</button>
      <button class="item-rmbg" title="Borrar fondo">✂️</button>
    `;

    // Drag start
    card.addEventListener('dragstart', (e) => {
      draggingCatalogItem = item;
      document.body.classList.add('dragging-catalog');
      e.dataTransfer.effectAllowed = 'copy';
      const ghost = card.cloneNode(true);
      ghost.style.cssText = 'position:absolute;top:-999px;opacity:0.6;width:80px;pointer-events:none;';
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 40, 40);
      setTimeout(() => document.body.removeChild(ghost), 0);
    });

    card.addEventListener('dragend', () => {
      draggingCatalogItem = null;
      document.body.classList.remove('dragging-catalog');
      dropOverlay.classList.remove('active');
    });

    // Eliminar del catálogo
    card.querySelector('.item-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      state.catalogItems = state.catalogItems.filter(c => c.id !== item.id);
      saveCatalog();        // ← guardar al eliminar
      renderCatalog();
      showToast('Prenda eliminada del catálogo');
    });

    // Borrar fondo
    card.querySelector('.item-rmbg').addEventListener('click', (e) => {
      e.stopPropagation();
      openBgRemover(item);
    });

    catalogGrid.appendChild(card);
  });
}

function categoryLabel(cat) {
  return { top:'Top', bottom:'Abajo', shoes:'Calzado', acc:'Accesorio' }[cat] || cat;
}

// ——————————————————————————————————————————
// FILTRO DE CATEGORÍAS
// ——————————————————————————————————————————
document.querySelectorAll('.cat-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.currentFilter = btn.dataset.cat;
    renderCatalog();
  });
});

// ——————————————————————————————————————————
// COLOCAR PRENDA SOBRE EL MANIQUÍ
// ——————————————————————————————————————————
function placeClothe(catalogItem, x, y, w, h) {
  const placedItem = {
    id:        state.nextId++,
    catalogId: catalogItem.id,
    src:       catalogItem.src,
    name:      catalogItem.name,
    category:  catalogItem.category,
    x, y, w, h,
  };
  state.placedItems.push(placedItem);
  renderPlacedItem(placedItem);
  updateOutfitList();
  updateItemCount();
}

function renderPlacedItem(item) {
  const el = document.createElement('div');
  el.className = 'placed-item';
  el.dataset.id = item.id;
  el.style.cssText = `left:${item.x}px; top:${item.y}px; width:${item.w}px; height:${item.h}px;`;

  el.innerHTML = `
    <img src="${item.src}" alt="${item.name}" draggable="false" />
    <button class="remove-placed" title="Quitar prenda">✕</button>
    <div class="resize-handle"></div>
  `;

  makeDraggable(el, item);

  el.querySelector('.remove-placed').addEventListener('click', (e) => {
    e.stopPropagation();
    removePlacedItem(item.id);
  });

  makeResizable(el.querySelector('.resize-handle'), el, item);
  clothesLayer.appendChild(el);
}

// ——————————————————————————————————————————
// ARRASTRE DE PRENDAS YA COLOCADAS
// ——————————————————————————————————————————
function makeDraggable(el, item) {
  let startX, startY, startLeft, startTop, isDragging = false;

  el.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('remove-placed') ||
        e.target.classList.contains('resize-handle')) return;
    e.preventDefault();
    isDragging = true;
    startX = e.clientX; startY = e.clientY;
    startLeft = item.x; startTop = item.y;
    el.style.zIndex = 50;

    const onMove = (ev) => {
      if (!isDragging) return;
      item.x = startLeft + (ev.clientX - startX);
      item.y = startTop  + (ev.clientY - startY);
      el.style.left = item.x + 'px';
      el.style.top  = item.y + 'px';
    };
    const onUp = () => {
      isDragging = false;
      el.style.zIndex = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// ——————————————————————————————————————————
// REDIMENSIONAR PRENDAS
// ——————————————————————————————————————————
function makeResizable(handle, el, item) {
  handle.addEventListener('mousedown', (e) => {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX, startY = e.clientY;
    const startW = item.w,    startH = item.h;
    const onMove = (ev) => {
      item.w = Math.max(50, startW + (ev.clientX - startX));
      item.h = Math.max(50, startH + (ev.clientY - startY));
      el.style.width  = item.w + 'px';
      el.style.height = item.h + 'px';
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// ——————————————————————————————————————————
// ELIMINAR PRENDA DEL MANIQUÍ
// ——————————————————————————————————————————
function removePlacedItem(id) {
  state.placedItems = state.placedItems.filter(i => i.id !== id);
  const el = clothesLayer.querySelector(`[data-id="${id}"]`);
  if (el) el.remove();
  updateOutfitList();
  updateItemCount();
  showToast('Prenda retirada del look');
}

// ——————————————————————————————————————————
// LISTA DE PRENDAS EN EL LOOK
// ——————————————————————————————————————————
function updateOutfitList() {
  outfitList.innerHTML = '';
  if (state.placedItems.length === 0) {
    const li = document.createElement('li');
    li.className = 'outfit-empty';
    li.textContent = 'Sin prendas aún';
    outfitList.appendChild(li);
    return;
  }
  state.placedItems.forEach(item => {
    const li = document.createElement('li');
    li.className = 'outfit-list-item';
    li.innerHTML = `<img src="${item.src}" alt="${item.name}"/><span>${categoryLabel(item.category)}</span>`;
    outfitList.appendChild(li);
  });
}

function updateItemCount() {
  const n = state.placedItems.length;
  itemCountEl.textContent = n === 0 ? '0 prendas en el look'
    : n === 1 ? '1 prenda en el look' : `${n} prendas en el look`;
}

// ——————————————————————————————————————————
// CAMBIAR FONDO DEL MANIQUÍ
// ——————————————————————————————————————————
function setBg(swatch) {
  document.querySelectorAll('.bg-swatch').forEach(s => s.classList.remove('active'));
  swatch.classList.add('active');
  mannequinContainer.style.background = swatch.dataset.bg;
}

// ——————————————————————————————————————————
// LIMPIAR MANIQUÍ
// ——————————————————————————————————————————
function clearMannequin() {
  if (state.placedItems.length === 0) { showToast('El maniquí ya está vacío'); return; }
  state.placedItems = [];
  clothesLayer.innerHTML = '';
  updateOutfitList();
  updateItemCount();
  showToast('Look limpiado ✓');
}

// ——————————————————————————————————————————
// DESHACER ÚLTIMA PRENDA
// ——————————————————————————————————————————
function undoLast() {
  if (state.placedItems.length === 0) { showToast('No hay prendas que deshacer'); return; }
  const last = state.placedItems[state.placedItems.length - 1];
  removePlacedItem(last.id);
  showToast('Última prenda deshecha');
}

// ——————————————————————————————————————————
// GUARDAR LOOK
// ——————————————————————————————————————————
function saveOutfit() {
  if (state.placedItems.length === 0) { showToast('Añade al menos una prenda al look'); return; }
  showToast('Generando imagen...');
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
  script.onload = () => {
    html2canvas(mannequinContainer, { useCORS: true, scale: 2, backgroundColor: null })
      .then(canvas => {
        const link = document.createElement('a');
        link.download = `clothing-match-look-${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        showToast('¡Look guardado! 🎉');
      })
      .catch(() => showToast('Error al guardar. Intenta de nuevo.'));
  };
  script.onerror = () => showToast('Sin conexión para guardar.');
  if (!window.html2canvas) document.head.appendChild(script);
  else script.onload();
}

// ——————————————————————————————————————————
// TOAST
// ——————————————————————————————————————————
let toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

// ——————————————————————————————————————————
// INIT
// ——————————————————————————————————————————
loadCatalog();   // ← restaurar catálogo guardado
updateItemCount();
