/* ═══════════════════════════════════════════════════════════
   Marina di Lava — app.js
   ═══════════════════════════════════════════════════════════ */

// ── State ──────────────────────────────────────────────────
let currentView = "stock";
let allProducts = [];
let allSuppliers = [];
let allCocktails = [];
let stockSort = { col: null, dir: 1 };
let userRole = null; // "service" ou "manager"
let authToken = null; // token API
let inactivityTimer = null;

// Onglets accessibles par rôle
const SERVICE_VIEWS = ["inventory"];
const MANAGER_VIEWS = ["stock","cocktails","alerts","cashpad","delivery","inventory","stats","history","suppliers","mapping"];

// ── Login ──────────────────────────────────────────────────
async function loginService() {
  const res = await api("/api/auth/service", { method: "POST" });
  authToken = res.token;
  userRole = "service";
  startApp();
}

async function loginManager() {
  const pin = document.getElementById("pin-input").value;
  try {
    const res = await api("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin })
    });
    authToken = res.token;
    userRole = "manager";
    startApp();
  } catch(e) {
    const msg = e.message || "Code incorrect";
    document.getElementById("pin-error").textContent = msg;
    document.getElementById("pin-error").classList.remove("hidden");
    document.getElementById("pin-input").value = "";
    document.getElementById("pin-input").focus();
  }
}

function showPinInput() {
  document.getElementById("login-buttons").classList.add("hidden");
  document.getElementById("pin-area").classList.remove("hidden");
  document.getElementById("pin-input").focus();
}

function hidePinInput() {
  document.getElementById("pin-area").classList.add("hidden");
  document.getElementById("login-buttons").classList.remove("hidden");
  document.getElementById("pin-error").classList.add("hidden");
  document.getElementById("pin-input").value = "";
}

function startApp() {
  document.getElementById("login-screen").classList.add("hidden");
  document.querySelector("header").style.display = "";
  document.getElementById("app").style.display = "";
  resetInactivityTimer();
  // Réinitialise le timer sur toute interaction utilisateur
  ["click","touchstart","keydown"].forEach(evt =>
    document.addEventListener(evt, resetOnActivity, { passive: true }));

  const allowedViews = userRole === "manager" ? MANAGER_VIEWS : SERVICE_VIEWS;

  // Affiche/cache les boutons de nav
  document.querySelectorAll(".nav-btn").forEach(btn => {
    if (allowedViews.includes(btn.dataset.view)) {
      btn.style.display = "";
    } else {
      btn.style.display = "none";
    }
  });

  // Ajoute bouton déconnexion
  const nav = document.getElementById("main-nav");
  if (!document.getElementById("logout-btn")) {
    const logoutBtn = document.createElement("button");
    logoutBtn.id = "logout-btn";
    logoutBtn.className = "nav-btn logout-nav-btn";
    logoutBtn.textContent = "🔓 Déconnexion";
    logoutBtn.onclick = logout;
    nav.appendChild(logoutBtn);
  }

  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => btn.id !== "logout-btn" && switchView(btn.dataset.view));
  });

  const defaultView = userRole === "manager" ? "stock" : "inventory";
  switchView(defaultView);
  loadAll();
}

function logout() {
  userRole = null;
  authToken = null;
  clearTimeout(inactivityTimer);
  location.reload();
}

// ── Init ───────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  // Cache l'app en attendant la connexion
  document.querySelector("header").style.display = "none";
  document.getElementById("app").style.display = "none";

  // Toujours afficher l'écran de connexion à l'ouverture
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
    case "stats":     renderStats(app); break;
    case "history":   renderHistory(app); break;
    case "suppliers": renderSuppliers(app); break;
    case "mapping":   renderMapping(app); break;
  }
}

// ── API helper ─────────────────────────────────────────────
async function api(url, options = {}) {
  // Ajoute le token d'authentification sur tous les appels /api/
  if (authToken && url.startsWith("/api/")) {
    options.headers = { ...(options.headers || {}), "Authorization": `Bearer ${authToken}` };
  }
  const res = await fetch(url, options);
  if (res.status === 401) {
    // Session expirée → retour à l'écran de connexion
    logout();
    throw new Error("Session expirée, veuillez vous reconnecter");
  }
  if (!res.ok) {
    let errText = "";
    try {
      const err = await res.json();
      errText = Array.isArray(err.detail)
        ? err.detail.map(e => e.msg || JSON.stringify(e)).join(", ")
        : (err.detail || "");
    } catch (_) {
      errText = await res.text().catch(() => "");
    }
    // HTTP/2 sur Railway a statusText vide — fallback sur le code HTTP
    throw new Error(errText || `Erreur serveur ${res.status}`);
  }
  resetInactivityTimer();
  return res.json();
}

// ── Déconnexion automatique après 30 min ───────────────────
function resetInactivityTimer() {
  clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(() => {
    alert("⏱ Session expirée après 30 min d'inactivité. Veuillez vous reconnecter.");
    logout();
  }, 30 * 60 * 1000);
}

