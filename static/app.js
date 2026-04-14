/* ═══════════════════════════════════════════════════════════
   Marina di Lava — app.js
   ═══════════════════════════════════════════════════════════ */

// ── State ──────────────────────────────────────────────────
let currentView = "stock";
let allProducts = [];
let allSuppliers = [];
let allCocktails = [];
let stockSort = { col: null, dir: 1 };

// ── Init ───────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });
  loadAll();
});

async function loadAll() {
  [allProducts, allSuppliers, allCocktails] = await Promise.all([
    api("/api/produits"),
    api("/api/fournisseurs"),
    api("/api/recettes"),
  ]);
  updateAlertBadge();
  renderView(currentView);
}

function switchView(view) {
  currentView = view;
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  // close mobile nav after selection
  document.getElementById("main-nav")?.classList.remove("open");
  renderView(view);
}

function toggleNav() {
  document.getElementById("main-nav")?.classList.toggle("open");
}

function renderView(view) {
  const app = document.getElementById("app");
  switch (view) {
    case "stock":     renderStock(app); break;
    case "cocktails": renderCocktails(app); break;
    case "alerts":    renderAlerts(app); break;
    case "cashpad":   renderCashpad(app); break;
    case "delivery":  renderDelivery(app); break;
    case "inventory": renderInventory(app); break;
    case "history":   renderHistory(app); break;
    case "suppliers": renderSuppliers(app); break;
    case "mapping":   renderMapping(app); break;
  }
}

// ── API helper ─────────────────────────────────────────────
async function api(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    // err.detail peut être un tableau (erreurs de validation FastAPI) ou une string
    const msg = Array.isArray(err.detail)
      ? err.detail.map(e => e.msg || JSON.stringify(e)).join(", ")
      : (err.detail || res.statusText);
    throw new Error(msg);
  }
  return res.json();
}

