/* ============================================================
   CLOTHING MATCH — app.js
   Funciones: subir fotos, arrastrar al maniquí, reposicionar,
   eliminar, cambiar fondo, guardar look como imagen.
   ============================================================ */

// ——————————————————————————————————————————
// ESTADO GLOBAL
// ——————————————————————————————————————————
const state = {
  catalogItems: [],       // { id, src, name, category }
  placedItems: [],        // { id, catalogId, src, name, x, y, w, h }
  currentFilter: 'all',
  nextId: 1,
};

// ——————————————————————————————————————————
// ELEMENTOS DEL DOM
// ——————————————————————————————————————————
const fileInput        = document.getElementById('fileInput');
const catalogGrid      = document.getElementById('catalogGrid');
const catalogEmpty     = document.getElementById('catalogEmpty');
const clothesLayer     = document.getElementById('clothesLayer');
const mannequinWrapper = document.getElementById('mannequinWrapper');
const mannequinContainer = document.getElementById('mannequinContainer');
const dropOverlay      = document.getElementById('dropOverlay');
const outfitList       = document.getElementById('outfitList');
const itemCountEl      = document.getElementById('itemCount');
const uploadZone       = document.getElementById('uploadZone');
const nextCategoryEl   = document.getElementById('nextCategory');

// ——————————————————————————————————————————
// ARRASTRE DESDE CATÁLOGO → MANIQUÍ
// ——————————————————————————————————————————
let draggingCatalogItem = null;   // item del catálogo que se está arrastrando
let ghostEl = null;               // imagen fantasma durante arrastre

// Activa drop-overlay cuando algo entra al área del maniquí
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
  const defaultW = 140;
  const defaultH = 140;
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

// Drag-and-drop sobre la upload zone
uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadZone.classList.add('drag-over');
});
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  // Solo procesar si NO es un item del catálogo
  if (!draggingCatalogItem) {
    handleFiles(e.dataTransfer.files);
  }
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
    `;

    // Drag start → guarda referencia al item
    card.addEventListener('dragstart', (e) => {
      draggingCatalogItem = item;
      document.body.classList.add('dragging-catalog');
      e.dataTransfer.effectAllowed = 'copy';
      // Imagen fantasma semitransparente
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
      renderCatalog();
      showToast('Prenda eliminada del catálogo');
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

  // Mover la prenda ya colocada
  makeDraggable(el, item);

  // Eliminar del maniquí
  el.querySelector('.remove-placed').addEventListener('click', (e) => {
    e.stopPropagation();
    removePlacedItem(item.id);
  });

  // Redimensionar
  makeResizable(el.querySelector('.resize-handle'), el, item);

  clothesLayer.appendChild(el);
}

// ——————————————————————————————————————————
// ARRASTRE DE PRENDAS YA COLOCADAS
// ——————————————————————————————————————————
function makeDraggable(el, item) {
  let startX, startY, startLeft, startTop;
  let isDragging = false;

  el.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('remove-placed') ||
        e.target.classList.contains('resize-handle')) return;
    e.preventDefault();

    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startLeft = item.x;
    startTop  = item.y;
    el.style.zIndex = 50;
    el.style.transition = 'none';

    const onMove = (ev) => {
      if (!isDragging) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      item.x = startLeft + dx;
      item.y = startTop  + dy;
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
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;
    const startW = item.w;
    const startH = item.h;

    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      item.w = Math.max(50, startW + dx);
      item.h = Math.max(50, startH + dy);
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
// LISTA DE PRENDAS EN EL LOOK (panel derecho)
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
    li.innerHTML = `
      <img src="${item.src}" alt="${item.name}"/>
      <span>${categoryLabel(item.category)}</span>
    `;
    outfitList.appendChild(li);
  });
}

function updateItemCount() {
  const n = state.placedItems.length;
  itemCountEl.textContent = n === 0 ? '0 prendas en el look'
    : n === 1 ? '1 prenda en el look'
    : `${n} prendas en el look`;
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
// GUARDAR LOOK (html2canvas via CDN)
// ——————————————————————————————————————————
function saveOutfit() {
  if (state.placedItems.length === 0) {
    showToast('Añade al menos una prenda al look');
    return;
  }

  showToast('Generando imagen...');

  // Usamos html2canvas para capturar el área del maniquí
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
  script.onerror = () => showToast('Sin conexión para guardar. Revisa tu internet.');
  document.head.appendChild(script);
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
renderCatalog();
updateItemCount();