function resetOnActivity() {
  if (authToken) resetInactivityTimer();
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
      <div class="summary-card card-gold" style="--card-icon:'💰'">
        <div class="s-label">Valeur totale stock</div>
        <div class="s-value">€${totalVal.toFixed(0)}</div>
        <div class="s-sub">${withVal.length} produits valorisés</div>
      </div>
      <div class="summary-card" style="--card-icon:'📦'">
        <div class="s-label">Produits</div>
        <div class="s-value">${allProducts.length}</div>
        <div class="s-sub">${allProducts.filter(p => p.stock > 0).length} en stock</div>
      </div>
      <div class="summary-card ${ruptures > 0 ? 'card-danger' : 'card-success'}" style="--card-icon:'${ruptures > 0 ? '🚨' : '✅'}'">
        <div class="s-label">Ruptures</div>
        <div class="s-value">${ruptures}</div>
        <div class="s-sub">${stockBas > 0 ? `⚠️ ${stockBas} stock bas` : 'Stock sain'}</div>
      </div>
      <div class="summary-card card-success" style="--card-icon:'📈'">
        <div class="s-label">Marge ≥ 70%</div>
        <div class="s-value">${margesOk}</div>
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
            <th class="sortable col-desktop" onclick="sortStock('cout_unitaire')">Coût unit.</th>
            <th class="sortable col-desktop" onclick="sortStock('sale_price_ttc')">PV TTC</th>
            <th class="sortable col-desktop" onclick="sortStock('marge')">Marge HT</th>
            <th class="sortable col-desktop" onclick="sortStock('valeur_stock')">Val. stock</th>
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
  if (sup)    rows = rows.filter(p =>
    p.supplier_name === sup ||
    (p.suppliers && p.suppliers.some(s => s.supplier_name === sup))
  );
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
  if (sup)    rows = rows.filter(p =>
    p.supplier_name === sup ||
    (p.suppliers && p.suppliers.some(s => s.supplier_name === sup))
  );
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
      <td class="col-desktop">${p.cout_unitaire !== null ? "€" + p.cout_unitaire.toFixed(3) : "—"}</td>
      <td class="col-desktop">${p.sale_price_ttc !== null ? "€" + p.sale_price_ttc.toFixed(2) : "—"}</td>
      <td class="col-desktop">${margePill(p.marge, p.marge_color, p.is_estimated)}</td>
      <td class="col-desktop">${p.valeur_stock !== null ? "€" + p.valeur_stock.toFixed(2) : "—"}</td>
      <td>${renderSupplierCell(p)}</td>
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

function renderSupplierCell(p) {
  const list = p.suppliers || [];
  if (list.length === 0) return esc(p.supplier_name || "—");
  if (list.length === 1) {
    const s = list[0];
    return `${esc(s.supplier_name)}${s.purchase_price != null
      ? `<br><span style="color:var(--text-muted);font-size:11px">€${s.purchase_price.toFixed(2)}</span>` : ""}`;
  }
  return list.map(s =>
    `<div style="font-size:12px;line-height:1.4">
      ${s.is_primary ? '<span style="color:var(--accent);font-size:10px">★</span> ' : ''}${esc(s.supplier_name)}
      ${s.purchase_price != null ? `<span style="color:var(--text-muted)">€${s.purchase_price.toFixed(2)}</span>` : ""}
    </div>`
  ).join("");
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
          <label>Unité</label>
          <select name="unit">
            ${["Bouteille","Fût","Carton 6","Carton 12","Carton 24","Bidon"].map(u => `<option ${p && p.unit===u?"selected":""}>${u}</option>`).join("")}
          </select>
        </div>
        <div class="form-group">
          <label>Prix vente TTC</label>
          <input type="number" name="sale_price_ttc" step="0.01" value="${p && p.sale_price_ttc !== null ? p.sale_price_ttc : ''}"/>
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
          <label>Prix achat HT principal</label>
          <input type="number" name="purchase_price" step="0.001" value="${p && p.purchase_price !== null ? p.purchase_price : ''}"/>
        </div>
        <div class="form-group">
          <label style="display:flex;align-items:center;gap:6px;text-transform:none;font-size:12px;padding-top:20px">
            <input type="checkbox" name="is_estimated" ${p && p.is_estimated?"checked":""}/>
            Prix estimé
          </label>
        </div>
      </div>
      <div class="form-group" style="margin-top:8px">
        <label>Fournisseurs &amp; Prix par fournisseur</label>
        <div id="suppliers-list" style="display:flex;flex-direction:column;gap:6px;margin-top:6px">
          ${buildSupplierRows(p ? (p.suppliers || []) : [])}
        </div>
        <button type="button" class="btn btn-outline btn-sm" style="margin-top:8px;font-size:12px"
          onclick="addSupplierRow()">+ Ajouter un fournisseur</button>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button type="button" class="btn btn-outline" onclick="closeModal()">Annuler</button>
        <button type="submit" class="btn btn-primary">Enregistrer</button>
      </div>
    </form>`);
}

// ── Helpers multi-fournisseurs ─────────────────────────────────────────────
function buildSupplierRows(suppliers) {
  if (suppliers.length === 0) return buildOneSupplierRow(0, null, true);
  return suppliers.map((s, i) => buildOneSupplierRow(i, s, s.is_primary)).join('');
}

function buildOneSupplierRow(i, s, isPrimary) {
  const opts = allSuppliers.map(sup =>
    `<option value="${sup.id}" ${s && s.supplier_id === sup.id ? "selected" : ""}>${esc(sup.name)}</option>`
  ).join('');
  return `<div class="supplier-row" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
    <select class="sup-select" style="flex:2;min-width:120px">
      <option value="">— Fournisseur —</option>${opts}
    </select>
    <input type="number" class="sup-price" step="0.001" placeholder="Prix HT €"
      style="width:90px" value="${s && s.purchase_price != null ? s.purchase_price : ''}"/>
    <label style="font-size:12px;white-space:nowrap;display:flex;align-items:center;gap:4px">
      <input type="radio" name="sup_primary" class="sup-primary" value="${i}" ${isPrimary ? "checked" : ""}/>
      Principal
    </label>
    <button type="button" class="btn btn-danger btn-sm" style="padding:4px 8px"
      onclick="this.closest('.supplier-row').remove()">✕</button>
  </div>`;
}

function addSupplierRow() {
  const list = document.getElementById('suppliers-list');
  const idx = list.querySelectorAll('.supplier-row').length;
  list.insertAdjacentHTML('beforeend', buildOneSupplierRow(idx, null, false));
}

function collectSuppliers() {
  const rows = document.querySelectorAll('#suppliers-list .supplier-row');
  const primaryRadio = document.querySelector('input[name="sup_primary"]:checked');
  const primaryIdx = primaryRadio ? parseInt(primaryRadio.value) : 0;
  const result = [];
  rows.forEach((row, i) => {
    const sid = row.querySelector('.sup-select')?.value;
    const price = row.querySelector('.sup-price')?.value;
    if (sid) result.push({
      supplier_id: parseInt(sid),
      purchase_price: price ? parseFloat(price) : null,
      is_primary: i === primaryIdx,
    });
  });
  return result;
}

async function submitProductForm(e, id) {
  e.preventDefault();
  const fd = new FormData(e.target);

  // Collecte les fournisseurs depuis le widget multi-lignes
  const suppliers = collectSuppliers();
  const primary = suppliers.find(s => s.is_primary) || suppliers[0];

  const body = {
    name:            fd.get("name"),
    category:        fd.get("category"),
    supplier_id:     primary?.supplier_id || null,
    stock:           parseFloat(fd.get("stock")) || 0,
    unit:            fd.get("unit"),
    qty_per_pack:    parseFloat(fd.get("qty_per_pack")) || 1,
    volume_cl:       parseFloat(fd.get("volume_cl")) || 70,
    alert_threshold: parseFloat(fd.get("alert_threshold")) || 2,
    purchase_price:  fd.get("purchase_price") ? parseFloat(fd.get("purchase_price")) : (primary?.purchase_price || null),
    sale_price_ttc:  fd.get("sale_price_ttc")  ? parseFloat(fd.get("sale_price_ttc"))  : null,
    is_estimated:    fd.get("is_estimated") === "on",
  };
  try {
    let pid = id;
    if (id) {
      await api(`/api/produits/${id}`, { method: "PUT", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) });
    } else {
      const created = await api("/api/produits", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) });
      pid = created.id;
    }
    // Sauvegarder les fournisseurs multi
    if (pid && suppliers.length > 0) {
      await api(`/api/products/${pid}/suppliers`, {
        method: "PUT",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify(suppliers),
      });
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
        <div style="font-size:15px;font-weight:700;color:var(--text-secondary);margin-bottom:6px">Glissez ou cliquez pour choisir</div>
        <small>JPG, PNG, PDF — max 10 Mo</small>
        <input type="file" id="delivery-file" accept="image/*,.pdf" onchange="setDeliveryFile(this)"/>
      </div>
      <div id="delivery-filename" style="font-size:12px;color:var(--text-muted);margin-top:6px"></div>
      <div style="margin-top:16px">
        <button class="btn btn-gold btn-lg" onclick="analyzeDelivery()" style="width:100%;justify-content:center">
          ✦ Analyser avec Claude AI
        </button>
      </div>
      <div id="delivery-result" style="margin-top:16px"></div>
    </div>
    <div style="margin-top:32px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <strong style="font-size:15px">📋 Derniers imports (7 jours)</strong>
        <button class="btn btn-sm" onclick="loadRecentImports()">🔄 Rafraîchir</button>
      </div>
      <div id="recent-imports-list">Chargement…</div>
    </div>

    <div style="margin-top:40px;border-top:2px solid #FEF2F2;padding-top:24px">
      <div style="font-size:13px;font-weight:700;color:#DC2626;margin-bottom:14px;letter-spacing:.5px;text-transform:uppercase">
        ⚠️ Zone d'administration
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <button class="btn" style="background:#FEF2F2;color:#DC2626;border:1px solid #FECACA;font-weight:600"
          onclick="adminResetStocks()">
          🔄 Remettre tous les stocks à 0
        </button>
        <button class="btn" style="background:#FEF2F2;color:#DC2626;border:1px solid #FECACA;font-weight:600"
          onclick="adminClearImports()">
          🗑 Supprimer tous les BL
        </button>
      </div>
    </div>`;

  const zone = document.getElementById("delivery-zone");
  zone.addEventListener("dragover", e => { e.preventDefault(); zone.classList.add("drag-over"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
  zone.addEventListener("drop", e => {
    e.preventDefault(); zone.classList.remove("drag-over");
    const f = e.dataTransfer.files[0];
    if (f) { document.getElementById("delivery-file").files = e.dataTransfer.files; setDeliveryFile({ files: [f] }); }
  });
  loadRecentImports();
}

async function loadRecentImports() {
  const container = document.getElementById("recent-imports-list");
  if (!container) return;
  try {
    const imports = await api("/api/imports/recent?days=7");
    if (imports.length === 0) {
      container.innerHTML = `<div style="color:var(--text-muted);font-size:13px;padding:8px 0">Aucun import ces 7 derniers jours.</div>`;
      return;
    }
    let html = '';
    imports.forEach(imp => {
      const annule = imp.annule;
      const supplierLabel = esc(imp.supplier || 'Fournisseur inconnu');
      const detailsJson = JSON.stringify(imp.details || []).replace(/'/g, "\\'").replace(/"/g, '&quot;');
      html += `<div class="import-preview" style="margin-bottom:10px;${annule ? 'opacity:0.55' : ''}cursor:pointer"
        onclick="showImportDetail(${imp.id}, '${esc(imp.reference)}', '${supplierLabel}', '${esc(imp.created_at)}', this)">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
          <div>
            <strong>${supplierLabel}</strong>
            <span style="color:var(--text-muted);font-size:12px;margin-left:8px">BL n°${esc(imp.reference)} — ${esc(imp.created_at)}</span>
            <span style="font-size:12px;margin-left:8px;color:var(--primary);font-weight:600">${imp.nb_produits} produit(s)</span>
            ${annule ? '<span style="background:#FEF2F2;color:#DC2626;font-size:11px;padding:2px 8px;border-radius:20px;margin-left:6px">Annulé</span>' : ''}
          </div>
          <div style="display:flex;gap:6px" onclick="event.stopPropagation()">
            <button class="btn btn-sm btn-outline" onclick="showImportDetail(${imp.id}, '${esc(imp.reference)}', '${supplierLabel}', '${esc(imp.created_at)}')">🔍 Détail</button>
            ${!annule ? `<button class="btn btn-sm" style="background:#FEF2F2;color:#DC2626;border:1px solid #FECACA"
              onclick="annulerImport(${imp.id}, '${esc(imp.reference)}', '${esc(imp.supplier)}')">↩ Annuler</button>` : ''}
          </div>
        </div>
        ${imp.details && imp.details.length > 0 ? `
        <div style="margin-top:8px;font-size:12px;color:var(--text-muted)">
          ${imp.details.slice(0,5).map(d => `${esc(d.product)} ${d.added > 0 ? '+' : ''}${d.added}`).join(' · ')}
          ${imp.details.length > 5 ? ` · <em>+${imp.details.length - 5} autres</em>` : ''}
        </div>` : ''}
      </div>`;
    });
    container.innerHTML = html;
  } catch(e) {
    container.innerHTML = `<div style="color:var(--text-muted);font-size:13px">Erreur : ${esc(e.message)}</div>`;
  }
}

let _currentImportDetail = null;

async function showImportDetail(importId, reference, supplier, date) {
  try {
    const data = await api(`/api/imports/${importId}/detail`);
    const details = Array.isArray(data.details) ? data.details : [];
    const notFound = Array.isArray(data.not_found) ? data.not_found : [];
    _currentImportDetail = { importId, reference, supplier, date, details, notFound, annule: !!data.annule };
    _renderImportDetailModal();
  } catch(e) {
    openModal(`<h3>Détail import</h3><div class="info-box">Erreur chargement : ${esc(e.message)}</div>`);
  }
}

function _renderImportDetailModal() {
  if (!_currentImportDetail) return;
  const { importId, reference, supplier, date, details, notFound, annule } = _currentImportDetail;

  const canEdit = !annule;

  const rows = details.map((d, i) => {
    const hasPid = d.product_id != null;
    const priceDisplay = d.old_price != null
      ? `${Number(d.old_price).toFixed(2)} €${d.new_price != null && d.new_price !== d.old_price ? ` → <strong>${Number(d.new_price).toFixed(2)} €</strong>` : ''}`
      : (d.new_price != null ? `<strong>${Number(d.new_price).toFixed(2)} €</strong>` : '—');
    const editBtns = canEdit && hasPid
      ? `<button class="btn btn-sm btn-outline" style="padding:2px 7px;font-size:12px" title="Modifier" onclick="editImportLine(${importId},${d.product_id},${i},${d.added},${d.new_price != null ? d.new_price : 'null'})">✏️</button>
         <button class="btn btn-sm" style="padding:2px 7px;font-size:12px;background:#FEF2F2;color:#DC2626;border:1px solid #FECACA" title="Supprimer" onclick="deleteImportLine(${importId},${d.product_id},'${esc(d.product)}',${d.added})">🗑</button>`
      : '';
    return `<tr id="bl-row-${i}">
      <td style="font-weight:600">${esc(d.product)}</td>
      <td style="color:${d.added < 0 ? '#DC2626' : 'var(--primary)'};font-weight:700;text-align:center">${d.added > 0 ? '+' : ''}${d.added}</td>
      <td style="color:var(--text-muted);text-align:right">${priceDisplay}</td>
      <td style="text-align:right;white-space:nowrap">${editBtns}</td>
    </tr>`;
  }).join('');

  const annuleBanner = annule
    ? `<div style="background:#FEF2F2;color:#DC2626;font-size:12px;padding:8px 12px;border-radius:8px;margin-bottom:12px">⚠️ Cet import a été annulé — modification impossible</div>`
    : '';

  const notFoundHtml = (notFound && notFound.length)
    ? `<div style="margin-top:16px;border-top:1px solid var(--border);padding-top:12px">
         <div style="color:#DC2626;font-weight:600;font-size:13px;margin-bottom:8px">
           ⚠️ ${notFound.length} produit(s) non reconnu(s) — à créer ou mapper
         </div>
         ${notFound.map(n => `
           <div style="display:flex;align-items:center;gap:8px;background:#FEF2F2;border:1px solid #FECACA;
                       border-radius:6px;padding:6px 10px;margin-bottom:4px;font-size:13px;color:#991B1B">
             <span>❌</span><span>${esc(n)}</span>
           </div>`).join('')}
       </div>`
    : '';

  openModal(`
    <h3>📋 Détail — ${esc(supplier)}</h3>
    <div style="color:var(--text-muted);font-size:12px;margin-bottom:12px">BL n°${esc(reference)} · ${esc(date)}</div>
    ${annuleBanner}
    ${rows.length
      ? `<div class="table-wrap"><table>
           <thead><tr><th>Produit</th><th style="text-align:center">Qté</th><th style="text-align:right">Prix achat</th><th></th></tr></thead>
           <tbody id="bl-tbody">${rows}</tbody>
         </table></div>`
      : '<div class="info-box">Aucun produit importé.</div>'}
    ${notFoundHtml}
  `);
}

function showAdminPinModal({ title, warning, confirmLabel, onConfirm }) {
  openModal(`
    <h3 style="color:#DC2626">${title}</h3>
    <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:12px 14px;margin:14px 0;font-size:13px;color:#991B1B;line-height:1.6">
      ${warning}
    </div>
    <div class="form-group" style="margin-bottom:16px">
      <label style="font-size:13px;font-weight:600">Code PIN gérant</label>
      <input id="admin-pin-input" type="password" inputmode="numeric" maxlength="8"
        placeholder="••••" autocomplete="off"
        style="margin-top:6px;width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;
               background:var(--surface);color:var(--text);font-size:15px;letter-spacing:4px"
        onkeydown="if(event.key==='Enter') _submitAdminPin()"/>
    </div>
    <div id="admin-pin-error" style="color:#DC2626;font-size:12px;margin-bottom:10px;display:none">Code incorrect</div>
    <div style="display:flex;gap:10px">
      <button class="btn" style="flex:1;background:#DC2626;color:#fff;font-weight:700;justify-content:center"
        onclick="_submitAdminPin()">${confirmLabel}</button>
      <button class="btn btn-outline" style="flex:1;justify-content:center" onclick="closeModal()">Annuler</button>
    </div>
  `);
  setTimeout(() => document.getElementById('admin-pin-input')?.focus(), 100);
  window._adminPinCallback = onConfirm;
}

async function _submitAdminPin() {
  const pin = document.getElementById('admin-pin-input')?.value || '';
  const errEl = document.getElementById('admin-pin-error');
  if (!pin) { if (errEl) { errEl.style.display='block'; errEl.textContent='Entrez le code PIN'; } return; }
  try {
    await window._adminPinCallback(pin);
    closeModal();
  } catch(e) {
    if (errEl) { errEl.style.display = 'block'; errEl.textContent = e.message || 'Code incorrect'; }
    const input = document.getElementById('admin-pin-input');
    if (input) { input.value = ''; input.focus(); }
  }
}

async function adminResetStocks() {
  showAdminPinModal({
    title: '🔄 Remettre tous les stocks à 0',
    warning: '⚠️ Cette action va mettre <strong>TOUS les stocks à zéro</strong>.<br>Les prix d\'achat et les bons de livraison ne seront pas modifiés.<br><strong>Action irréversible.</strong>',
    confirmLabel: 'Confirmer la remise à 0',
    onConfirm: async (pin) => {
      const res = await api("/api/admin/reset-stocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin })
      });
      allProducts = await api("/api/produits");
      updateAlertBadge();
      alert(`✓ ${res.products_reset} produit(s) remis à 0.`);
    }
  });
}

async function adminClearImports() {
  showAdminPinModal({
    title: '🗑 Supprimer tous les BL',
    warning: '⚠️ Cette action va supprimer <strong>tous les bons de livraison</strong>.<br>Les stocks <strong>ne seront PAS modifiés</strong>.<br><strong>Action irréversible.</strong>',
    confirmLabel: 'Confirmer la suppression',
    onConfirm: async (pin) => {
      const res = await api("/api/admin/clear-imports", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin })
      });
      loadRecentImports();
      alert(`✓ ${res.deleted} bon(s) de livraison supprimé(s).`);
    }
  });
}