// ── Alert badge ────────────────────────────────────────────
async function updateAlertBadge() {
  try {
    const alerts = await api("/api/alertes");
    const badge = document.getElementById("alert-badge");
    if (alerts.length > 0) {
      badge.textContent = alerts.length;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  } catch {}
}

// ── Modal helpers ──────────────────────────────────────────
function openModal(html) {
  document.getElementById("modal-content").innerHTML = html;
  document.getElementById("modal-overlay").classList.remove("hidden");
}
function closeModal() {
  document.getElementById("modal-overlay").classList.add("hidden");
}

// ── Marge pill ─────────────────────────────────────────────
function margePill(marge, color, estimated) {
  if (estimated) return `<span class="marge-pill marge-gray">~ estimé</span>`;
  if (marge === null || marge === undefined) return `<span class="marge-pill marge-gray">—</span>`;
  return `<span class="marge-pill marge-${color}">${marge.toFixed(1)}%</span>`;
}

function stockClass(stock, threshold) {
  if (stock === 0) return "stock-zero";
  if (stock <= threshold) return "stock-low";
  return "stock-ok";
}

// ══════════════════════════════════════════════════════════
// VIEW: STOCK
// ══════════════════════════════════════════════════════════
function renderStock(el) {
  const categories = [...new Set(allProducts.map(p => p.category))].sort();
  const supplierNames = [...new Set(allProducts.map(p => p.supplier_name).filter(Boolean))].sort();

  // Summary stats
  const withVal = allProducts.filter(p => p.valeur_stock !== null);
  const totalVal = withVal.reduce((s, p) => s + p.valeur_stock, 0);
  const ruptures = allProducts.filter(p => p.stock === 0).length;
  const stockBas = allProducts.filter(p => p.stock > 0 && p.stock <= p.alert_threshold).length;
  const margesOk = allProducts.filter(p => p.marge_color === "green").length;

  el.innerHTML = `
    <div class="section-header">
      <span class="section-title">Stock &amp; Marges</span>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-outline" onclick="exportStockCSV()">⬇ Export CSV</button>
        <button class="btn btn-primary" onclick="openProductForm(null)">+ Nouveau produit</button>
      </div>
    </div>
    <div class="stock-summary">
      <div class="summary-card">
        <div class="s-label">Valeur totale stock</div>
        <div class="s-value">€${totalVal.toFixed(0)}</div>
        <div class="s-sub">${withVal.length} produits valorisés</div>
      </div>
      <div class="summary-card">
        <div class="s-label">Produits</div>
        <div class="s-value">${allProducts.length}</div>
        <div class="s-sub">${allProducts.filter(p => p.stock > 0).length} en stock</div>
      </div>
      <div class="summary-card" style="${ruptures > 0 ? 'border-color:#E74C3C' : ''}">
        <div class="s-label">Ruptures</div>
        <div class="s-value" style="${ruptures > 0 ? 'color:#E74C3C' : ''}">${ruptures}</div>
        <div class="s-sub">${stockBas} stock bas</div>
      </div>
      <div class="summary-card">
        <div class="s-label">Marge ≥ 70%</div>
        <div class="s-value" style="color:#27500A">${margesOk}</div>
        <div class="s-sub">sur ${allProducts.filter(p => p.marge !== null).length} valorisés</div>
      </div>
    </div>
    <div class="filters">
      <select id="f-cat" onchange="filterStock()">
        <option value="">Toutes catégories</option>
        ${categories.map(c => `<option>${c}</option>`).join("")}
      </select>
      <select id="f-sup" onchange="filterStock()">
        <option value="">Tous fournisseurs</option>
        ${supplierNames.map(n => `<option>${n}</option>`).join("")}
      </select>
      <select id="f-marge" onchange="filterStock()">
        <option value="">Toutes marges</option>
        <option value="green">≥ 70%</option>
        <option value="orange">50–70%</option>
        <option value="red">&lt; 50%</option>
        <option value="gray">Non renseigné</option>
      </select>
      <select id="f-alert" onchange="filterStock()">
        <option value="">Tous stocks</option>
        <option value="zero">Rupture</option>
        <option value="low">Stock bas</option>
      </select>
      <input type="text" id="f-search" placeholder="Rechercher…" oninput="filterStock()"/>
    </div>
    <div class="table-wrap">
      <table id="stock-table">
        <thead>
          <tr>
            <th class="sortable" onclick="sortStock('name')">Produit</th>
            <th class="sortable" onclick="sortStock('category')">Catégorie</th>
            <th class="sortable" onclick="sortStock('stock')">Stock</th>
            <th class="sortable" onclick="sortStock('cout_unitaire')">Coût unit.</th>
            <th class="sortable" onclick="sortStock('sale_price_ttc')">PV TTC</th>
            <th class="sortable" onclick="sortStock('marge')">Marge HT</th>
            <th class="sortable" onclick="sortStock('valeur_stock')">Val. stock</th>
            <th class="sortable" onclick="sortStock('supplier_name')">Fournisseur</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="stock-tbody"></tbody>
      </table>
    </div>`;
  filterStock();
}

function sortStock(col) {
  if (stockSort.col === col) {
    stockSort.dir *= -1;
  } else {
    stockSort.col = col;
    stockSort.dir = 1;
  }
  // update header classes
  document.querySelectorAll("#stock-table th.sortable").forEach(th => {
    th.classList.remove("sort-asc", "sort-desc");
  });
  const cols = ["name","category","stock",null,"cout_unitaire","sale_price_ttc","marge","valeur_stock","supplier_name"];
  const idx = cols.indexOf(col);
  if (idx >= 0) {
    const ths = document.querySelectorAll("#stock-table th.sortable");
    const th = [...ths].find(t => t.getAttribute("onclick") === `sortStock('${col}')`);
    if (th) th.classList.add(stockSort.dir === 1 ? "sort-asc" : "sort-desc");
  }
  filterStock();
}

function exportStockCSV() {
  const cat    = document.getElementById("f-cat")?.value    || "";
  const sup    = document.getElementById("f-sup")?.value    || "";
  const marge  = document.getElementById("f-marge")?.value  || "";
  const alert  = document.getElementById("f-alert")?.value  || "";
  const search = (document.getElementById("f-search")?.value || "").toLowerCase();

  let rows = allProducts;
  if (cat)    rows = rows.filter(p => p.category === cat);
  if (sup)    rows = rows.filter(p => p.supplier_name === sup);
  if (marge)  rows = rows.filter(p => p.marge_color === marge);
  if (alert === "zero") rows = rows.filter(p => p.stock === 0);
  if (alert === "low")  rows = rows.filter(p => p.stock > 0 && p.stock <= p.alert_threshold);
  if (search) rows = rows.filter(p => p.name.toLowerCase().includes(search));

  const headers = ["Produit","Catégorie","Fournisseur","Stock","Unité","Seuil","Coût unitaire","PV TTC","PV HT","Marge HT %","Valeur stock","Estimé"];
  const csvRows = [headers.join(";")];
  rows.forEach(p => {
    const pvHT = p.sale_price_ttc ? (p.sale_price_ttc / 1.10).toFixed(4) : "";
    csvRows.push([
      p.name, p.category, p.supplier_name || "", p.stock, p.unit, p.alert_threshold,
      p.cout_unitaire ?? "", p.sale_price_ttc ?? "", pvHT,
      p.marge !== null ? p.marge.toFixed(1) : "",
      p.valeur_stock !== null ? p.valeur_stock.toFixed(2) : "",
      p.is_estimated ? "oui" : "non"
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(";"));
  });

  const blob = new Blob(["\uFEFF" + csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = `stock_marina_${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

function filterStock() {
  const cat    = document.getElementById("f-cat")?.value    || "";
  const sup    = document.getElementById("f-sup")?.value    || "";
  const marge  = document.getElementById("f-marge")?.value  || "";
  const alert  = document.getElementById("f-alert")?.value  || "";
  const search = (document.getElementById("f-search")?.value || "").toLowerCase();

  let rows = allProducts;
  if (cat)    rows = rows.filter(p => p.category === cat);
  if (sup)    rows = rows.filter(p => p.supplier_name === sup);
  if (marge)  rows = rows.filter(p => p.marge_color === marge);
  if (alert === "zero") rows = rows.filter(p => p.stock === 0);
  if (alert === "low")  rows = rows.filter(p => p.stock > 0 && p.stock <= p.alert_threshold);
  if (search) rows = rows.filter(p => p.name.toLowerCase().includes(search));

  // sort
  if (stockSort.col) {
    rows = [...rows].sort((a, b) => {
      let va = a[stockSort.col], vb = b[stockSort.col];
      if (va === null || va === undefined) va = stockSort.dir > 0 ? Infinity : -Infinity;
      if (vb === null || vb === undefined) vb = stockSort.dir > 0 ? Infinity : -Infinity;
      if (typeof va === "string") return va.localeCompare(vb) * stockSort.dir;
      return (va - vb) * stockSort.dir;
    });
  }

  const tbody = document.getElementById("stock-tbody");
  if (!tbody) return;

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:var(--text-muted);padding:24px">Aucun produit trouvé.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(p => `
    <tr>
      <td><strong>${esc(p.name)}</strong>${p.is_estimated ? '<span class="estimated-tag">~</span>' : ''}</td>
      <td>${esc(p.category)}</td>
      <td class="${stockClass(p.stock, p.alert_threshold)}">${fmtStock(p)}</td>
      <td>${p.cout_unitaire !== null ? "€" + p.cout_unitaire.toFixed(3) : "—"}</td>
      <td>${p.sale_price_ttc !== null ? "€" + p.sale_price_ttc.toFixed(2) : "—"}</td>
      <td>${margePill(p.marge, p.marge_color, p.is_estimated)}</td>
      <td>${p.valeur_stock !== null ? "€" + p.valeur_stock.toFixed(2) : "—"}</td>
      <td>${esc(p.supplier_name || "—")}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-outline btn-sm" onclick="openProductForm(${p.id})">✏️</button>
        <button class="btn btn-outline btn-sm" onclick="openAdjustStock(${p.id})">±</button>
        <button class="btn btn-danger btn-sm" onclick="deleteProduct(${p.id},'${esc(p.name)}')">🗑</button>
      </td>
    </tr>`).join("");
}

function openAdjustStock(id) {
  const p = allProducts.find(x => x.id === id);
  if (!p) return;
  openModal(`
    <h3 style="margin-bottom:16px">Ajuster le stock — ${esc(p.name)}</h3>
    <div class="info-box">Stock actuel : <strong>${fmt(p.stock)} ${esc(p.unit)}</strong></div>
    <div class="form-group">
      <label>Quantité à ajouter / retirer (négatif pour retirer)</label>
      <input type="number" id="adj-qty" step="0.01" value="0"/>
    </div>
    <div class="form-group">
      <label>Note (optionnel)</label>
      <input type="text" id="adj-note" placeholder="ex: casse, dégustation…"/>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
      <button class="btn btn-outline" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="submitAdjust(${id})">Enregistrer</button>
    </div>`);
}

async function submitAdjust(id) {
  const qty  = parseFloat(document.getElementById("adj-qty").value);
  const note = document.getElementById("adj-note").value;
  if (isNaN(qty) || qty === 0) { alert("Entrez une quantité non nulle."); return; }
  try {
    await api("/api/history/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: id, quantity: qty, note }),
    });
    closeModal();
    allProducts = await api("/api/produits");
    filterStock();
    updateAlertBadge();
  } catch (e) { alert(e.message); }
}

async function deleteProduct(id, name) {
  if (!confirm(`Supprimer "${name}" ?`)) return;
  try {
    await api(`/api/produits/${id}`, { method: "DELETE" });
    allProducts = await api("/api/produits");
    filterStock();
    updateAlertBadge();
  } catch (e) { alert(e.message); }
}

function openProductForm(id) {
  const p = id ? allProducts.find(x => x.id === id) : null;
  const title = p ? `Modifier — ${esc(p.name)}` : "Nouveau produit";
  const categories = ["Bières","Vins Blancs","Vins Rosés","Vins Rouges","Champagnes","Anisés","Apéritifs","Rhums","Gins","Whiskies","Vodkas","Cachaça","Tequilas","Digestifs","Eaux","Sodas","Cocktails SA","Autres"];

  openModal(`
    <h3 style="margin-bottom:16px">${title}</h3>
    <form id="product-form" onsubmit="submitProductForm(event,${id || 'null'})">
      <div class="form-row">
        <div class="form-group">
          <label>Nom *</label>
          <input type="text" name="name" required value="${p ? esc(p.name) : ''}"/>
        </div>
        <div class="form-group">
          <label>Catégorie *</label>
          <select name="category" required>
            ${categories.map(c => `<option ${p && p.category===c?"selected":""}>${c}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Fournisseur</label>
          <select name="supplier_id">
            <option value="">—</option>
            ${allSuppliers.map(s => `<option value="${s.id}" ${p && p.supplier_id===s.id?"selected":""}>${esc(s.name)}</option>`).join("")}
          </select>
        </div>
        <div class="form-group">
          <label>Unité</label>
          <select name="unit">
            ${["Bouteille","Fût","Carton 6","Carton 12","Carton 24","Bidon"].map(u => `<option ${p && p.unit===u?"selected":""}>${u}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="form-row-3">
        <div class="form-group">
          <label>Stock</label>
          <input type="number" name="stock" step="0.001" value="${p ? p.stock : 0}"/>
        </div>
        <div class="form-group">
          <label>Qté/conditionnement</label>
          <input type="number" name="qty_per_pack" step="1" value="${p ? p.qty_per_pack : 1}"/>
        </div>
        <div class="form-group">
          <label>Volume (cl)</label>
          <input type="number" name="volume_cl" step="0.1" value="${p ? p.volume_cl : 70}"/>
        </div>
      </div>
      <div class="form-row-3">
        <div class="form-group">
          <label>Seuil alerte</label>
          <input type="number" name="alert_threshold" step="0.5" value="${p ? p.alert_threshold : 2}"/>
        </div>
        <div class="form-group">
          <label>Prix achat HT (cond.)</label>
          <input type="number" name="purchase_price" step="0.001" value="${p && p.purchase_price !== null ? p.purchase_price : ''}"/>
        </div>
        <div class="form-group">
          <label>Prix vente TTC</label>
          <input type="number" name="sale_price_ttc" step="0.01" value="${p && p.sale_price_ttc !== null ? p.sale_price_ttc : ''}"/>
        </div>
      </div>
      <div class="form-group">
        <label style="display:flex;align-items:center;gap:8px;text-transform:none;font-size:13px">
          <input type="checkbox" name="is_estimated" ${p && p.is_estimated?"checked":""}/>
          Prix estimé (provisoire)
        </label>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button type="button" class="btn btn-outline" onclick="closeModal()">Annuler</button>
        <button type="submit" class="btn btn-primary">Enregistrer</button>
      </div>
    </form>`);
}

async function submitProductForm(e, id) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const body = {
    name:            fd.get("name"),
    category:        fd.get("category"),
    supplier_id:     fd.get("supplier_id") ? parseInt(fd.get("supplier_id")) : null,
    stock:           parseFloat(fd.get("stock")) || 0,
    unit:            fd.get("unit"),
    qty_per_pack:    parseFloat(fd.get("qty_per_pack")) || 1,
    volume_cl:       parseFloat(fd.get("volume_cl")) || 70,
    alert_threshold: parseFloat(fd.get("alert_threshold")) || 2,
    purchase_price:  fd.get("purchase_price") ? parseFloat(fd.get("purchase_price")) : null,
    sale_price_ttc:  fd.get("sale_price_ttc")  ? parseFloat(fd.get("sale_price_ttc"))  : null,
    is_estimated:    fd.get("is_estimated") === "on",
  };
  try {
    if (id) {
      await api(`/api/produits/${id}`, { method: "PUT", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) });
    } else {
      await api("/api/produits", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) });
    }
    closeModal();
    allProducts = await api("/api/produits");
    filterStock();
    updateAlertBadge();
  } catch (e) { alert(e.message); }
}

// ══════════════════════════════════════════════════════════
// VIEW: COCKTAILS
// ══════════════════════════════════════════════════════════
function renderCocktails(el) {
  el.innerHTML = `
    <div class="section-header">
      <span class="section-title">Cocktails &amp; Marges</span>
      <button class="btn btn-primary" onclick="openCocktailForm(null)">+ Nouveau cocktail</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Cocktail</th><th>PV TTC</th><th>PV HT</th><th>Coût matière</th><th>Marge HT</th><th>Ingrédients</th><th></th></tr>
        </thead>
        <tbody>
          ${allCocktails.map(c => `
            <tr>
              <td><strong>${esc(c.name)}</strong></td>
              <td>${c.sale_price_ttc !== null ? "€"+c.sale_price_ttc.toFixed(2) : "—"}</td>
              <td>${c.sale_price_ttc !== null ? "€"+(c.sale_price_ttc/1.10).toFixed(2) : "—"}</td>
              <td>€${c.cout_matiere.toFixed(3)}</td>
              <td>${margePill(c.marge, c.marge_color, false)}</td>
              <td style="font-size:12px;color:var(--text-muted)">
                ${c.ingredients.map(i => `${esc(i.product_name)} ${i.dose_cl}cl`).join(", ")}
              </td>
              <td style="white-space:nowrap">
                <button class="btn btn-outline btn-sm" onclick="openCocktailForm(${c.id})">✏️</button>
                <button class="btn btn-danger btn-sm" onclick="deleteCocktail(${c.id},'${esc(c.name)}')">🗑</button>
              </td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

function openCocktailForm(id) {
  const c = id ? allCocktails.find(x => x.id === id) : null;
  const title = c ? `Modifier — ${esc(c.name)}` : "Nouveau cocktail";

  openModal(`
    <h3 style="margin-bottom:16px">${title}</h3>
    <form id="cocktail-form" onsubmit="submitCocktailForm(event,${id||'null'})">
      <div class="form-row">
        <div class="form-group">
          <label>Nom *</label>
          <input type="text" id="c-name" required value="${c ? esc(c.name) : ''}"/>
        </div>
        <div class="form-group">
          <label>Prix vente TTC</label>
          <input type="number" id="c-price" step="0.01" value="${c && c.sale_price_ttc ? c.sale_price_ttc : ''}"/>
        </div>
      </div>
      <div class="form-group">
        <label>Ingrédients</label>
        <div id="ingredients-list">
          ${c && c.ingredients.length ? c.ingredients.map(i => ingredientRow(i.product_id, i.dose_cl)).join("") : ingredientRow()}
        </div>
        <button type="button" class="btn btn-outline btn-sm" style="margin-top:6px" onclick="addIngredientRow()">+ Ingrédient</button>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button type="button" class="btn btn-outline" onclick="closeModal()">Annuler</button>
        <button type="submit" class="btn btn-primary">Enregistrer</button>
      </div>
    </form>`);
}

function ingredientRow(productId = "", doseClVal = "") {
  return `<div class="ingredient-row">
    <select class="ing-product">
      <option value="">— Produit —</option>
      ${allProducts.map(p => `<option value="${p.id}" ${p.id==productId?"selected":""}>${esc(p.name)}</option>`).join("")}
    </select>
    <input type="number" class="ing-dose" placeholder="cl" step="0.5" value="${doseClVal}" style="width:80px"/>
    <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">✕</button>
  </div>`;
}

function addIngredientRow() {
  document.getElementById("ingredients-list").insertAdjacentHTML("beforeend", ingredientRow());
}

async function submitCocktailForm(e, id) {
  e.preventDefault();
  const name  = document.getElementById("c-name").value.trim();
  const price = document.getElementById("c-price").value;
  if (!name) { alert("Nom requis."); return; }

  const ings = [...document.querySelectorAll(".ingredient-row")].map(row => ({
    product_id: parseInt(row.querySelector(".ing-product").value),
    dose_cl:    parseFloat(row.querySelector(".ing-dose").value),
  })).filter(i => i.product_id && !isNaN(i.dose_cl) && i.dose_cl > 0);

  const body = { name, sale_price_ttc: price ? parseFloat(price) : null, ingredients: ings };
  try {
    if (id) {
      await api(`/api/recettes/${id}`, { method: "PUT", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) });
    } else {
      await api("/api/recettes", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) });
    }
    closeModal();
    allCocktails = await api("/api/recettes");
    renderCocktails(document.getElementById("app"));
  } catch (e) { alert(e.message); }
}

async function deleteCocktail(id, name) {
  if (!confirm(`Supprimer "${name}" ?`)) return;
  try {
    await api(`/api/recettes/${id}`, { method: "DELETE" });
    allCocktails = await api("/api/recettes");
    renderCocktails(document.getElementById("app"));
  } catch (e) { alert(e.message); }
}

// ══════════════════════════════════════════════════════════
// VIEW: ALERTS
// ══════════════════════════════════════════════════════════
async function renderAlerts(el) {
  el.innerHTML = `<div class="section-header"><span class="section-title">Alertes actives</span></div><div id="alerts-body">Chargement…</div>`;
  try {
    const alerts = await api("/api/alertes");
    const body = document.getElementById("alerts-body");
    if (alerts.length === 0) {
      body.innerHTML = `<div class="info-box" style="color:#27AE60;font-weight:600">✅ Aucune alerte active — tout est en ordre.</div>`;
      return;
    }

    const groups = {
      rupture:          { label: "Rupture de stock",      icon: "🔴", alerts: [] },
      stock_bas:        { label: "Stock bas",              icon: "⚠️", alerts: [] },
      marge:            { label: "Marge insuffisante",     icon: "📉", alerts: [] },
      ecart_inventaire: { label: "Écart inventaire",       icon: "🔍", alerts: [] },
    };
    alerts.forEach(a => {
      const g = groups[a.type] || groups.rupture;
      g.alerts.push(a);
    });

    let html = "";
    Object.values(groups).forEach(g => {
      if (g.alerts.length === 0) return;
      html += `<h3 style="margin:16px 0 8px;font-size:15px;font-weight:700">${g.icon} ${esc(g.label)} (${g.alerts.length})</h3>
        <div class="alert-list" style="margin-bottom:8px">
          ${g.alerts.map(a => `
            <div class="alert-card alert-${a.severity || 'medium'}">
              <span class="alert-msg">${esc(a.message)}</span>
              ${a.date ? `<span style="font-size:11px;color:var(--text-muted);margin-left:auto">${formatDate(a.date)}</span>` : ''}
            </div>`).join("")}
        </div>`;
    });
    body.innerHTML = html;
  } catch (e) {
    document.getElementById("alerts-body").innerHTML = `<div class="info-box">Erreur : ${esc(e.message)}</div>`;
  }
}

// ══════════════════════════════════════════════════════════
// VIEW: IMPORT CASHPAD
// ══════════════════════════════════════════════════════════
function renderCashpad(el) {
  el.innerHTML = `
    <div class="section-header">
      <span class="section-title">Import rapport Cashpad</span>
    </div>
    <div class="info-box">
      Uploadez le fichier Excel exporté depuis Cashpad (feuille "Ventes-par-produit-2").
      Le numéro de clôture sert à éviter les imports en double.
    </div>
    <div style="max-width:500px">
      <div class="form-group">
        <label>Numéro de clôture *</label>
        <input type="text" id="cashpad-cloture" placeholder="ex: 1042"/>
      </div>
      <div class="upload-zone" id="cashpad-zone" onclick="document.getElementById('cashpad-file').click()">
        <div class="upload-icon">📊</div>
        <div>Cliquez ou glissez le fichier .xlsx ici</div>
        <input type="file" id="cashpad-file" accept=".xlsx,.xls" onchange="setCashpadFile(this)"/>
      </div>
      <div id="cashpad-filename" style="font-size:12px;color:var(--text-muted);margin-top:6px"></div>
      <div style="margin-top:14px">
        <button class="btn btn-primary" onclick="submitCashpad()">📥 Importer</button>
      </div>
      <div id="cashpad-result" style="margin-top:16px"></div>
    </div>`;

  // drag & drop
  const zone = document.getElementById("cashpad-zone");
  zone.addEventListener("dragover", e => { e.preventDefault(); zone.classList.add("drag-over"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
  zone.addEventListener("drop", e => {
    e.preventDefault(); zone.classList.remove("drag-over");
    const f = e.dataTransfer.files[0];
    if (f) { document.getElementById("cashpad-file").files = e.dataTransfer.files; setCashpadFile({ files: [f] }); }
  });
}

function setCashpadFile(input) {
  const f = input.files[0];
  document.getElementById("cashpad-filename").textContent = f ? `📎 ${f.name}` : "";
}

async function submitCashpad() {
  const cloture = document.getElementById("cashpad-cloture").value.trim();
  const file    = document.getElementById("cashpad-file").files[0];
  if (!cloture) { alert("Entrez le numéro de clôture."); return; }
  if (!file)    { alert("Sélectionnez un fichier Excel."); return; }

  const fd = new FormData();
  fd.append("file", file);
  fd.append("numero_cloture", cloture);

  const resultEl = document.getElementById("cashpad-result");
  resultEl.innerHTML = `<div class="info-box">⏳ Import en cours…</div>`;

  try {
    const res = await api("/api/import/cashpad", { method: "POST", body: fd });
    let html = `<div class="import-preview">
      <h4>✅ Import réussi — ${res.deductions.length} déductions</h4>
      <div style="max-height:300px;overflow-y:auto">`;
    res.deductions.forEach(d => {
      html += `<div class="result-item"><span>${esc(d.product)}</span><span>-${d.deducted} → <strong>${d.new_stock}</strong></span></div>`;
    });
    if (res.alerts?.length) {
      html += `<div style="margin-top:10px;color:#E67E22;font-weight:600">⚠️ Alertes stock : ${res.alerts.map(esc).join(", ")}</div>`;
    }
    if (res.unknown?.length) {
      html += `<div style="margin-top:10px;font-size:12px;color:var(--text-muted)">Produits non mappés : ${res.unknown.map(esc).join(", ")}</div>`;
    }
    html += `</div></div>`;
    resultEl.innerHTML = html;
    allProducts = await api("/api/produits");
    updateAlertBadge();
  } catch (e) {
    resultEl.innerHTML = `<div class="alert-card alert-high"><span class="alert-icon">❌</span><span class="alert-msg">${esc(e.message)}</span></div>`;
  }
}

// ══════════════════════════════════════════════════════════
// VIEW: BON DE LIVRAISON
// ══════════════════════════════════════════════════════════
function renderDelivery(el) {
  el.innerHTML = `
    <div class="section-header">
      <span class="section-title">Bon de livraison</span>
    </div>
    <div class="info-box">
      Uploadez une photo ou un PDF du bon de livraison. Claude AI va extraire les produits automatiquement.
    </div>
    <div style="max-width:520px">
      <div class="form-group">
        <label>Fournisseur (optionnel)</label>
        <input type="text" id="delivery-sup" placeholder="ex: Socobo"/>
      </div>
      <div class="upload-zone" id="delivery-zone" onclick="document.getElementById('delivery-file').click()">
        <div class="upload-icon">📷</div>
        <div>Photo ou PDF du bon de livraison</div>
        <input type="file" id="delivery-file" accept="image/*,.pdf" onchange="setDeliveryFile(this)"/>
      </div>
      <div id="delivery-filename" style="font-size:12px;color:var(--text-muted);margin-top:6px"></div>
      <div style="margin-top:14px">
        <button class="btn btn-primary" onclick="analyzeDelivery()">🔍 Analyser avec Claude AI</button>
      </div>
      <div id="delivery-result" style="margin-top:16px"></div>
    </div>`;

  const zone = document.getElementById("delivery-zone");
  zone.addEventListener("dragover", e => { e.preventDefault(); zone.classList.add("drag-over"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
  zone.addEventListener("drop", e => {
    e.preventDefault(); zone.classList.remove("drag-over");
    const f = e.dataTransfer.files[0];
    if (f) { document.getElementById("delivery-file").files = e.dataTransfer.files; setDeliveryFile({ files: [f] }); }
  });
}

function setDeliveryFile(input) {
  const f = input.files[0];
  document.getElementById("delivery-filename").textContent = f ? `📎 ${f.name}` : "";
}

async function analyzeDelivery() {
  const file = document.getElementById("delivery-file").files[0];
  if (!file) { alert("Sélectionnez un fichier."); return; }

  const resultEl = document.getElementById("delivery-result");
  resultEl.innerHTML = `<div class="info-box">⏳ Analyse par Claude AI en cours…</div>`;

  const fd = new FormData();
  fd.append("file", file);

  try {
    const res = await api("/api/import/livraison", { method: "POST", body: fd });
    window._deliveryProducts = res.products;

    let html = `<div class="import-preview">
      <h4>📋 Produits détectés — vérifiez avant de valider</h4>
      <table style="width:100%;margin-bottom:12px">
        <thead><tr><th>Produit</th><th>Qté</th><th>Prix HT</th><th>N° Facture</th></tr></thead>
        <tbody>
          ${res.products.map((p, i) => `
            <tr>
              <td><input type="text" id="dp-name-${i}" value="${esc(p.nom||'')}" style="width:100%;border:1px solid var(--border);border-radius:4px;padding:3px 6px"/></td>
              <td><input type="number" id="dp-qty-${i}" value="${p.quantite||0}" step="0.01" style="width:70px;border:1px solid var(--border);border-radius:4px;padding:3px 6px"/></td>
              <td><input type="number" id="dp-prix-${i}" value="${p.prix_unitaire_ht||''}" step="0.01" style="width:80px;border:1px solid var(--border);border-radius:4px;padding:3px 6px"/></td>
              <td><input type="text" id="dp-facture-${i}" value="${esc(p.numero_facture||'')}" style="width:100px;border:1px solid var(--border);border-radius:4px;padding:3px 6px"/></td>
            </tr>`).join("")}
        </tbody>
      </table>
      <div class="form-row">
        <div class="form-group">
          <label>N° Facture (global si non détecté)</label>
          <input type="text" id="delivery-facture" value="${esc(res.products[0]?.numero_facture||'')}"/>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:4px">
        <button class="btn btn-success" onclick="confirmDelivery(${res.products.length})">✅ Valider et mettre à jour le stock</button>
      </div>
    </div>`;
    resultEl.innerHTML = html;
  } catch (e) {
    resultEl.innerHTML = `<div class="alert-card alert-high"><span class="alert-icon">❌</span><span class="alert-msg">${esc(e.message)}</span></div>`;
  }
}

async function confirmDelivery(count) {
  const products = [];
  for (let i = 0; i < count; i++) {
    products.push({
      nom:             document.getElementById(`dp-name-${i}`)?.value || "",
      quantite:        parseFloat(document.getElementById(`dp-qty-${i}`)?.value) || 0,
      prix_unitaire_ht:parseFloat(document.getElementById(`dp-prix-${i}`)?.value) || null,
      numero_facture:  document.getElementById(`dp-facture-${i}`)?.value || "",
    });
  }
  const numero_facture = document.getElementById("delivery-facture")?.value || products[0]?.numero_facture || "INCONNU";
  const fournisseur    = document.getElementById("delivery-sup")?.value || "";

  try {
    const res = await api("/api/import/livraison/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ products, numero_facture, fournisseur }),
    });
    let html = `<div class="import-preview"><h4>✅ Livraison confirmée</h4>`;
    res.updated.forEach(u => { html += `<div class="result-item"><span>${esc(u.product)}</span><span>+${u.added}</span></div>`; });
    if (res.not_found?.length) html += `<div style="font-size:12px;color:var(--text-muted);margin-top:8px">Non trouvés : ${res.not_found.map(esc).join(", ")}</div>`;
    html += `</div>`;
    document.getElementById("delivery-result").innerHTML = html;
    allProducts = await api("/api/produits");
    updateAlertBadge();
  } catch (e) {
    document.getElementById("delivery-result").innerHTML += `<div class="alert-card alert-high" style="margin-top:8px"><span class="alert-icon">❌</span><span class="alert-msg">${esc(e.message)}</span></div>`;
  }
}

// ══════════════════════════════════════════════════════════
// VIEW: INVENTAIRE DU SOIR
// ══════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════
// VIEW: SORTIE RÉSERVE
// Le serveur note les bouteilles qu'il sort de la réserve
// → chaque sortie est immédiatement déduite du stock
// ══════════════════════════════════════════════════════════

let reserveProducts = [];
let reserveSearch = "";

async function renderInventory(el) {
  el.innerHTML = `
    <div class="section-header">
      <span class="section-title">Sortie Réserve</span>
    </div>
    <div class="info-box">
      🏪 Le serveur note ici les bouteilles qu'il <strong>prend dans la réserve</strong> pour le service.<br>
      Saisissez la <strong>quantité sortie</strong> (ex : 2 bouteilles de Pago ananas prises → entrez 2).
    </div>
    <div style="display:flex;gap:10px;align-items:center;margin-bottom:16px;flex-wrap:wrap">
      <div class="form-group" style="max-width:200px;margin:0">
        <label>Prénom du serveur</label>
        <input type="text" id="inv-staff" placeholder="ex: Jean"/>
      </div>
      <div class="form-group" style="flex:1;min-width:180px;margin:0">
        <label>Recherche rapide</label>
        <input type="text" id="reserve-search" placeholder="Pago, Coca, Ricard…"
               oninput="reserveSearch=this.value; renderReserveList()"/>
      </div>
    </div>
    <div id="reserve-list">Chargement…</div>
    <div style="margin-top:16px" id="reserve-submit-bar" class="hidden">
      <button class="btn btn-primary btn-lg" onclick="submitReserve()">
        📦 Valider les sorties
      </button>
      <span id="reserve-count-label" style="margin-left:12px;color:var(--text-muted);font-size:14px"></span>
    </div>
    <div id="reserve-result" style="margin-top:16px"></div>`;
  loadReserveProducts();
}

async function loadReserveProducts() {
  try {
    reserveProducts = await api("/api/inventaire/session");
    renderReserveList();
  } catch (e) {
    const c = document.getElementById("reserve-list");
    if (c) c.innerHTML = `<div class="info-box">Erreur : ${esc(e.message)}</div>`;
  }
}

function renderReserveList() {
  const container = document.getElementById("reserve-list");
  if (!container) return;

  const q = reserveSearch.toLowerCase().trim();
  const filtered = q
    ? reserveProducts.filter(p => p.name.toLowerCase().includes(q) || (p.category||"").toLowerCase().includes(q))
    : reserveProducts;

  if (filtered.length === 0) {
    container.innerHTML = `<div class="info-box">Aucun produit trouvé.</div>`;
    return;
  }

  // Grouper par catégorie
  const byCat = {};
  filtered.forEach(p => {
    const cat = p.category || "Autres";
    if (!byCat[cat]) byCat[cat] = [];
    byCat[cat].push(p);
  });

  let html = '';
  Object.entries(byCat).forEach(([cat, prods]) => {
    html += `<div class="inv-category-block">
      <div class="inv-category-header">${esc(cat)}</div>
      <div class="inv-rows">`;
    prods.forEach(p => {
      const stockAff = fmtStock(p);
      html += `<div class="inv-row" id="reserve-row-${p.id}">
        <div class="inv-name">
          <strong>${esc(p.name)}</strong>
          <div class="inv-theorique">En réserve : ${stockAff}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <button class="reserve-qty-btn" onclick="reserveAdj(${p.id},-1)">−</button>
          <input type="number" class="inv-input reserve-qty" id="inv-${p.id}"
                 value="" placeholder="0" step="1" min="0"
                 oninput="updateReserveBar()"/>
          <button class="reserve-qty-btn" onclick="reserveAdj(${p.id},1)">+</button>
        </div>
      </div>`;
    });
    html += `</div></div>`;
  });

  container.innerHTML = html;
  updateReserveBar();
}

function reserveAdj(id, delta) {
  const inp = document.getElementById(`inv-${id}`);
  if (!inp) return;
  const cur = parseFloat(inp.value) || 0;
  const next = Math.max(0, cur + delta);
  inp.value = next || "";
  // Highlight la ligne si > 0
  const row = document.getElementById(`reserve-row-${id}`);
  if (row) row.classList.toggle("inv-row-active", next > 0);
  updateReserveBar();
}

function updateReserveBar() {
  const inputs = document.querySelectorAll(".reserve-qty");
  let count = 0;
  inputs.forEach(inp => {
    const v = parseFloat(inp.value) || 0;
    const id = inp.id.replace("inv-", "");
    const row = document.getElementById(`reserve-row-${id}`);
    if (row) row.classList.toggle("inv-row-active", v > 0);
    if (v > 0) count++;
  });
  const bar = document.getElementById("reserve-submit-bar");
  const lbl = document.getElementById("reserve-count-label");
  if (bar) bar.classList.toggle("hidden", count === 0);
  if (lbl) lbl.textContent = count > 0 ? `${count} produit${count > 1 ? "s" : ""} à sortir` : "";
}

async function submitReserve() {
  const staff = document.getElementById("inv-staff")?.value || "";
  const sorties = reserveProducts
    .map(p => ({
      product_id: p.id,
      qty: parseFloat(document.getElementById(`inv-${p.id}`)?.value) || 0,
    }))
    .filter(s => s.qty > 0);

  if (sorties.length === 0) { alert("Aucune sortie saisie."); return; }

  // Utilise l'endpoint d'ajustement manuel pour chaque sortie
  try {
    const results = [];
    for (const s of sorties) {
      const prod = reserveProducts.find(p => p.id === s.product_id);
      const res = await api("/api/history/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: s.product_id,
          quantity: -s.qty,   // sortie = négatif
          note: `Sortie réserve${staff ? " par " + staff : ""} : -${s.qty} ${prod?.unit || ""}`,
        }),
      });
      results.push({ name: prod?.name || "?", qty: s.qty, unit: prod?.unit || "", new_stock: res.new_stock });
    }

    let html = `<div class="import-preview">
      <h4>📦 Sorties enregistrées (${results.length} produit${results.length > 1 ? 's' : ''})</h4>`;
    results.forEach(r => {
      html += `<div class="result-item">
        <span>${esc(r.name)}</span>
        <span style="color:var(--primary);font-weight:600">−${r.qty} ${esc(r.unit)} sorti(s)</span>
      </div>`;
    });
    html += `</div>`;
    document.getElementById("reserve-result").innerHTML = html;

    // Réinitialiser les champs
    document.querySelectorAll(".reserve-qty").forEach(inp => { inp.value = ""; });
    document.querySelectorAll(".inv-row-active").forEach(r => r.classList.remove("inv-row-active"));
    updateReserveBar();
    allProducts = await api("/api/produits");
    updateAlertBadge();
    await loadReserveProducts(); // rafraîchir les stocks affichés
  } catch (e) { alert(e.message); }
}

// ══════════════════════════════════════════════════════════
// VIEW: HISTORIQUE
// ══════════════════════════════════════════════════════════
async function renderHistory(el) {
  el.innerHTML = `<div class="section-header"><span class="section-title">Historique</span></div><div id="history-body">Chargement…</div>`;
  try {
    const events = await api("/api/historique");
    const body = document.getElementById("history-body");
    if (events.length === 0) {
      body.innerHTML = `<div class="info-box">Aucun événement enregistré.</div>`;
      return;
    }
    body.innerHTML = `<div class="history-list">${events.map(e => {
      const dotCls = ["import_cashpad","livraison","inventaire_soir","mouvement_manuel","alerte_inventaire"].includes(e.event_type) ? e.event_type : "default";
      return `<div class="history-item">
        <div class="history-dot ${dotCls}"></div>
        <div class="history-body">
          <div class="history-desc">${esc(e.description)}</div>
          <div class="history-date">${formatDate(e.created_at)}</div>
          <details class="history-details">
            <summary>Détails</summary>
            <pre>${esc(JSON.stringify(e.data, null, 2))}</pre>
          </details>
        </div>
      </div>`;
    }).join("")}</div>`;
  } catch (e) {
    document.getElementById("history-body").innerHTML = `<div class="info-box">Erreur : ${esc(e.message)}</div>`;
  }
}

// ══════════════════════════════════════════════════════════
// VIEW: FOURNISSEURS
// ══════════════════════════════════════════════════════════
function renderSuppliers(el) {
  el.innerHTML = `
    <div class="section-header">
      <span class="section-title">Fournisseurs</span>
      <button class="btn btn-primary" onclick="openSupplierForm(null)">+ Nouveau fournisseur</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Nom</th><th>Contact</th><th>Téléphone</th><th>Catégories</th><th></th></tr></thead>
        <tbody>
          ${allSuppliers.map(s => `
            <tr>
              <td><strong>${esc(s.name)}</strong></td>
              <td>${esc(s.contact||"—")}</td>
              <td>${s.phone ? `<a href="tel:${esc(s.phone)}">${esc(s.phone)}</a>` : "—"}</td>
              <td>${esc(s.categories||"—")}</td>
              <td style="white-space:nowrap">
                <button class="btn btn-outline btn-sm" onclick="openSupplierForm(${s.id})">✏️</button>
                <button class="btn btn-danger btn-sm" onclick="deleteSupplier(${s.id},'${esc(s.name)}')">🗑</button>
              </td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

function openSupplierForm(id) {
  const s = id ? allSuppliers.find(x => x.id === id) : null;
  openModal(`
    <h3 style="margin-bottom:16px">${s ? "Modifier fournisseur" : "Nouveau fournisseur"}</h3>
    <form id="supplier-form" onsubmit="submitSupplierForm(event,${id||'null'})">
      <div class="form-group"><label>Nom *</label><input type="text" name="name" required value="${s ? esc(s.name) : ''}"/></div>
      <div class="form-row">
        <div class="form-group"><label>Contact</label><input type="text" name="contact" value="${s ? esc(s.contact||'') : ''}"/></div>
        <div class="form-group"><label>Téléphone</label><input type="text" name="phone" value="${s ? esc(s.phone||'') : ''}"/></div>
      </div>
      <div class="form-group"><label>Catégories</label><input type="text" name="categories" value="${s ? esc(s.categories||'') : ''}"/></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button type="button" class="btn btn-outline" onclick="closeModal()">Annuler</button>
        <button type="submit" class="btn btn-primary">Enregistrer</button>
      </div>
    </form>`);
}

async function submitSupplierForm(e, id) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const body = { name: fd.get("name"), contact: fd.get("contact"), phone: fd.get("phone"), categories: fd.get("categories") };
  try {
    if (id) {
      await api(`/api/fournisseurs/${id}`, { method: "PUT", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) });
    } else {
      await api("/api/fournisseurs", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) });
    }
    closeModal();
    allSuppliers = await api("/api/fournisseurs");
    renderSuppliers(document.getElementById("app"));
  } catch (e) { alert(e.message); }
}

async function deleteSupplier(id, name) {
  if (!confirm(`Supprimer "${name}" ?`)) return;
  try {
    await api(`/api/fournisseurs/${id}`, { method: "DELETE" });
    allSuppliers = await api("/api/fournisseurs");
    renderSuppliers(document.getElementById("app"));
  } catch (e) { alert(e.message); }
}

// ══════════════════════════════════════════════════════════
// VIEW: MAPPING CASHPAD
// ══════════════════════════════════════════════════════════
let allMappings = [];

async function renderMapping(el) {
  el.innerHTML = `
    <div class="section-header">
      <span class="section-title">Mapping Cashpad</span>
      <button class="btn btn-primary" onclick="openMappingForm(null)">+ Nouveau mapping</button>
    </div>
    <div class="info-box">
      Associez les noms Cashpad aux produits ou recettes du stock. Les produits ignorés sont exclus des imports.
    </div>
    <div class="filters">
      <select id="mf-type" onchange="filterMapping()">
        <option value="">Tous les types</option>
        <option value="direct">Direct</option>
        <option value="cocktail">Cocktail</option>
        <option value="ignore">Ignorés</option>
      </select>
      <input type="text" id="mf-search" placeholder="Rechercher…" oninput="filterMapping()"/>
    </div>
    <div id="mapping-body">Chargement…</div>`;

  try {
    allMappings = await api("/api/cashpad_mapping");
    filterMapping();
  } catch (e) {
    document.getElementById("mapping-body").innerHTML = `<div class="info-box">Erreur : ${esc(e.message)}</div>`;
  }
}

function filterMapping() {
  const type   = document.getElementById("mf-type")?.value || "";
  const search = (document.getElementById("mf-search")?.value || "").toLowerCase();
  const body   = document.getElementById("mapping-body");
  if (!body) return;

  let rows = allMappings;
  if (type === "ignore") rows = rows.filter(m => m.ignore || m.ignored);
  else if (type === "direct")   rows = rows.filter(m => !(m.ignore || m.ignored) && m.mapping_type === "direct");
  else if (type === "cocktail") rows = rows.filter(m => !(m.ignore || m.ignored) && m.mapping_type === "cocktail");
  if (search) rows = rows.filter(m => m.nom_cashpad.toLowerCase().includes(search) ||
    (m.product_name || "").toLowerCase().includes(search) ||
    (m.cocktail_name || "").toLowerCase().includes(search));

  if (rows.length === 0) {
    body.innerHTML = `<div class="info-box">Aucun mapping trouvé.</div>`;
    return;
  }

  body.innerHTML = `<div class="table-wrap"><table>
    <thead><tr>
      <th>Nom Cashpad</th><th>Type</th><th>Produit / Cocktail</th><th>Dose (cl)</th><th>Ignoré</th><th></th>
    </tr></thead>
    <tbody>
      ${rows.map(m => {
        const isIgnored = m.ignore || m.ignored;
        const linked = m.mapping_type === "cocktail"
          ? (m.cocktail_name ? `🍹 ${esc(m.cocktail_name)}` : "—")
          : (m.product_name ? `📦 ${esc(m.product_name)}` : "—");
        return `<tr style="${isIgnored ? 'opacity:0.5' : ''}">
          <td><strong>${esc(m.nom_cashpad)}</strong></td>
          <td><span class="marge-pill ${m.mapping_type === 'cocktail' ? 'marge-green' : 'marge-orange'}">${esc(m.mapping_type)}</span></td>
          <td>${linked}</td>
          <td>${m.dose_cl > 0 ? m.dose_cl + ' cl' : '—'}</td>
          <td>${isIgnored ? '✓' : ''}</td>
          <td style="white-space:nowrap">
            <button class="btn btn-outline btn-sm" onclick="openMappingForm(${m.id})">✏️</button>
            <button class="btn btn-danger btn-sm" onclick="deleteMapping(${m.id},'${esc(m.nom_cashpad)}')">🗑</button>
          </td>
        </tr>`;
      }).join("")}
    </tbody>
  </table></div>`;
}

function openMappingForm(id) {
  const m = id ? allMappings.find(x => x.id === id) : null;
  const title = m ? `Modifier mapping` : "Nouveau mapping";

  openModal(`
    <h3 style="margin-bottom:16px">${title}</h3>
    <form id="mapping-form" onsubmit="submitMappingForm(event,${id||'null'})">
      <div class="form-group">
        <label>Nom Cashpad *</label>
        <input type="text" id="m-nom" required value="${m ? esc(m.nom_cashpad) : ''}"/>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Type</label>
          <select id="m-type" onchange="toggleMappingTarget()">
            <option value="direct" ${!m || m.mapping_type==='direct' ? 'selected' : ''}>Direct (produit)</option>
            <option value="cocktail" ${m && m.mapping_type==='cocktail' ? 'selected' : ''}>Cocktail (recette)</option>
          </select>
        </div>
        <div class="form-group">
          <label>Dose (cl)</label>
          <input type="number" id="m-dose" step="0.5" value="${m ? m.dose_cl : 0}"/>
        </div>
      </div>
      <div class="form-group" id="m-product-group">
        <label>Produit</label>
        <select id="m-product">
          <option value="">— Aucun —</option>
          ${allProducts.map(p => `<option value="${p.id}" ${m && m.product_id===p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join("")}
        </select>
      </div>
      <div class="form-group" id="m-cocktail-group" style="display:none">
        <label>Cocktail / Recette</label>
        <select id="m-cocktail">
          <option value="">— Aucun —</option>
          ${allCocktails.map(c => `<option value="${c.id}" ${m && m.cocktail_id===c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join("")}
        </select>
      </div>
      <div class="form-group">
        <label style="display:flex;align-items:center;gap:8px;text-transform:none;font-size:13px">
          <input type="checkbox" id="m-ignore" ${m && (m.ignore||m.ignored) ? 'checked' : ''}/>
          Ignorer lors des imports (boissons chaudes, sirops, etc.)
        </label>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button type="button" class="btn btn-outline" onclick="closeModal()">Annuler</button>
        <button type="submit" class="btn btn-primary">Enregistrer</button>
      </div>
    </form>`);

  // Initialize visibility
  toggleMappingTarget();
}

function toggleMappingTarget() {
  const type = document.getElementById("m-type")?.value;
  const pg = document.getElementById("m-product-group");
  const cg = document.getElementById("m-cocktail-group");
  if (!pg || !cg) return;
  if (type === "cocktail") {
    pg.style.display = "none";
    cg.style.display = "";
  } else {
    pg.style.display = "";
    cg.style.display = "none";
  }
}

async function submitMappingForm(e, id) {
  e.preventDefault();
  const nom      = document.getElementById("m-nom").value.trim();
  const type     = document.getElementById("m-type").value;
  const dose     = parseFloat(document.getElementById("m-dose").value) || 0;
  const prodId   = document.getElementById("m-product")?.value;
  const cockId   = document.getElementById("m-cocktail")?.value;
  const ignored  = document.getElementById("m-ignore").checked;

  if (!nom) { alert("Nom Cashpad requis."); return; }

  const body = {
    nom_cashpad:  nom,
    mapping_type: type,
    dose_cl:      dose,
    product_id:   (type === "direct" && prodId) ? parseInt(prodId) : null,
    cocktail_id:  (type === "cocktail" && cockId) ? parseInt(cockId) : null,
    ignored,
  };

  try {
    if (id) {
      await api(`/api/cashpad_mapping/${id}`, { method: "PUT", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) });
    } else {
      await api("/api/cashpad_mapping", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) });
    }
    closeModal();
    allMappings = await api("/api/cashpad_mapping");
    filterMapping();
  } catch (e) { alert(e.message); }
}

async function deleteMapping(id, name) {
  if (!confirm(`Supprimer le mapping "${name}" ?`)) return;
  try {
    await api(`/api/cashpad_mapping/${id}`, { method: "DELETE" });
    allMappings = await api("/api/cashpad_mapping");
    filterMapping();
  } catch (e) { alert(e.message); }
}

// ── Utilities ──────────────────────────────────────────────
function esc(str) {
  if (str === null || str === undefined) return "";
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function fmt(n) {
  if (n === null || n === undefined) return "—";
  const v = parseFloat(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/\.?0+$/, "");
}

// Affichage lisible du stock selon le type de produit
function fmtStock(p) {
  const stock = parseFloat(p.stock);
  const qty   = parseFloat(p.qty_per_pack || p.qte_conditionnement || 1);
  const vol   = parseFloat(p.volume_cl || 70);
  const unit  = p.unit || 'unité';

  if (isNaN(stock)) return "—";

  // Produits en carton → afficher en nombre d'unités individuelles
  if (qty > 1) {
    const unites = stock * qty;
    const u = Math.abs(unites) % 1 < 0.05 ? Math.round(unites) : parseFloat(unites.toFixed(1));
    return `<span>${u < 0 ? '<span style="color:#DC2626">⚠ ' + u + '</span>' : u} unités</span>
            <small style="color:var(--text-faint);display:block;font-size:11px">${parseFloat(stock.toFixed(2))} ${unit}</small>`;
  }

  // Fûts → afficher en litres + fraction de fût
  if (unit === 'Fût') {
    const litres = stock * (vol / 100);
    const l = parseFloat(litres.toFixed(2));
    const litreDisplay = l < 0
      ? `<span style="color:#DC2626">⚠ ${l} L</span>`
      : `${l} L`;
    return `<span>${litreDisplay}</span>
            <small style="color:var(--text-faint);display:block;font-size:11px">${parseFloat(stock.toFixed(3))} fût</small>`;
  }

  // Bouteilles individuelles
  // Grande bouteille de mixing (≥ 75cl) → afficher en bouteilles avec décimale
  // Petite bouteille (alcool, etc.) → afficher en btl + cl si négatif
  const s = parseFloat(stock.toFixed(2));
  const isGrande = vol >= 75;

  if (stock < 0) {
    if (isGrande) {
      // Ex : -0.5 Bouteille → "⚠ 0.5 bouteille manquante"
      const manque = Math.abs(s);
      return `<span style="color:#DC2626">⚠ −${manque} btl</span>
              <small style="color:var(--text-faint);display:block;font-size:11px">à régulariser</small>`;
    } else {
      const cl = Math.abs(parseFloat((stock * vol).toFixed(0)));
      return `<span style="color:#DC2626">⚠ ${s} btl</span>
              <small style="color:var(--text-faint);display:block;font-size:11px">${cl} cl consommés</small>`;
    }
  }

  // Stock positif
  if (isGrande) {
    // Afficher avec 1 décimale si pas entier (ex: 2.5 Bouteilles)
    const s2 = stock % 1 < 0.01 ? Math.round(stock) : parseFloat(stock.toFixed(1));
    const label = s2 <= 1 ? unit : unit + 's';
    return `${s2} ${label}`;
  }
  const s2 = Math.abs(stock) % 1 < 0.01 ? Math.round(stock) : s;
  return `${s2} ${unit}`;
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" });
}