async function deleteImportLine(importId, productId, productName, qty) {
  if (!confirm(`Supprimer la ligne "${productName}" (${qty > 0 ? '+' : ''}${qty}) ?\n\nLe stock sera ajusté en conséquence.`)) return;
  try {
    await api(`/api/imports/${importId}/lines/${productId}`, { method: "DELETE" });
    _currentImportDetail.details = _currentImportDetail.details.filter(d => d.product_id !== productId);
    _renderImportDetailModal();
    allProducts = await api("/api/produits");
    updateAlertBadge();
  } catch(e) {
    alert("Erreur suppression : " + e.message);
  }
}

function editImportLine(importId, productId, rowIndex, currentQty, currentPrice) {
  const row = document.getElementById(`bl-row-${rowIndex}`);
  if (!row) { alert("Erreur : ligne introuvable dans le DOM"); return; }
  const d = _currentImportDetail && _currentImportDetail.details[rowIndex];
  if (!d) { alert("Erreur : données de ligne introuvables"); return; }

  const priceVal = currentPrice != null && currentPrice !== 'null' ? currentPrice : '';
  row.innerHTML = `
    <td style="font-weight:600;font-size:12px">${esc(d.product)}</td>
    <td colspan="2" style="padding:4px 6px">
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        <label style="font-size:11px;color:var(--text-muted)">Qté</label>
        <input id="edit-qty-${rowIndex}" type="number" step="0.01" value="${currentQty}"
          style="width:70px;padding:4px 6px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);font-size:13px"/>
        <label style="font-size:11px;color:var(--text-muted)">Prix€</label>
        <input id="edit-price-${rowIndex}" type="number" step="0.01" value="${priceVal}" placeholder="inchangé"
          style="width:80px;padding:4px 6px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);font-size:13px"/>
      </div>
    </td>
    <td style="text-align:right;white-space:nowrap">
      <button class="btn btn-sm" style="padding:2px 8px;font-size:12px" onclick="saveImportLine(${importId},${productId},${rowIndex})">✓</button>
      <button class="btn btn-sm btn-outline" style="padding:2px 8px;font-size:12px" onclick="_renderImportDetailModal()">✕</button>
    </td>`;
}

async function saveImportLine(importId, productId, rowIndex) {
  const qtyEl = document.getElementById(`edit-qty-${rowIndex}`);
  const priceEl = document.getElementById(`edit-price-${rowIndex}`);
  if (!qtyEl) { alert("Erreur : champ quantité introuvable"); return; }

  const newQty = parseFloat(qtyEl.value);
  if (isNaN(newQty) || newQty < 0) { alert("Quantité invalide"); return; }
  const rawPrice = priceEl ? priceEl.value.trim() : '';
  const newPrice = rawPrice !== '' ? parseFloat(rawPrice) : null;
  if (rawPrice !== '' && isNaN(newPrice)) { alert("Prix invalide"); return; }

  try {
    await api(`/api/imports/${importId}/lines/${productId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ new_qty: newQty, new_price: newPrice })
    });
    const d = _currentImportDetail.details[rowIndex];
    if (d) {
      d.added = newQty;
      if (newPrice != null) d.new_price = newPrice;
    }
    _renderImportDetailModal();
    allProducts = await api("/api/produits");
    updateAlertBadge();
  } catch(e) {
    alert("Erreur sauvegarde : " + e.message);
  }
}

async function annulerImport(importId, reference, supplier) {
  if (!confirm(`Annuler l'import BL n°${reference} (${supplier}) ?\n\nLes quantités seront retirées du stock et les anciens prix restaurés.`)) return;
  try {
    const res = await api(`/api/imports/${importId}/annuler`, { method: "POST" });
    alert(`✓ Import annulé — ${res.reversed.length} produit(s) corrigés.`);
    allProducts = await api("/api/produits");
    updateAlertBadge();
    loadRecentImports();
  } catch(e) {
    alert("Erreur : " + e.message);
  }
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

    // Auto-remplir le fournisseur si détecté par le parser
    if (res.fournisseur) {
      const supField = document.getElementById("delivery-sup");
      if (supField && !supField.value.trim()) supField.value = res.fournisseur;
    }

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
  // Fallback unique si aucun numéro de facture saisi
  const rawFacture = document.getElementById("delivery-facture")?.value.trim()
    || products[0]?.numero_facture?.trim()
    || "";
  const numero_facture = rawFacture || `LIVRAISON-${new Date().toISOString().slice(0,16).replace("T","-")}`;
  const fournisseur    = document.getElementById("delivery-sup")?.value || "";

  // Zone d'erreur séparée (ne pas écraser le formulaire avec innerHTML +=)
  let errDiv = document.getElementById("delivery-error");
  if (!errDiv) {
    errDiv = document.createElement("div");
    errDiv.id = "delivery-error";
    errDiv.style.marginTop = "12px";
    document.getElementById("delivery-result").after(errDiv);
  }
  errDiv.innerHTML = "";

  try {
    const res = await api("/api/import/livraison/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ products, numero_facture, fournisseur }),
    });
    const isAvoir = res.is_avoir;
    const titre = isAvoir
      ? `↩️ Avoir / retour fournisseur enregistré — réf. ${esc(numero_facture)}`
      : `✅ Livraison confirmée — réf. ${esc(numero_facture)}`;
    let html = `<div class="import-preview" style="${isAvoir ? 'background:#FEF9EC;border-color:#F5C07A' : ''}">
      <h4>${titre}</h4>`;
    if (!res.updated?.length) {
      html += `<div style="color:var(--text-muted);font-size:13px">Aucun produit mis à jour (vérifiez les quantités).</div>`;
    } else {
      res.updated.forEach(u => {
        const sign = u.added > 0 ? "+" : "";
        html += `<div class="result-item"><span>${esc(u.product)}</span><span style="color:${u.added<0?'#DC2626':'var(--primary)'}">${sign}${u.added}</span></div>`;
      });
    }
    if (res.not_found?.length) html += `<div style="font-size:12px;color:var(--text-muted);margin-top:8px">⚠️ Non trouvés : ${res.not_found.map(esc).join(", ")}</div>`;
    html += `</div>`;
    document.getElementById("delivery-result").innerHTML = html;
    errDiv.remove();
    allProducts = await api("/api/produits");
    updateAlertBadge();
  } catch (e) {
    errDiv.innerHTML = `<div class="alert-card alert-high"><span class="alert-icon">❌</span><span class="alert-msg"><strong>Erreur :</strong> ${esc(e.message)}</span></div>`;
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
    <div id="reserve-result" style="margin-top:16px"></div>
    <div style="margin-top:24px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <strong style="font-size:14px">Sorties du jour</strong>
        <button class="btn btn-sm" onclick="loadSortiesToday()" style="font-size:12px">🔄 Rafraîchir</button>
      </div>
      <div id="sorties-today"></div>
    </div>`;
  loadReserveProducts();
  loadSortiesToday();
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

  try {
    const results = [];
    for (const s of sorties) {
      const prod = reserveProducts.find(p => p.id === s.product_id);
      const res = await api("/api/history/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: s.product_id,
          quantity: -s.qty,
          note: `Sortie réserve${staff ? " par " + staff : ""} : -${s.qty} ${prod?.unit || ""}`,
        }),
      });
      results.push({ history_id: res.history_id, name: prod?.name || "?", qty: s.qty, unit: prod?.unit || "", new_stock: res.new_stock });
    }

    // Affiche résumé avec bouton Annuler par ligne
    let html = `<div class="import-preview">
      <h4>📦 Sorties enregistrées (${results.length} produit${results.length > 1 ? 's' : ''})</h4>`;
    results.forEach(r => {
      html += `<div class="result-item" id="sortie-line-${r.history_id}">
        <span>${esc(r.name)} — <strong>−${r.qty} ${esc(r.unit)}</strong></span>
        <button class="btn btn-sm" style="background:#FEF2F2;color:#DC2626;border:1px solid #FECACA"
          onclick="annulerSortie(${r.history_id}, '${esc(r.name)}', ${r.qty})">↩ Annuler</button>
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
    await loadReserveProducts();
    await loadSortiesToday();
  } catch (e) { alert(e.message); }
}

async function annulerSortie(historyId, nom, qty) {
  if (!confirm(`Annuler la sortie de ${qty} × ${nom} ?`)) return;
  try {
    await api(`/api/sorties/annuler/${historyId}`, { method: "POST" });
    const line = document.getElementById(`sortie-line-${historyId}`);
    if (line) {
      line.innerHTML = `<span style="color:var(--text-muted);text-decoration:line-through">${esc(nom)}</span>
        <span style="color:#16A34A;font-size:12px">✓ Annulée</span>`;
    }
    allProducts = await api("/api/produits");
    updateAlertBadge();
    await loadReserveProducts();
    await loadSortiesToday();
  } catch (e) { alert("Erreur : " + e.message); }
}

async function loadSortiesToday() {
  const staff = document.getElementById("inv-staff")?.value || "";
  const container = document.getElementById("sorties-today");
  if (!container) return;
  try {
    const sorties = await api(`/api/sorties/today?staff=${encodeURIComponent(staff)}`);
    if (sorties.length === 0) {
      container.innerHTML = `<div style="color:var(--text-muted);font-size:13px;padding:8px 0">Aucune sortie aujourd'hui${staff ? " pour " + esc(staff) : ""}.</div>`;
      return;
    }
    let html = `<div class="import-preview" style="margin-top:0">
      <h4 style="margin-bottom:10px">🕐 Sorties du jour${staff ? " — " + esc(staff) : ""}</h4>`;
    sorties.forEach(s => {
      html += `<div class="result-item" id="sortie-line-${s.history_id}">
        <span style="font-size:13px"><strong>${esc(s.product)}</strong> — ${Math.abs(s.quantity)} sorti(s) à ${s.created_at}</span>
        <button class="btn btn-sm" style="background:#FEF2F2;color:#DC2626;border:1px solid #FECACA"
          onclick="annulerSortie(${s.history_id}, '${esc(s.product)}', ${Math.abs(s.quantity)})">↩ Corriger</button>
      </div>`;
    });
    html += `</div>`;
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = "";
  }
}

// ══════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════
// VIEW: STATISTIQUES
// ══════════════════════════════════════════════════════════
let _statsCharts = [];

async function renderStats(el) {
  el.innerHTML = `
    <div class="section-header">
      <span class="section-title">📊 Statistiques de consommation</span>
    </div>
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:20px;flex-wrap:wrap">
      <span style="font-weight:600;font-size:14px">Vue :</span>
      <button class="btn btn-primary stats-view-btn" data-view="live" onclick="switchStatsView('live')">Temps réel</button>
      <button class="btn btn-outline stats-view-btn" data-view="historique" onclick="switchStatsView('historique')">📅 Saison 2025</button>
      <label class="btn btn-outline" style="cursor:pointer;position:relative;overflow:hidden">
        ⬆ Importer saison
        <input type="file" accept=".xlsx" style="position:absolute;opacity:0;width:100%;height:100%;top:0;left:0;cursor:pointer;font-size:0"
          onchange="importHistorique(this)"/>
      </label>
    </div>
    <div id="stats-import-msg" style="margin-bottom:12px"></div>

    <div id="stats-live">
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:16px;flex-wrap:wrap">
        <span style="font-weight:600;font-size:13px">Période :</span>
        ${[7,30,90,180].map(d => `<button class="btn btn-outline stats-period-btn" data-days="${d}" onclick="loadStats(${d})">${d===7?'7j':d===30?'30j':d===90?'3 mois':'Saison'}</button>`).join('')}
      </div>
    </div>
    <div id="stats-histo" class="hidden"></div>
    <div id="stats-loading" style="color:var(--text-muted);padding:20px 0">Chargement…</div>
    <div id="stats-content" class="hidden" style="margin-top:4px">
      <div class="stock-summary" style="margin-bottom:24px" id="stats-kpi"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px" id="stats-charts-row">
        <div class="card" style="padding:16px">
          <div style="font-weight:600;margin-bottom:12px">Consommation par catégorie</div>
          <canvas id="chart-cat" height="220"></canvas>
        </div>
        <div class="card" style="padding:16px">
          <div style="font-weight:600;margin-bottom:12px">Évolution journalière</div>
          <canvas id="chart-daily" height="220"></canvas>
        </div>
      </div>
      <div class="card" style="padding:16px;margin-bottom:24px">
        <div style="font-weight:600;margin-bottom:12px">🏆 Top produits consommés</div>
        <canvas id="chart-top" height="300"></canvas>
      </div>
      <div class="card" style="padding:16px">
        <div style="font-weight:600;margin-bottom:12px">Détail par produit</div>
        <div id="stats-table"></div>
      </div>
    </div>`;
  loadStats(30);
}

function switchStatsView(view) {
  document.querySelectorAll(".stats-view-btn").forEach(b => {
    b.classList.toggle("btn-primary", b.dataset.view === view);
    b.classList.toggle("btn-outline", b.dataset.view !== view);
  });
  document.getElementById("stats-live").classList.toggle("hidden", view !== "live");
  document.getElementById("stats-histo").classList.toggle("hidden", view !== "historique");
  document.getElementById("stats-content").classList.toggle("hidden", view !== "live");
  document.getElementById("stats-loading").classList.add("hidden");
  if (view === "historique") loadHistorique();
}

async function importHistorique(input) {
  const file = input.files[0];
  if (!file) return;
  const msg = document.getElementById("stats-import-msg");
  msg.innerHTML = `<div class="info-box">⏳ Import en cours…</div>`;
  const fd = new FormData();
  fd.append("file", file);
  try {
    const res = await api("/api/stats/import-historique", { method: "POST", body: fd });
    msg.innerHTML = `<div class="info-box" style="background:#F0FDF4;border-color:#86EFAC">✅ ${res.imported} entrées importées (${res.mois} mois) depuis ${esc(res.source)}</div>`;
    loadHistorique();
    switchStatsView("historique");
  } catch(e) {
    msg.innerHTML = `<div class="info-box" style="background:#FEF2F2">❌ Erreur : ${esc(e.message)}</div>`;
  }
  input.value = "";
}

const MOIS_FR = {"01":"Jan","02":"Fév","03":"Mar","04":"Avr","05":"Mai","06":"Juin","07":"Juil","08":"Août","09":"Sept","10":"Oct","11":"Nov","12":"Déc"};
function fmtMois(m) { const [y,mo] = m.split("-"); return (MOIS_FR[mo]||mo)+" "+y; }

async function loadHistorique() {
  const container = document.getElementById("stats-histo");
  container.innerHTML = `<div style="color:var(--text-muted);padding:16px 0">Chargement…</div>`;
  try {
    const data = await api("/api/stats/historique");
    if (!data.monthly || !data.monthly.length) {
      container.innerHTML = `<div class="info-box">Aucune donnée historique. Cliquez sur "⬆ Importer saison" pour importer votre fichier Cashpad Synthèse.</div>`;
      return;
    }

    _statsCharts.forEach(c => c.destroy()); _statsCharts = [];
    const colors10 = ["#15803D","#16A34A","#4ADE80","#86EFAC","#FCD34D","#FB923C","#F87171","#A78BFA","#60A5FA","#34D399","#F472B6","#94A3B8"];

    container.innerHTML = `
    <!-- KPIs -->
    <div class="stock-summary" style="margin-bottom:24px">
      <div class="summary-card"><div class="s-label">Total vendu</div><div class="s-value">${data.total_qty.toLocaleString()}</div><div class="s-sub">unités saison</div></div>
      <div class="summary-card"><div class="s-label">CA total HT</div><div class="s-value">€${Math.round(data.total_ca).toLocaleString()}</div><div class="s-sub">hors taxes</div></div>
      <div class="summary-card"><div class="s-label">Mois record</div><div class="s-value">${fmtMois(data.peak_mois)}</div><div class="s-sub">${data.peak_qty.toLocaleString()} unités</div></div>
      <div class="summary-card"><div class="s-label">Références</div><div class="s-value">${data.nb_produits}</div><div class="s-sub">produits vendus</div></div>
    </div>

    <!-- Onglets internes -->
    <div style="display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap">
      ${["Vue globale","🏆 Top 20 par catégorie","🔻 30 moins vendus","📊 Catégories"].map((t,i)=>
        `<button class="btn ${i===0?'btn-primary':'btn-outline'} histo-tab-btn" data-tab="${i}" onclick="switchHistoTab(${i})">${t}</button>`
      ).join("")}
    </div>

    <!-- Tab 0 : Vue globale -->
    <div id="histo-tab-0">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
        <div class="card" style="padding:16px">
          <div style="font-weight:600;margin-bottom:10px">📅 Ventes mensuelles</div>
          <canvas id="histo-monthly" height="200"></canvas>
        </div>
        <div class="card" style="padding:16px">
          <div style="font-weight:600;margin-bottom:10px">CA par catégorie</div>
          <canvas id="histo-cat" height="200"></canvas>
        </div>
      </div>
      <div class="card" style="padding:16px">
        <div style="font-weight:600;margin-bottom:10px">🏆 Top 20 toutes catégories</div>
        <canvas id="histo-top20" height="360"></canvas>
      </div>
    </div>

    <!-- Tab 1 : Top 20 par catégorie -->
    <div id="histo-tab-1" class="hidden">
      <div id="histo-by-cat-content"></div>
    </div>

    <!-- Tab 2 : 30 moins vendus -->
    <div id="histo-tab-2" class="hidden">
      <div class="info-box" style="margin-bottom:12px">⚠️ Ces produits se vendent très peu — à revoir pour la prochaine saison (réduire les commandes ou retirer de la carte).</div>
      <div class="table-wrap"><table id="histo-bottom-table">
        <thead><tr><th>Rang</th><th>Produit</th><th>Catégorie</th><th>Qté vendue</th><th>CA HT</th></tr></thead>
        <tbody></tbody>
      </table></div>
    </div>

    <!-- Tab 3 : Catégories -->
    <div id="histo-tab-3" class="hidden">
      <div class="table-wrap"><table>
        <thead><tr><th>Catégorie</th><th>Qté vendue</th><th>CA HT</th><th>% du total</th></tr></thead>
        <tbody>${data.by_category.map(c=>`<tr>
          <td><strong>${esc(c.category)}</strong></td>
          <td>${c.qty.toLocaleString()}</td>
          <td>€${c.ca.toLocaleString()}</td>
          <td><div style="display:flex;align-items:center;gap:6px">
            <div style="background:#E5E7EB;border-radius:4px;height:8px;width:80px">
              <div style="background:#15803D;border-radius:4px;height:8px;width:${Math.round(c.qty/data.total_qty*80)}px"></div>
            </div>
            ${(c.qty/data.total_qty*100).toFixed(1)}%
          </div></td>
        </tr>`).join("")}</tbody>
      </table></div>
    </div>`;

    // Graphique mensuel
    const mCtx = document.getElementById("histo-monthly").getContext("2d");
    _statsCharts.push(new Chart(mCtx, {
      type: "bar",
      data: {
        labels: data.monthly.map(m => fmtMois(m.mois)),
        datasets: [
          { label: "Unités", data: data.monthly.map(m => m.qty), backgroundColor: "#15803D", borderRadius: 4, yAxisID: "y" },
          { label: "CA HT €", data: data.monthly.map(m => m.ca), type: "line", borderColor: "#F59E0B", backgroundColor: "rgba(245,158,11,0.1)", yAxisID: "y1", tension: 0.3, fill: true },
        ]
      },
      options: { responsive: true,
        scales: { y: { beginAtZero: true, position: "left" }, y1: { beginAtZero: true, position: "right", grid: { drawOnChartArea: false } } },
        plugins: { legend: { labels: { font: { size: 11 } } } }
      }
    }));

    // Donut catégories
    const cCtx = document.getElementById("histo-cat").getContext("2d");
    _statsCharts.push(new Chart(cCtx, {
      type: "doughnut",
      data: { labels: data.by_category.map(c => c.category), datasets: [{ data: data.by_category.map(c => c.ca), backgroundColor: colors10, borderWidth: 2 }] },
      options: { responsive: true, plugins: { legend: { position: "bottom", labels: { font: { size: 10 } } } } }
    }));

    // Top 20 barres
    const tCtx = document.getElementById("histo-top20").getContext("2d");
    _statsCharts.push(new Chart(tCtx, {
      type: "bar",
      data: {
        labels: data.top_products.map(p => p.name),
        datasets: [{ label: "Qté", data: data.top_products.map(p => p.qty), backgroundColor: "#15803D", borderRadius: 4 }]
      },
      options: { indexAxis: "y", responsive: true, plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true }, y: { ticks: { font: { size: 11 } } } } }
    }));

    // Tab 1 : par catégorie
    const catContainer = document.getElementById("histo-by-cat-content");
    let catHtml = "";
    const cats = Object.keys(data.by_cat_products).sort((a,b) => {
      const qa = data.by_cat_products[a].reduce((s,p)=>s+p.qty,0);
      const qb = data.by_cat_products[b].reduce((s,p)=>s+p.qty,0);
      return qb - qa;
    });
    cats.forEach(cat => {
      const prods = data.by_cat_products[cat];
      catHtml += `<div class="card" style="padding:16px;margin-bottom:14px">
        <div style="font-weight:700;font-size:15px;margin-bottom:10px;color:var(--primary)">${esc(cat)}</div>
        <div class="table-wrap"><table>
          <thead><tr><th>#</th><th>Produit</th><th>Qté vendue</th><th>CA HT</th><th>% total</th><th>Meilleur mois</th></tr></thead>
          <tbody>${prods.map((p,i) => {
            const bestMois = Object.entries(p.par_mois||{}).sort((a,b)=>b[1]-a[1])[0];
            return `<tr>
              <td><strong style="color:${i<3?'#15803D':'var(--text-muted)'}">${i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`}</strong></td>
              <td><strong>${esc(p.name)}</strong></td>
              <td>${p.qty.toLocaleString()}</td>
              <td>€${p.ca.toLocaleString()}</td>
              <td><span style="background:#F0FDF4;color:#15803D;padding:2px 6px;border-radius:10px;font-size:11px">${p.pct}%</span></td>
              <td style="font-size:12px;color:var(--text-muted)">${bestMois ? fmtMois(bestMois[0])+" ("+bestMois[1]+")" : "—"}</td>
            </tr>`;
          }).join("")}</tbody>
        </table></div>
      </div>`;
    });
    catContainer.innerHTML = catHtml || `<div class="info-box">Aucune donnée.</div>`;

    // Tab 2 : 30 moins vendus
    const bottomTbody = document.querySelector("#histo-bottom-table tbody");
    bottomTbody.innerHTML = data.bottom_products.map((p,i) => `<tr>
      <td style="color:var(--text-muted)">#${i+1}</td>
      <td>${esc(p.name)}</td>
      <td><span style="background:#F3F4F6;padding:2px 6px;border-radius:10px;font-size:11px">${esc(p.category)}</span></td>
      <td style="color:#DC2626;font-weight:600">${p.qty}</td>
      <td>€${p.ca}</td>
    </tr>`).join("");

  } catch(e) {
    container.innerHTML = `<div class="info-box">Erreur : ${esc(e.message)}</div>`;
  }
}

function switchHistoTab(tab) {
  document.querySelectorAll(".histo-tab-btn").forEach(b => {
    b.classList.toggle("btn-primary", parseInt(b.dataset.tab) === tab);
    b.classList.toggle("btn-outline", parseInt(b.dataset.tab) !== tab);
  });
  [0,1,2,3].forEach(i => {
    const el = document.getElementById(`histo-tab-${i}`);
    if (el) el.classList.toggle("hidden", i !== tab);
  });
}

async function loadStats(days) {
  // Met à jour le bouton actif
  document.querySelectorAll(".stats-period-btn").forEach(b => {
    b.classList.toggle("btn-primary", parseInt(b.dataset.days) === days);
    b.classList.toggle("btn-outline", parseInt(b.dataset.days) !== days);
  });

  document.getElementById("stats-loading").classList.remove("hidden");
  document.getElementById("stats-content").classList.add("hidden");

  // Détruit les anciens graphiques
  _statsCharts.forEach(c => c.destroy());
  _statsCharts = [];

  try {
    const data = await api(`/api/stats/consommation?periode=${days}`);
    document.getElementById("stats-loading").classList.add("hidden");
    document.getElementById("stats-content").classList.remove("hidden");

    // KPI
    document.getElementById("stats-kpi").innerHTML = `
      <div class="summary-card">
        <div class="s-label">Mouvements totaux</div>
        <div class="s-value">${data.total.toFixed(0)}</div>
        <div class="s-sub">unités consommées</div>
      </div>
      <div class="summary-card">
        <div class="s-label">Produits actifs</div>
        <div class="s-value">${data.top_products.length}</div>
        <div class="s-sub">sur ${days} jours</div>
      </div>
      <div class="summary-card">
        <div class="s-label">Catégories</div>
        <div class="s-value">${data.by_category.length}</div>
        <div class="s-sub">concernées</div>
      </div>
      <div class="summary-card">
        <div class="s-label">Moy. / jour</div>
        <div class="s-value">${(data.total / days).toFixed(1)}</div>
        <div class="s-sub">unités</div>
      </div>`;

    // Graphique catégories (donut)
    const catCtx = document.getElementById("chart-cat").getContext("2d");
    const colors = ["#15803D","#16A34A","#4ADE80","#86EFAC","#BBF7D0","#DCFCE7","#FCD34D","#FB923C","#F87171","#A78BFA"];
    _statsCharts.push(new Chart(catCtx, {
      type: "doughnut",
      data: {
        labels: data.by_category.map(c => c.category),
        datasets: [{ data: data.by_category.map(c => c.qty), backgroundColor: colors, borderWidth: 2 }]
      },
      options: { responsive: true, plugins: { legend: { position: "bottom", labels: { font: { size: 11 } } } } }
    }));

    // Graphique journalier (ligne)
    const dailyCtx = document.getElementById("chart-daily").getContext("2d");
    _statsCharts.push(new Chart(dailyCtx, {
      type: "line",
      data: {
        labels: data.daily.map(d => d.date.slice(5)),  // MM-DD
        datasets: [{
          label: "Unités", data: data.daily.map(d => d.qty),
          borderColor: "#15803D", backgroundColor: "rgba(21,128,61,0.08)",
          fill: true, tension: 0.3, pointRadius: 2,
        }]
      },
      options: { responsive: true, plugins: { legend: { display: false } },
        scales: { x: { ticks: { font: { size: 10 }, maxTicksLimit: 10 } }, y: { beginAtZero: true } } }
    }));

    // Top produits (barres horizontales)
    const top15 = data.top_products.slice(0, 15);
    const topCtx = document.getElementById("chart-top").getContext("2d");
    _statsCharts.push(new Chart(topCtx, {
      type: "bar",
      data: {
        labels: top15.map(p => p.name),
        datasets: [{ label: "Quantité", data: top15.map(p => p.qty), backgroundColor: "#15803D", borderRadius: 4 }]
      },
      options: {
        indexAxis: "y", responsive: true,
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true }, y: { ticks: { font: { size: 11 } } } }
      }
    }));

    // Tableau détail
    let thtml = `<div class="table-wrap"><table><thead><tr>
      <th>Produit</th><th>Catégorie</th><th>Quantité consommée</th>
    </tr></thead><tbody>`;
    data.top_products.forEach(p => {
      thtml += `<tr>
        <td><strong>${esc(p.name)}</strong></td>
        <td>${esc(p.category)}</td>
        <td>${p.qty}</td>
      </tr>`;
    });
    thtml += `</tbody></table></div>`;
    document.getElementById("stats-table").innerHTML = thtml;

  } catch(e) {
    document.getElementById("stats-loading").textContent = "Erreur : " + e.message;
  }
}

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

  // Produits en carton → stock en unités individuelles, afficher cartons en info secondaire
  if (qty > 1) {
    const u = Math.abs(stock) % 1 < 0.05 ? Math.round(stock) : parseFloat(stock.toFixed(1));
    const cartons = parseFloat((stock / qty).toFixed(2));
    return `<span>${u < 0 ? '<span style="color:#DC2626">⚠ ' + u + '</span>' : u} unités</span>
            <small style="color:var(--text-faint);display:block;font-size:11px">${cartons} Carton ${qty}</small>`;
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
