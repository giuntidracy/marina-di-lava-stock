import json
import random
import base64
import io
import os
import secrets
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

# Fuseau horaire local (Corse / métropole France)
_LOCAL_TZ = ZoneInfo("Europe/Paris")

def to_local(dt: datetime) -> datetime:
    """Convertit un datetime UTC naïf en heure locale Europe/Paris."""
    if dt is None:
        return dt
    return dt.replace(tzinfo=timezone.utc).astimezone(_LOCAL_TZ)
from dotenv import load_dotenv
load_dotenv(override=True)
from typing import Optional, List
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel

# ── Sessions en mémoire ────────────────────────────────────────────────────
_sessions: dict = {}       # token → {role, expires}
_pin_failures: dict = {}   # ip → {count, locked_until}

from database import get_db, engine
from models import (
    Base, Supplier, Product, Cocktail, CocktailIngredient,
    CashpadMapping, ImportLog, StockHistory, InventorySession
)

Base.metadata.create_all(bind=engine)

# Migration : ajoute details_json à imports_log si absent
from sqlalchemy import text as _text
with engine.connect() as _conn:
    try:
        _conn.execute(_text("ALTER TABLE imports_log ADD COLUMN details_json TEXT DEFAULT '[]'"))
        _conn.commit()
    except Exception:
        pass  # colonne déjà présente

app = FastAPI(title="Marina di Lava — Gestion Stock")
app.mount("/static", StaticFiles(directory="static"), name="static")


# ── Middleware auth ────────────────────────────────────────────────────────
OPEN_PATHS = {"/api/auth", "/api/auth/service"}

@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    path = request.url.path
    # Laisser passer : pages HTML, assets statiques, endpoints d'auth
    if not path.startswith("/api/") or path in OPEN_PATHS:
        return await call_next(request)
    # Vérifier le token
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else ""
    session = _sessions.get(token)
    if not session:
        return JSONResponse({"detail": "Non authentifié"}, status_code=401)
    if datetime.utcnow() > session["expires"]:
        _sessions.pop(token, None)
        return JSONResponse({"detail": "Session expirée"}, status_code=401)
    # Renouvelle la session à chaque appel (inactivité 30 min)
    session["expires"] = datetime.utcnow() + timedelta(minutes=30)
    return await call_next(request)


# ── helpers ────────────────────────────────────────────────────────────────

def calc_product(p: Product) -> dict:
    cout_unitaire = None
    marge = None
    marge_color = "gray"
    valeur_stock = None

    if p.purchase_price is not None and p.qty_per_pack:
        cout_unitaire = p.purchase_price / p.qty_per_pack
        valeur_stock = p.stock * cout_unitaire

    if cout_unitaire is not None and p.sale_price_ttc:
        prix_ht = p.sale_price_ttc / 1.10
        if prix_ht > 0:
            marge = (prix_ht - cout_unitaire) / prix_ht * 100
            if marge >= 70:
                marge_color = "green"
            elif marge >= 50:
                marge_color = "orange"
            else:
                marge_color = "red"

    if p.is_estimated:
        marge_color = "gray"

    return {
        "id": p.id,
        "nom": p.name,
        "name": p.name,
        "categorie": p.category,
        "category": p.category,
        "fournisseur_id": p.supplier_id,
        "supplier_id": p.supplier_id,
        "fournisseur_nom": p.supplier_rel.name if p.supplier_rel else "",
        "supplier_name": p.supplier_rel.name if p.supplier_rel else "",
        "stock": p.stock,
        "unite": p.unit,
        "unit": p.unit,
        "qte_conditionnement": p.qty_per_pack,
        "qty_per_pack": p.qty_per_pack,
        "volume_cl": p.volume_cl,
        "seuil_alerte": p.alert_threshold,
        "alert_threshold": p.alert_threshold,
        "prix_achat_ht": p.purchase_price,
        "purchase_price": p.purchase_price,
        "prix_vente_ttc": p.sale_price_ttc,
        "sale_price_ttc": p.sale_price_ttc,
        "prix_estime": p.is_estimated,
        "is_estimated": p.is_estimated,
        "cout_unitaire": round(cout_unitaire, 4) if cout_unitaire is not None else None,
        "marge": round(marge, 1) if marge is not None else None,
        "marge_color": marge_color,
        "valeur_stock": round(valeur_stock, 2) if valeur_stock is not None else None,
    }


def calc_cocktail(c: Cocktail) -> dict:
    cout_matiere = 0.0
    ingredients_detail = []
    for ing in c.ingredients:
        p = ing.product
        if p and p.purchase_price is not None and p.qty_per_pack and p.volume_cl:
            cout_cl = (p.purchase_price / p.qty_per_pack) / p.volume_cl
            cost = cout_cl * ing.dose_cl
            cout_matiere += cost
            ingredients_detail.append({
                "product_id": p.id,
                "produit_id": p.id,
                "product_name": p.name,
                "produit_nom": p.name,
                "dose_cl": ing.dose_cl,
                "cost": round(cost, 4),
            })
        else:
            ingredients_detail.append({
                "product_id": ing.product_id,
                "produit_id": ing.product_id,
                "product_name": p.name if p else "?",
                "produit_nom": p.name if p else "?",
                "dose_cl": ing.dose_cl,
                "cost": None,
            })

    marge = None
    marge_color = "gray"
    prix_vente_ht = None
    if c.sale_price_ttc:
        prix_vente_ht = c.sale_price_ttc / 1.10
        if prix_vente_ht > 0 and cout_matiere is not None:
            marge = (prix_vente_ht - cout_matiere) / prix_vente_ht * 100
            if marge >= 70:
                marge_color = "green"
            elif marge >= 50:
                marge_color = "orange"
            else:
                marge_color = "red"

    return {
        "id": c.id,
        "nom": c.name,
        "name": c.name,
        "prix_vente_ttc": c.sale_price_ttc,
        "sale_price_ttc": c.sale_price_ttc,
        "prix_vente_ht": round(prix_vente_ht, 4) if prix_vente_ht else None,
        "cout_matiere": round(cout_matiere, 4),
        "marge": round(marge, 1) if marge is not None else None,
        "marge_color": marge_color,
        "ingredients": ingredients_detail,
    }


def log_event(db: Session, event_type: str, description: str, data: dict = None):
    h = StockHistory(
        event_type=event_type,
        description=description,
        data_json=json.dumps(data or {}, ensure_ascii=False),
    )
    db.add(h)
    db.flush()  # pour obtenir h.id immédiatement
    return h


# ── root ───────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return FileResponse("static/index.html")


class PinIn(BaseModel):
    pin: str

@app.post("/api/auth/service")
def auth_service():
    """Connexion service — pas de PIN, accès limité."""
    token = secrets.token_urlsafe(32)
    _sessions[token] = {"role": "service", "expires": datetime.utcnow() + timedelta(minutes=30)}
    return {"ok": True, "role": "service", "token": token}

@app.post("/api/auth")
def auth_pin(body: PinIn, request: Request):
    """Connexion gérant — vérifie PIN avec anti-brute-force."""
    ip = request.client.host if request.client else "unknown"
    failure = _pin_failures.get(ip, {})
    locked_until = failure.get("locked_until")
    if locked_until and datetime.utcnow() < locked_until:
        secs = int((locked_until - datetime.utcnow()).total_seconds())
        raise HTTPException(429, f"Trop de tentatives. Réessayez dans {secs}s")

    manager_pin = os.environ.get("MANAGER_PIN", "1234")
    if body.pin == manager_pin:
        _pin_failures.pop(ip, None)
        token = secrets.token_urlsafe(32)
        _sessions[token] = {"role": "manager", "expires": datetime.utcnow() + timedelta(minutes=30)}
        return {"ok": True, "role": "manager", "token": token}

    count = failure.get("count", 0) + 1
    if count >= 3:
        _pin_failures[ip] = {"count": count, "locked_until": datetime.utcnow() + timedelta(minutes=15)}
        raise HTTPException(429, "3 erreurs — accès bloqué 15 minutes")
    else:
        _pin_failures[ip] = {"count": count}
        remaining = 3 - count
        raise HTTPException(401, f"Code PIN incorrect — {remaining} tentative(s) restante(s)")


# ══════════════════════════════════════════════════════════════════════════
# FOURNISSEURS / SUPPLIERS
# ══════════════════════════════════════════════════════════════════════════

class SupplierIn(BaseModel):
    name: str
    contact: str = ""
    phone: str = ""
    categories: str = ""


def _supplier_dict(s: Supplier) -> dict:
    return {
        "id": s.id,
        "nom": s.name,
        "name": s.name,
        "contact": s.contact,
        "telephone": s.phone,
        "phone": s.phone,
        "categories": s.categories,
    }


@app.get("/api/fournisseurs")
@app.get("/api/suppliers")
def get_suppliers(db: Session = Depends(get_db)):
    return [_supplier_dict(s) for s in db.query(Supplier).all()]


@app.post("/api/fournisseurs")
@app.post("/api/suppliers")
def create_supplier(body: SupplierIn, db: Session = Depends(get_db)):
    s = Supplier(**body.model_dump())
    db.add(s)
    db.commit()
    db.refresh(s)
    return _supplier_dict(s)


@app.put("/api/fournisseurs/{sid}")
@app.put("/api/suppliers/{sid}")
def update_supplier(sid: int, body: SupplierIn, db: Session = Depends(get_db)):
    s = db.query(Supplier).get(sid)
    if not s:
        raise HTTPException(404)
    for k, v in body.model_dump().items():
        setattr(s, k, v)
    db.commit()
    return {"ok": True}


@app.delete("/api/fournisseurs/{sid}")
@app.delete("/api/suppliers/{sid}")
def delete_supplier(sid: int, db: Session = Depends(get_db)):
    s = db.query(Supplier).get(sid)
    if not s:
        raise HTTPException(404)
    db.delete(s)
    db.commit()
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════
# PRODUITS / PRODUCTS
# ══════════════════════════════════════════════════════════════════════════

class ProductIn(BaseModel):
    name: str
    category: str
    supplier_id: Optional[int] = None
    stock: float = 0
    unit: str = "Bouteille"
    qty_per_pack: float = 1
    volume_cl: float = 70
    alert_threshold: float = 2
    purchase_price: Optional[float] = None
    sale_price_ttc: Optional[float] = None
    is_estimated: bool = False


@app.get("/api/produits")
@app.get("/api/products")
def get_products(db: Session = Depends(get_db)):
    products = db.query(Product).all()
    return [calc_product(p) for p in products]


@app.post("/api/produits")
@app.post("/api/products")
def create_product(body: ProductIn, db: Session = Depends(get_db)):
    p = Product(**body.model_dump())
    db.add(p)
    db.commit()
    db.refresh(p)
    return calc_product(p)


@app.put("/api/produits/{pid}")
@app.put("/api/products/{pid}")
def update_product(pid: int, body: ProductIn, db: Session = Depends(get_db)):
    p = db.query(Product).get(pid)
    if not p:
        raise HTTPException(404)
    for k, v in body.model_dump().items():
        setattr(p, k, v)
    p.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(p)
    return calc_product(p)


@app.delete("/api/produits/{pid}")
@app.delete("/api/products/{pid}")
def delete_product(pid: int, db: Session = Depends(get_db)):
    p = db.query(Product).get(pid)
    if not p:
        raise HTTPException(404)
    db.delete(p)
    db.commit()
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════
# RECETTES / COCKTAILS
# ══════════════════════════════════════════════════════════════════════════

class IngredientIn(BaseModel):
    product_id: int
    dose_cl: float


class CocktailIn(BaseModel):
    name: str
    sale_price_ttc: Optional[float] = None
    ingredients: List[IngredientIn] = []


@app.get("/api/recettes")
@app.get("/api/cocktails")
def get_cocktails(db: Session = Depends(get_db)):
    return [calc_cocktail(c) for c in db.query(Cocktail).all()]


@app.post("/api/recettes")
@app.post("/api/cocktails")
def create_cocktail(body: CocktailIn, db: Session = Depends(get_db)):
    c = Cocktail(name=body.name, sale_price_ttc=body.sale_price_ttc)
    db.add(c)
    db.flush()
    for ing in body.ingredients:
        db.add(CocktailIngredient(cocktail_id=c.id, product_id=ing.product_id, dose_cl=ing.dose_cl))
    db.commit()
    db.refresh(c)
    return calc_cocktail(c)


@app.put("/api/recettes/{cid}")
@app.put("/api/cocktails/{cid}")
def update_cocktail(cid: int, body: CocktailIn, db: Session = Depends(get_db)):
    c = db.query(Cocktail).get(cid)
    if not c:
        raise HTTPException(404)
    c.name = body.name
    c.sale_price_ttc = body.sale_price_ttc
    db.query(CocktailIngredient).filter(CocktailIngredient.cocktail_id == cid).delete()
    for ing in body.ingredients:
        db.add(CocktailIngredient(cocktail_id=c.id, product_id=ing.product_id, dose_cl=ing.dose_cl))
    db.commit()
    db.refresh(c)
    return calc_cocktail(c)


@app.delete("/api/recettes/{cid}")
@app.delete("/api/cocktails/{cid}")
def delete_cocktail(cid: int, db: Session = Depends(get_db)):
    c = db.query(Cocktail).get(cid)
    if not c:
        raise HTTPException(404)
    db.delete(c)
    db.commit()
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════
# ALERTES
# ══════════════════════════════════════════════════════════════════════════

@app.get("/api/alertes")
@app.get("/api/alerts")
def get_alerts(db: Session = Depends(get_db)):
    alerts = []
    for p in db.query(Product).all():
        if p.stock == 0:
            alerts.append({
                "type": "rupture",
                "product": p.name,
                "message": f"Rupture de stock : {p.name}",
                "severity": "high"
            })
        elif p.stock <= p.alert_threshold:
            alerts.append({
                "type": "stock_bas",
                "product": p.name,
                "message": f"Stock bas : {p.name} ({p.stock} {p.unit})",
                "severity": "medium"
            })
        if p.purchase_price and p.sale_price_ttc and p.qty_per_pack:
            cout = p.purchase_price / p.qty_per_pack
            ht = p.sale_price_ttc / 1.10
            if ht > 0:
                marge = (ht - cout) / ht * 100
                if marge < 50 and not p.is_estimated:
                    alerts.append({
                        "type": "marge",
                        "product": p.name,
                        "message": f"Marge insuffisante : {p.name} ({marge:.1f}%)",
                        "severity": "medium"
                    })
    # Also fetch inventory gap alerts from recent history
    recent_inv = db.query(StockHistory).filter(
        StockHistory.event_type == "alerte_inventaire"
    ).order_by(StockHistory.created_at.desc()).limit(10).all()
    for h in recent_inv:
        try:
            data = json.loads(h.data_json)
            alerts.append({
                "type": "ecart_inventaire",
                "product": data.get("product", ""),
                "message": f"Écart inventaire : {data.get('product', '')} (écart {data.get('diff', 0):+.3f})",
                "severity": "high",
                "date": h.created_at.isoformat() + "Z",
            })
        except Exception:
            pass
    return alerts


# ══════════════════════════════════════════════════════════════════════════
# HISTORIQUE
# ══════════════════════════════════════════════════════════════════════════

@app.get("/api/historique")
@app.get("/api/history")
def get_history(db: Session = Depends(get_db)):
    events = db.query(StockHistory).order_by(StockHistory.created_at.desc()).limit(200).all()
    return [
        {
            "id": e.id,
            "event_type": e.event_type,
            "description": e.description,
            "data": json.loads(e.data_json),
            "created_at": e.created_at.isoformat() + "Z",
        }
        for e in events
    ]


class ManualMovementIn(BaseModel):
    product_id: int
    quantity: float
    note: str = ""


@app.post("/api/history/manual")
def manual_movement(body: ManualMovementIn, db: Session = Depends(get_db)):
    p = db.query(Product).get(body.product_id)
    if not p:
        raise HTTPException(404)
    old = p.stock
    p.stock += body.quantity
    db.commit()
    data = {"product_id": p.id, "product": p.name, "old_stock": old, "new_stock": p.stock,
            "quantity": body.quantity, "note": body.note or ""}
    h = log_event(db, "mouvement_manuel", f"Mouvement manuel : {p.name} ({'+' if body.quantity >= 0 else ''}{body.quantity})", data)
    db.commit()
    return {"ok": True, "new_stock": p.stock, "history_id": h.id}


@app.get("/api/sorties/today")
def sorties_today(staff: str = "", db: Session = Depends(get_db)):
    """Retourne les sorties réserve du jour, filtrées par prénom si fourni."""
    from datetime import date
    today_start = datetime.combine(date.today(), datetime.min.time())
    rows = db.query(StockHistory).filter(
        StockHistory.event_type == "mouvement_manuel",
        StockHistory.created_at >= today_start
    ).order_by(StockHistory.created_at.desc()).all()

    result = []
    for r in rows:
        try:
            d = json.loads(r.data_json)
        except Exception:
            continue
        if d.get("quantity", 0) >= 0:
            continue  # garder seulement les sorties (négatif)
        note = d.get("note", "")
        if staff and staff.lower() not in note.lower():
            continue
        result.append({
            "history_id": r.id,
            "product_id": d.get("product_id"),
            "product": d.get("product", "?"),
            "quantity": d.get("quantity", 0),
            "note": note,
            "created_at": to_local(r.created_at).strftime("%H:%M"),
        })
    return result


@app.post("/api/sorties/annuler/{history_id}")
def annuler_sortie(history_id: int, db: Session = Depends(get_db)):
    """Annule une sortie en créant un mouvement inverse."""
    h = db.query(StockHistory).get(history_id)
    if not h or h.event_type != "mouvement_manuel":
        raise HTTPException(404, "Sortie introuvable")
    try:
        d = json.loads(h.data_json)
    except Exception:
        raise HTTPException(400, "Données invalides")
    qty = d.get("quantity", 0)
    if qty >= 0:
        raise HTTPException(400, "Ce n'est pas une sortie")
    product_id = d.get("product_id")
    p = db.query(Product).get(product_id)
    if not p:
        raise HTTPException(404, "Produit introuvable")
    old = p.stock
    p.stock -= qty  # inverse : réintègre la quantité
    db.commit()
    log_event(db, "mouvement_manuel",
              f"Annulation sortie : {p.name} (+{abs(qty)})",
              {"product_id": p.id, "product": p.name, "old_stock": old,
               "new_stock": p.stock, "quantity": abs(qty), "note": f"Annulation de la sortie #{history_id}"})
    db.commit()
    return {"ok": True, "new_stock": p.stock}


# ══════════════════════════════════════════════════════════════════════════
# CASHPAD MAPPING
# ══════════════════════════════════════════════════════════════════════════

class MappingIn(BaseModel):
    nom_cashpad: str
    product_id: Optional[int] = None
    cocktail_id: Optional[int] = None
    dose_cl: float = 0
    mapping_type: str = "direct"
    ignored: bool = False


def _mapping_dict(r: CashpadMapping) -> dict:
    return {
        "id": r.id,
        "nom_cashpad": r.nom_cashpad,
        "product_id": r.product_id,
        "cocktail_id": r.cocktail_id,
        "dose_cl": r.dose_cl,
        "type": r.mapping_type,
        "mapping_type": r.mapping_type,
        "ignore": r.ignored,
        "ignored": r.ignored,
        "product_name": r.product.name if r.product else None,
        "cocktail_name": db_cocktail_name(r),
    }


def db_cocktail_name(r: CashpadMapping) -> Optional[str]:
    return None  # resolved in route if needed


@app.get("/api/cashpad_mapping")
@app.get("/api/cashpad-mapping")
def get_mapping(db: Session = Depends(get_db)):
    rows = db.query(CashpadMapping).all()
    result = []
    cocktail_names = {}
    for c in db.query(Cocktail).all():
        cocktail_names[c.id] = c.name
    for r in rows:
        result.append({
            "id": r.id,
            "nom_cashpad": r.nom_cashpad,
            "product_id": r.product_id,
            "cocktail_id": r.cocktail_id,
            "dose_cl": r.dose_cl,
            "type": r.mapping_type,
            "mapping_type": r.mapping_type,
            "ignore": r.ignored,
            "ignored": r.ignored,
            "product_name": r.product.name if r.product else None,
            "cocktail_name": cocktail_names.get(r.cocktail_id) if r.cocktail_id else None,
        })
    return result


@app.post("/api/cashpad_mapping")
@app.post("/api/cashpad-mapping")
def create_mapping(body: MappingIn, db: Session = Depends(get_db)):
    m = CashpadMapping(
        nom_cashpad=body.nom_cashpad,
        product_id=body.product_id,
        cocktail_id=body.cocktail_id,
        dose_cl=body.dose_cl,
        mapping_type=body.mapping_type,
        ignored=body.ignored,
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return {"id": m.id}


@app.put("/api/cashpad_mapping/{mid}")
@app.put("/api/cashpad-mapping/{mid}")
def update_mapping(mid: int, body: MappingIn, db: Session = Depends(get_db)):
    m = db.query(CashpadMapping).get(mid)
    if not m:
        raise HTTPException(404)
    m.nom_cashpad = body.nom_cashpad
    m.product_id = body.product_id
    m.cocktail_id = body.cocktail_id
    m.dose_cl = body.dose_cl
    m.mapping_type = body.mapping_type
    m.ignored = body.ignored
    db.commit()
    return {"ok": True}


@app.delete("/api/cashpad_mapping/{mid}")
@app.delete("/api/cashpad-mapping/{mid}")
def delete_mapping(mid: int, db: Session = Depends(get_db)):
    m = db.query(CashpadMapping).get(mid)
    if not m:
        raise HTTPException(404)
    db.delete(m)
    db.commit()
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════
# IMPORT CASHPAD
# ══════════════════════════════════════════════════════════════════════════

@app.post("/api/import/cashpad")
async def import_cashpad(
    file: UploadFile = File(...),
    numero_cloture: str = Form(""),
    db: Session = Depends(get_db),
):
    if numero_cloture:
        existing = db.query(ImportLog).filter(
            ImportLog.import_type == "cashpad",
            ImportLog.reference == numero_cloture,
        ).first()
        if existing:
            raise HTTPException(
                400,
                detail=f"Clôture n°{numero_cloture} déjà importée le {to_local(existing.created_at).strftime('%d/%m/%Y %H:%M')}."
            )

    import openpyxl
    content = await file.read()
    wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)

    # find sheet — prefer "Ventes-par-produit-2"
    sheet = None
    for sname in wb.sheetnames:
        if "Ventes-par-produit-2" in sname:
            sheet = wb[sname]
            break
    if sheet is None:
        for sname in wb.sheetnames:
            if "ventes" in sname.lower() or "produit" in sname.lower():
                sheet = wb[sname]
                break
    if sheet is None:
        sheet = wb.active

    # build mapping index
    mappings = {m.nom_cashpad.strip().lower(): m for m in db.query(CashpadMapping).all()}

    deductions = []
    alerts_triggered = []
    unknown_products = []

    for row in sheet.iter_rows(min_row=2, values_only=True):
        if not row or not row[1]:
            continue
        product_name = str(row[1]).strip()
        # quantity is at column index 6
        try:
            qty_sold = float(row[6]) if len(row) > 6 and row[6] is not None else 0
        except (ValueError, TypeError):
            qty_sold = 0
        if qty_sold <= 0:
            continue

        key = product_name.lower()
        mapping = mappings.get(key)
        if not mapping:
            unknown_products.append(product_name)
            continue
        if mapping.ignored:
            continue

        if mapping.mapping_type == "cocktail" and mapping.cocktail_id:
            cocktail = db.query(Cocktail).get(mapping.cocktail_id)
            if cocktail:
                for ing in cocktail.ingredients:
                    p = ing.product
                    if p and p.volume_cl and p.qty_per_pack:
                        # volume total du conditionnement (ex: Carton 24 x 33cl = 792cl)
                        total_vol = p.volume_cl * p.qty_per_pack
                        deduct = (ing.dose_cl / total_vol) * qty_sold
                        p.stock = p.stock - deduct
                        deductions.append({
                            "product": p.name,
                            "deducted": round(deduct, 4),
                            "new_stock": round(p.stock, 4),
                        })
                        if p.stock <= p.alert_threshold:
                            alerts_triggered.append(p.name)
        elif mapping.mapping_type == "direct" and mapping.product_id:
            p = db.query(Product).get(mapping.product_id)
            if p and p.volume_cl and mapping.dose_cl:
                # volume total du conditionnement
                total_vol = p.volume_cl * (p.qty_per_pack or 1)
                deduct = (mapping.dose_cl / total_vol) * qty_sold
                p.stock = p.stock - deduct
                deductions.append({
                    "product": p.name,
                    "deducted": round(deduct, 4),
                    "new_stock": round(p.stock, 4),
                })
                if p.stock <= p.alert_threshold:
                    alerts_triggered.append(p.name)

    ref = numero_cloture or f"auto-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
    db.add(ImportLog(import_type="cashpad", reference=ref))
    log_event(
        db,
        "import_cashpad",
        f"Import Cashpad clôture n°{ref} — {len(deductions)} déductions",
        {
            "numero_cloture": ref,
            "deductions": deductions,
            "alerts": list(set(alerts_triggered)),
            "unknown": unknown_products,
        }
    )
    db.commit()

    return {
        "ok": True,
        "deductions": deductions,
        "alerts": list(set(alerts_triggered)),
        "unknown": unknown_products,
    }


# ══════════════════════════════════════════════════════════════════════════
# IMPORT BON DE LIVRAISON
# ══════════════════════════════════════════════════════════════════════════

def _dedup_char(s):
    """Supprime les caractères doublés du codage PDF SOCOBO (ex: 'AABB' → 'AB')."""
    if not s:
        return s
    result = []
    i = 0
    chars = list(s)
    while i < len(chars):
        c = chars[i]
        if i + 1 < len(chars) and chars[i + 1] == c:
            result.append(c)
            i += 2
        else:
            result.append(c)
            i += 1
    return ''.join(result)


def _dedup_line(line):
    return ' '.join(_dedup_char(w) for w in line.split())


def _parse_socobo_pdf(content_bytes):
    """
    Parse une facture SOCOBO DSAC directement via pdfplumber.
    Retourne (products_list, invoice_num).
    products_list = [{"nom":..., "quantite":..., "prix_unitaire_ht":..., "numero_facture":...}]
    """
    import pdfplumber as _pdfplumber
    import io as _io
    import re as _re

    invoice_num = None
    raw_lines = []  # (code, nom, quantite, prix, is_promo)

    with _pdfplumber.open(_io.BytesIO(content_bytes)) as pdf:
        for page in pdf.pages:
            text = page.extract_text(x_tolerance=3, y_tolerance=3)
            if not text:
                continue
            for line in text.split('\n'):
                dl = _dedup_line(line)

                # Numéro de facture (6 chiffres commençant par 1)
                if not invoice_num:
                    m = _re.search(r'\b(1\d{5})\b', dl)
                    if m:
                        invoice_num = m.group(1)

                # Ligne produit : commence par code numérique suivi (immédiatement) d'une lettre
                if not _re.match(r'^\d{2,5}\*?\s*[A-ZÉÀÙÊÎF]', dl):
                    continue

                upper = dl.upper()
                SKIP = ['FRAIS DE REGIE', 'FUTÀ30', 'FUTà30', 'FUT À 30',
                        'DECONSIGN', 'BON DE RETOUR', 'CO25KG', 'TUBE CO2',
                        'SANS EM ', 'CARTEBANCAIRE', 'PAR NOUS', 'SOCOBO',
                        'CLIENT DÉCLAR', 'AUCUNE ESCOMPTE', 'LE TAUX',
                        'CASESCERTIF', 'RENVOI', 'SIGNATURECLIENT']
                if any(s.upper() in upper for s in SKIP):
                    continue
                if _re.match(r'^\d{3,},\d{2}', dl):
                    continue

                is_promo = 'PROMO FOURN' in upper

                m_code = _re.match(r'^(\d+)\*?\s*', dl)
                if not m_code:
                    continue
                code = m_code.group(1)
                rest = dl[m_code.end():]
                rest_up = rest.upper()

                if not rest or not rest[0].isalpha():
                    continue

                # ── TYPE 1 : CARTON N X ou FUT N X → COLIS COLS suivent ──
                m_cx = _re.search(
                    r'(CARTON|FUT)\s+(\d+)\s+X\s+(\d+)\s+(\d+)\s+', rest_up)
                # ── TYPE 2 : LOT DE N → COLIS COLS suivent ──
                m_lot = _re.search(
                    r'LOT\s+DE\s+(\d+)\s+(\d+)\s+(\d+)\s+', rest_up)
                # ── TYPE 3 : PACK DE N → COLIS seul (prix par pack) ──
                m_pack = _re.search(
                    r'PACK\s+DE\s+(\d+)\s+(\d+)\s+', rest_up)

                if m_cx:
                    kw = m_cx.group(1)
                    n = int(m_cx.group(2))
                    colis = int(m_cx.group(3))
                    cols = int(m_cx.group(4))
                    is_fut_line = (kw == 'FUT')
                    quantite = colis if is_fut_line else cols
                    nom = (rest[:m_cx.start()].strip() + ' ' + kw + ' ' + str(n) + ' X').strip()
                    rest_after = rest_up[m_cx.end():]
                    pr = _re.findall(r'\d+[,\.]\d+', rest_after)
                    # SOCOBO affiche le prix par unité (€/L pour fûts, €/bouteille pour cartons)
                    # → multiplier par n pour obtenir le prix par fût ou par carton
                    prix_unit = float(pr[0].replace(',', '.')) if pr else None
                    prix = round(prix_unit * n, 4) if prix_unit is not None else None

                elif m_lot:
                    n = int(m_lot.group(1))
                    colis = int(m_lot.group(2))
                    cols = int(m_lot.group(3))
                    quantite = cols
                    nom = (rest[:m_lot.start()].strip() + ' LOT DE ' + str(n)).strip()
                    rest_after = rest_up[m_lot.end():]
                    pr = _re.findall(r'\d+[,\.]\d+', rest_after)
                    prix = float(pr[0].replace(',', '.')) if pr else None

                elif m_pack:
                    n = int(m_pack.group(1))
                    colis = int(m_pack.group(2))
                    quantite = colis * n
                    nom = rest[:m_pack.end(1)].strip()  # inclut "PACK DE N"
                    rest_after = rest_up[m_pack.end():]
                    pr = _re.findall(r'\d+[,\.]\d+', rest_after)
                    prix = float(pr[0].replace(',', '.')) if pr else None

                else:
                    # Produit simple : chercher COLIS suivi de PRIX PRIX
                    m_c = _re.search(r'(\d+)\s+(\d+[,\.]\d+)\s+(\d+[,\.]\d+)', rest)
                    if not m_c:
                        continue
                    colis = int(m_c.group(1))
                    prix = float(m_c.group(2).replace(',', '.'))
                    nom = rest[:m_c.start()].strip()
                    # xN ou /N dans le nom → multiplier
                    m_xn = _re.search(r'[xX×](\d+)|/(\d+)', nom)
                    if m_xn:
                        n = int(m_xn.group(1) or m_xn.group(2))
                        quantite = colis * n
                    else:
                        quantite = colis

                if not nom or quantite <= 0:
                    continue
                raw_lines.append((code, nom.strip(), quantite, prix, is_promo))

    # Agréger : PROMO FOURN ajoute au produit principal (même code de base)
    products = {}
    for code, nom, quantite, prix, is_promo in raw_lines:
        if code not in products:
            products[code] = {"nom": nom, "quantite": 0, "prix": None}
        products[code]["quantite"] += quantite
        if not is_promo:
            if prix:
                products[code]["prix"] = prix
            products[code]["nom"] = nom  # nom issu de la ligne principale

    result = []
    for v in products.values():
        if v["quantite"] > 0:
            result.append({
                "nom": v["nom"],
                "quantite": v["quantite"],
                "prix_unitaire_ht": v["prix"],
                "numero_facture": invoice_num,
            })
    return result, invoice_num


def _parse_esprit_du_vin_pdf(content_bytes):
    """
    Parse une facture SARL Esprit du Vin.
    Format : REF [GENCOD] DESIGNATION QTY,00 CONDI,00 P.U.HT TOTAL TVA%
    Retourne (products_list, invoice_num).
    """
    import pdfplumber as _pdfplumber
    import io as _io
    import re as _re

    invoice_num = None
    products_out = []

    with _pdfplumber.open(_io.BytesIO(content_bytes)) as pdf:
        for page in pdf.pages:
            text = page.extract_text(x_tolerance=3, y_tolerance=3)
            if not text:
                continue
            for line in text.split('\n'):
                line = line.strip()
                if not invoice_num:
                    m = _re.search(r'FACTURE\s+n°(\d+)', line)
                    if m:
                        invoice_num = m.group(1)

                # Ligne produit : REF [GENCOD?] DESIGNATION QTY,00 CONDI,00 PU TOTAL TVA%
                m_prod = _re.match(
                    r'^([A-Z]{2,6}\d*\w*)\s+'
                    r'(?:\d{13}\s+)?'
                    r'(.+?)\s+'
                    r'(\d+)[,\.]00\s+'
                    r'(\d+)[,\.]00\s+'
                    r'(\d+[,\.]\d+)\s+'
                    r'(\d[\d\s]*[,\.]\d+)\s+'
                    r'(\d+)\s*%',
                    line
                )
                if not m_prod:
                    continue

                ref = m_prod.group(1)
                nom = m_prod.group(2).strip()
                quantite = int(m_prod.group(3))
                prix_ht = float(m_prod.group(5).replace(',', '.'))

                SKIP_REFS = {'SARL', 'IBAN', 'RCS', 'TVA', 'NET', 'REF', 'TOTAL', 'MODE', 'NET'}
                if ref.upper() in SKIP_REFS:
                    continue
                if quantite <= 0 or not nom:
                    continue

                products_out.append({
                    'nom': nom,
                    'quantite': quantite,
                    'prix_unitaire_ht': prix_ht,
                    'numero_facture': invoice_num,
                })

    # Vérifier que c'est bien une facture Esprit du Vin
    if not invoice_num or not products_out:
        return [], None
    return products_out, invoice_num


def _parse_pgv_vv_pdf(content_bytes):
    """
    Parse les factures PGV Distribution (PGFA...) et Empreinte du Vin (VVFA...).
    Format : REFCODE DESIGNATION QTY,000 [C|U] COLS PRIX_BRUT PRIX_NET MONTANT TVA
    Quantité = COLS (bouteilles individuelles). Les avoirs génèrent des quantités négatives.
    """
    import pdfplumber as _pdfplumber
    import io as _io
    import re as _re

    invoice_num = None
    is_avoir = False
    products_out = []

    with _pdfplumber.open(_io.BytesIO(content_bytes)) as pdf:
        for page in pdf.pages:
            text = page.extract_text(x_tolerance=3, y_tolerance=3)
            if not text:
                continue
            for line in text.split('\n'):
                line = line.strip()

                if not invoice_num:
                    m = _re.search(r'(PGFA|VVFA)\s+(\d+)\s*/\s*\d+', line)
                    if m:
                        invoice_num = m.group(1) + m.group(2)

                if _re.search(r'\bAvoir\b', line, _re.I):
                    is_avoir = True

                m_prod = _re.match(
                    r'^(\d{6})\s+'
                    r'(.+?)\s+'
                    r'(\d+)[,\.]\d+\s+'
                    r'[CU]\s+'
                    r'(\d+)\s+'
                    r'(\d+[,\.]\d+)\s+'
                    r'(\d+[,\.]\d+)\s+'
                    r'(\d[\d\s]*[,\.]\d+)\s+'
                    r'(\d+)\s*',
                    line
                )
                if not m_prod:
                    continue

                nom = m_prod.group(2).strip()
                cols = int(m_prod.group(4))
                prix_ht = float(m_prod.group(6).replace(',', '.'))
                quantite = -cols if is_avoir else cols

                if any(x in nom.upper() for x in ['CONSIGN', 'DECONSIGN', 'FRAIS']):
                    continue
                if cols == 0:
                    continue

                products_out.append({
                    'nom': nom,
                    'quantite': quantite,
                    'prix_unitaire_ht': prix_ht,
                    'numero_facture': invoice_num,
                })

    if not invoice_num or not products_out:
        return [], None
    return products_out, invoice_num


def _parse_auchan_pdf(content_bytes):
    """
    Parse une commande Auchan (email Gmail exporté en PDF).
    Retourne (products_list, order_num).
    """
    import pdfplumber as _pdfplumber
    import io as _io
    import re as _re

    order_num = None
    products_out = []

    with _pdfplumber.open(_io.BytesIO(content_bytes)) as pdf:
        all_words = []
        y_offset = 0
        for page in pdf.pages:
            ws = page.extract_words(x_tolerance=3, y_tolerance=3)
            for w in ws:
                all_words.append({**w, 'top': w['top'] + y_offset})
            y_offset += page.height

    # Numéro de commande Auchan (format 224XXXXXXXXXX)
    for w in all_words:
        if _re.match(r'^224\d{10}$', w['text']):
            order_num = w['text']
            break
    if not order_num:
        return [], None  # pas une commande Auchan

    # Séparation par zone x :
    # Quantité : x = 240-315
    # Prix     : x > 315
    # Nom      : x < 250
    qty_words   = [w for w in all_words if 240 <= w['x0'] <= 315 and _re.match(r'^\d+$', w['text'])]
    price_words = [w for w in all_words if w['x0'] > 315 and _re.match(r'^\d+[,\.]\d+$', w['text'])]
    name_words  = [w for w in all_words if w['x0'] < 250]

    def _clean_nom(nom):
        nom = _re.sub(r'\s+\d+[,\.]?\d*\s*cl\s+\d.*', '', nom, flags=_re.I)
        nom = _re.sub(r'\s+\d+[,\.]?\d+\s*[Ll]\s+\d.*', '', nom, flags=_re.I)
        nom = _re.sub(r'\s+\d+\.\d+[Ll]\b.*', '', nom)
        nom = _re.sub(r'\s+\d+[,\.]?\d*\s*[Ll]$', '', nom, flags=_re.I)
        nom = _re.sub(r'\s+\d+[,\.]\d+$', '', nom)
        nom = _re.sub(r'\s+(DONT|OFFERTE?S?)\s.*$', '', nom, flags=_re.I)
        nom = _re.sub(r'\s*\d+%.*$', '', nom)
        nom = _re.sub(r'^AUCHAN\s+', '', nom, flags=_re.I)
        nom = _re.sub(r'€/?\s*[Ll]?\s*$', '', nom, flags=_re.I)
        nom = _re.sub(r'\s+\d+[Gg]\s+.*$', '', nom, flags=_re.I)
        nom = _re.sub(r'\s+RI\s+.*$', '', nom, flags=_re.I)
        return _re.sub(r'\s+', ' ', nom).strip()

    for qw in qty_words:
        y_q = qw['top']
        qty = int(qw['text'])
        if qty == 0 or y_q < 530:
            continue

        # Prix proches (±8px)
        near_prices = [w for w in price_words if abs(w['top'] - y_q) <= 8]
        near_prices.sort(key=lambda w: w['x0'])
        if len(near_prices) < 2:
            continue
        prix_ht = float(near_prices[0]['text'].replace(',', '.'))

        # Mots nom dans fenêtre y-15 à y+45
        nom_candidates = {}
        for nw in name_words:
            dy = nw['top'] - y_q
            if not (-15 <= dy <= 45):
                continue
            t = nw['text']
            if _re.match(r'^\d{13}$', t): continue
            if _re.match(r'^https?://', t): continue
            if _re.match(r'^\d{2}/\d{2}', t): continue
            if t in ('€', '€/', 'l', '%', ':', 'À', '!', '-', '/'): continue
            if _re.match(r'^\d{4}_', t): continue
            if not any(c.isalpha() for c in t): continue
            if _re.match(r'^(Bonjour|Votre|qu\'elle|Nous|SARROLA|Commande|Date|Récap|Prix|Libellé|Quantité|Montant|dont)', t, _re.I): continue
            ly = round(nw['top'] / 2) * 2
            if ly not in nom_candidates:
                nom_candidates[ly] = []
            nom_candidates[ly].append(nw)

        clean_lines = {}
        for ly, wds in nom_candidates.items():
            texts_here = [w['text'] for w in sorted(wds, key=lambda w: w['x0'])]
            joined = ' '.join(texts_here)
            if _re.match(r'^\d+[,\.]?\d*\s*[Ll]\s+\d+[,\.]', joined, _re.I): continue
            if _re.match(r'^\d+[,\.]?\d*\s*cl\s+\d+[,\.]', joined, _re.I): continue
            if _re.match(r'^\d+\.\d+[Ll]', joined) and any(c.isdigit() for c in joined[3:]): continue
            word_list = joined.split()
            is_cat = (len(word_list) <= 4 and
                      not any(c.isdigit() for c in joined) and
                      '€' not in joined and '%' not in joined and
                      sum(1 for wt in word_list if wt.isupper() and len(wt) > 1) >= len(word_list) * 0.8)
            if is_cat: continue
            if any(c.isalpha() for c in joined):
                clean_lines[ly] = joined

        if not clean_lines:
            continue

        sorted_cl = sorted(clean_lines.items(), key=lambda kv: abs(kv[0] - y_q))[:2]
        sorted_cl.sort(key=lambda kv: kv[0])

        # Appliquer la détection de pack sur le nom BRUT (avant nettoyage)
        # afin que "6X 1.5L" (format Saint Georges) soit bien détecté même si
        # _clean_nom supprime ensuite le suffixe volume "1.5L".
        raw_nom = ' '.join(v for k, v in sorted_cl)
        nom = _clean_nom(raw_nom)
        if not nom or len(nom) < 3:
            continue

        # Calcul quantité individuelle — regex sur le nom BRUT
        # Format NxVol : "6X33CL", "20X25CL", "12X20CL", "6X 1.5L", "24X33"
        m1 = _re.search(r'(\d+)\s*[Xx]\s*\d+[,\.]?\d*\s*(?:cl|CL|L\b|l\b)?', raw_nom)
        # Format VolxN : "20CL X12", "20CLX12"
        m2 = _re.search(r'\d+[,\.]?\d*\s*[Cc][Ll]\s*[Xx]\s*(\d+)', raw_nom)

        if m2:
            quantite = qty * int(m2.group(1))
        elif m1:
            n = int(m1.group(1))
            if n > 1:
                quantite = qty * n
            else:
                quantite = qty
        else:
            quantite = qty

        products_out.append({
            'nom': nom,
            'quantite': quantite,
            'prix_unitaire_ht': prix_ht,
            'numero_facture': order_num,
        })

    return products_out, order_num


@app.post("/api/import/livraison")
@app.post("/api/import/delivery/analyze")
async def analyze_delivery(file: UploadFile = File(...)):
    import os
    content = await file.read()
    is_pdf = file.filename.lower().endswith(".pdf")

    # ── Pour les PDF : parsers déterministes (pdfplumber) ──
    if is_pdf:
        # 1. Essayer SOCOBO (factures avec caractères doublés)
        try:
            products, invoice_num = _parse_socobo_pdf(content)
            if products:
                return {"products": products, "fournisseur": "Socobo"}
        except Exception:
            pass

        # 2. Essayer PGV Distribution / Empreinte du Vin (PGFA / VVFA)
        try:
            products, invoice_num = _parse_pgv_vv_pdf(content)
            if products:
                return {"products": products, "fournisseur": "PGV Distribution"}
        except Exception:
            pass

        # 3. Essayer Esprit du Vin (factures SARL Esprit du Vin)
        try:
            products, invoice_num = _parse_esprit_du_vin_pdf(content)
            if products:
                return {"products": products, "fournisseur": "Esprit du Vin"}
        except Exception:
            pass

        # 4. Essayer Auchan (commandes Gmail/Auchan)
        try:
            products, order_num = _parse_auchan_pdf(content)
            if products:
                return {"products": products, "fournisseur": "Auchan"}
        except Exception:
            pass

    # ── Pour les photos (ou si pdfplumber n'a rien extrait) : Claude ──
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise HTTPException(400, detail="Clé API Anthropic non configurée. Vérifiez le fichier .env")

    import anthropic as _anthropic
    client = _anthropic.Anthropic(api_key=api_key)

    prompt_text = """Tu analyses une facture ou un bon de livraison fournisseur.

TÂCHE 1 — Identifie le nom du fournisseur (ex : "Socobo", "PGV Distribution", "Auchan", "Esprit du Vin"…).
Si introuvable, laisse "fournisseur" vide.

TÂCHE 2 — Extrait les produits livrés :
- "nom" : nom complet du produit
- "quantite" : total d'unités individuelles (si NxVol ou N colis de X unités → quantite = N×X)
- "prix_unitaire_ht" : prix unitaire HT en euros (null si absent)
- "numero_facture" : numéro de facture/bon (même valeur pour toutes les lignes, "" si absent)

COLONNES typiques (format Socobo/DSAC) : LIBELLE | COLIS | CONTENANT | COLS | PRIX UNIT HT | REMISE | NET HT | VOLUME EFFECTIF | ALCOOL PUR
⚠️ VOLUME EFFECTIF et ALCOOL PUR = colonnes fiscales en LITRES — NE JAMAIS les utiliser comme quantités.

LIGNES À IGNORER : FRAIS DE REGIE, DECONSIGNE, CONSIGNE, FUT 30 EUROS.
PROMO FOURN / GRATUIT : ajoute les COLIS au produit principal.

Réponds UNIQUEMENT en JSON valide :
{"fournisseur": "Socobo", "produits": [{"nom": "Pastis 51 1L", "quantite": 12, "prix_unitaire_ht": 16.84, "numero_facture": "100051"}]}"""

    try:
        if is_pdf:
            b64 = base64.standard_b64encode(content).decode("utf-8")
            message = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=4096,
                messages=[{"role": "user", "content": [
                    {"type": "document",
                     "source": {"type": "base64", "media_type": "application/pdf", "data": b64}},
                    {"type": "text", "text": prompt_text}
                ]}],
            )
        else:
            ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "jpg"
            media_map = {"jpg": "image/jpeg", "jpeg": "image/jpeg",
                         "png": "image/png", "webp": "image/webp",
                         "gif": "image/gif", "heic": "image/jpeg"}
            media_type = media_map.get(ext, "image/jpeg")
            b64 = base64.standard_b64encode(content).decode("utf-8")
            message = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=4096,
                messages=[{"role": "user", "content": [
                    {"type": "image",
                     "source": {"type": "base64", "media_type": media_type, "data": b64}},
                    {"type": "text", "text": prompt_text}
                ]}],
            )
    except _anthropic.BadRequestError as e:
        raise HTTPException(400, detail=f"Fichier non lisible : {str(e)}")
    except _anthropic.AuthenticationError:
        raise HTTPException(401, detail="Clé API invalide. Vérifiez le fichier .env")
    except Exception as e:
        raise HTTPException(500, detail=f"Erreur lors de l'analyse : {str(e)}")

    raw = message.content[0].text.strip()

    # Essayer d'abord le format objet {"fournisseur": "...", "produits": [...]}
    fournisseur_ia = ""
    products = None
    obj_start = raw.find("{")
    if obj_start != -1:
        obj_end = raw.rfind("}") + 1
        try:
            parsed = json.loads(raw[obj_start:obj_end])
            if isinstance(parsed, dict) and ("produits" in parsed or "products" in parsed):
                products = parsed.get("produits") or parsed.get("products") or []
                fournisseur_ia = parsed.get("fournisseur", "")
        except json.JSONDecodeError:
            pass

    # Fallback : ancien format tableau [...]
    if products is None:
        start = raw.find("[")
        end = raw.rfind("]") + 1
        if start == -1:
            raise HTTPException(400, detail="Impossible d'extraire les données du document. Essayez avec une meilleure photo.")
        try:
            products = json.loads(raw[start:end])
        except json.JSONDecodeError:
            raise HTTPException(400, detail="Le document n'a pas pu être analysé correctement.")

    return {"products": products, "fournisseur": fournisseur_ia}


class DeliveryConfirmIn(BaseModel):
    products: list
    numero_facture: str
    fournisseur: str = ""


def _normalize_tokens(s: str) -> set:
    """Normalise un nom produit en tokens pour matching fuzzy."""
    import unicodedata, re
    # Supprimer accents
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = s.lower()
    # Normaliser "saint" → "st" pour matcher "Saint Georges" ↔ "St Georges"
    s = re.sub(r'\bsaint\b', 'st', s)
    # Normaliser décimales : "1,5" "1.5" → "15"
    s = re.sub(r'(\d)[,.](\d)', r'\1\2', s)
    # Supprimer multiplicateurs de pack : "6x", "12x", "x6", "33clx6" → "33cl"
    s = re.sub(r'(\d+(?:cl|l))x\d+', r'\1', s)
    s = re.sub(r'\b\d+x\b', ' ', s)   # "6x", "12x"
    s = re.sub(r'\bx\d+\b', ' ', s)   # "x6", "x12"
    # Supprimer "/24" après cl : "33cl/24" → "33cl"
    s = re.sub(r'(\d+cl)/\d+', r'\1', s)
    # Supprimer caractères non-alphanumériques
    s = re.sub(r'[^\w\s]', ' ', s)
    # Mots parasites à ignorer (descripteurs génériques + articles)
    STOP = {'vp','bte','pet','bt','pres','purjus','pur','abc','slim','nectar',
            'pack','carton','lot','de','le','la','les','du','des','et','en',
            'un','une','fut','fut','lx6','lx4','lx12','lx24','bionda',
            # descripteurs eau generiques
            'eau','source','gazeuse','plate','minerale','naturelle','drinking',
            # suffixes pack/format
            'bouteille','bouteilles','canette','canettes','boite','boites','brik'}
    return {t for t in s.split() if len(t) >= 2 and t not in STOP}


def _find_best_product(nom: str, all_products) -> object:
    """Matching intelligent multi-stratégies pour retrouver un produit depuis un nom OCR."""
    from difflib import SequenceMatcher
    import unicodedata, re

    def no_accent(s):
        s = unicodedata.normalize('NFD', s)
        return ''.join(c for c in s if unicodedata.category(c) != 'Mn').lower()

    nom_clean = no_accent(nom)

    # Stratégie 1 : exact
    for p in all_products:
        if no_accent(p.name) == nom_clean:
            return p

    # Stratégie 2 : contient (bidirectionnel)
    for p in all_products:
        pn = no_accent(p.name)
        if pn in nom_clean or nom_clean in pn:
            return p

    # Stratégie 3 : tokens
    import re as _re
    ocr_tokens = _normalize_tokens(nom)

    # Extraire le volume du nom OCR (ex: "75cl", "33cl", "1l")
    ocr_vols = set(_re.findall(r'\d+cl|\d+l\b', no_accent(nom)))

    # Descripteurs génériques qui ne suffisent PAS à identifier un produit seuls
    # (saveur, couleur, style) — évite "Lipton Pêche" → "Pago Pêche" via token "peche"
    GENERIC_DESCRIPTORS = {
        'peche', 'citron', 'menthe', 'fraise', 'framboise', 'cerise',
        'pomme', 'raisin', 'mangue', 'grenade', 'tropical', 'agrumes',
        'rouge', 'blanc', 'rose', 'vert', 'noir', 'bleu',
        'light', 'zero', 'original', 'classic', 'nature', 'special',
        'premium', 'extra', 'brut', 'sec', 'doux', 'vieux',
    }

    best_p, best_score = None, 0.0
    for p in all_products:
        db_tokens = _normalize_tokens(p.name)
        if not db_tokens:
            continue
        common = ocr_tokens & db_tokens
        score = len(common) / len(db_tokens)

        # Pénalité si volumes incompatibles (ex: "75cl" dans OCR mais "33cl" dans DB)
        if ocr_vols:
            db_vols = set(_re.findall(r'\d+cl|\d+l\b', no_accent(p.name)))
            if db_vols and not ocr_vols & db_vols:
                score *= 0.4  # pénalité forte si aucun volume en commun

        # Pénalité si le seul token commun est un descripteur générique (saveur, couleur…)
        # Ex : "LIPTON PECHE SLEEK" ne doit PAS matcher "Pago Pêche" via "peche" seul
        if len(common) == 1 and common <= GENERIC_DESCRIPTORS:
            score *= 0.25

        if score > best_score:
            best_score = score
            best_p = p
    if best_score >= 0.5:
        return best_p

    # Stratégie 4 : difflib
    best_p, best_ratio = None, 0.0
    for p in all_products:
        ratio = SequenceMatcher(None, nom_clean, no_accent(p.name)).ratio()
        if ratio > best_ratio:
            best_ratio = ratio
            best_p = p
    if best_ratio >= 0.55:
        return best_p

    return None


@app.post("/api/import/livraison/confirm")
@app.post("/api/import/delivery/confirm")
def confirm_delivery(body: DeliveryConfirmIn, db: Session = Depends(get_db)):
    import traceback
    try:
        return _confirm_delivery_inner(body, db)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(500, detail=f"Bug: {type(e).__name__}: {str(e)} | {traceback.format_exc()[-300:]}")

def _confirm_delivery_inner(body: DeliveryConfirmIn, db: Session):
    existing = db.query(ImportLog).filter(
        ImportLog.import_type == "delivery",
        ImportLog.reference == body.numero_facture,
    ).first()
    if existing:
        raise HTTPException(
            400,
            detail=f"Facture n°{body.numero_facture} déjà importée le {to_local(existing.created_at).strftime('%d/%m/%Y %H:%M')}."
        )

    all_products = db.query(Product).all()

    # 1. Résoudre les correspondances et agréger les quantités par produit trouvé
    matched_map = {}   # product_id → {product, total_qty, prix}
    not_found = []

    for item in body.products:
        nom = item.get("nom", "").strip()
        qty = float(item.get("quantite", 0) or 0)
        prix = item.get("prix_unitaire_ht")
        matched_id = item.get("produit_id") or item.get("product_id")

        p = None
        if matched_id:
            p = db.query(Product).get(int(matched_id))
        if not p:
            p = _find_best_product(nom, all_products)

        if p and qty != 0:
            if p.id not in matched_map:
                matched_map[p.id] = {"product": p, "total_qty": 0.0, "prix": None}
            matched_map[p.id]["total_qty"] += qty
            # Ne met à jour le prix que pour les livraisons (qty > 0)
            if qty > 0 and prix is not None and prix != "" and float(prix) > 0:
                matched_map[p.id]["prix"] = float(prix)
        elif qty != 0:
            not_found.append(nom)

    # 2. Appliquer les quantités en tenant compte du conditionnement
    updated = []
    is_avoir = False  # détecte si c'est un avoir (retour fournisseur)

    for pid, entry in matched_map.items():
        p = entry["product"]
        raw_qty = entry["total_qty"]
        prix = entry["prix"]

        # Les parsers (Auchan, Socobo, PGV…) envoient déjà la quantité en unités
        # individuelles (bouteilles/canettes). On n'applique PAS de division par
        # qty_per_pack ici — ce serait une double opération.
        actual_qty = raw_qty

        if actual_qty != 0:
            if actual_qty < 0:
                is_avoir = True
            old_price = p.purchase_price
            p.stock = round(p.stock + actual_qty, 4)
            # Ne met à jour le prix que pour les entrées de stock (livraisons)
            if prix is not None and prix > 0 and actual_qty > 0:
                p.purchase_price = prix
                p.is_estimated = False
            updated.append({
                "product_id": p.id,
                "product": p.name,
                "added": actual_qty,
                "old_price": old_price,
                "new_price": p.purchase_price,
            })

    # Ne créer le log que si quelque chose a été traité
    if updated:
        event_type = "avoir_fournisseur" if is_avoir else "livraison"
        label = "Avoir/retour fournisseur" if is_avoir else "Bon de livraison"
        import_log = ImportLog(
            import_type="delivery",
            reference=body.numero_facture,
            supplier=body.fournisseur,
            details_json=json.dumps(updated, ensure_ascii=False),
        )
        db.add(import_log)
        log_event(
            db,
            event_type,
            f"{label} n°{body.numero_facture} — {len(updated)} produit(s)",
            {
                "numero_facture": body.numero_facture,
                "fournisseur": body.fournisseur,
                "updated": [{"product": u["product"], "added": u["added"]} for u in updated],
                "not_found": not_found,
            }
        )
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(500, detail=f"Erreur base de données : {str(e)}")
    return {"ok": True, "updated": updated, "not_found": not_found, "is_avoir": is_avoir}


@app.get("/api/imports/{import_id}/detail")
def import_detail(import_id: int, db: Session = Depends(get_db)):
    imp = db.query(ImportLog).filter(ImportLog.id == import_id).first()
    if not imp:
        raise HTTPException(404, detail="Import introuvable")
    try:
        details = json.loads(getattr(imp, "details_json", "[]") or "[]")
    except Exception:
        details = []
    return {
        "id": imp.id,
        "reference": imp.reference,
        "supplier": imp.supplier,
        "created_at": to_local(imp.created_at).strftime("%d/%m/%Y %H:%M"),
        "details": details,
    }


@app.get("/api/imports/recent")
def recent_imports(days: int = 7, db: Session = Depends(get_db)):
    from datetime import timedelta
    cutoff = datetime.utcnow() - timedelta(days=days)
    imports = db.query(ImportLog).filter(
        ImportLog.import_type == "delivery",
        ImportLog.created_at >= cutoff,
    ).order_by(ImportLog.created_at.desc()).all()

    result = []
    for imp in imports:
        try:
            details = json.loads(getattr(imp, 'details_json', '[]') or '[]')
        except Exception:
            details = []
        annule = isinstance(details, dict) and details.get('annule', False)
        items = details.get('details', []) if isinstance(details, dict) else details
        result.append({
            "id": imp.id,
            "reference": imp.reference,
            "supplier": imp.supplier or "",
            "created_at": to_local(imp.created_at).strftime("%d/%m/%Y %H:%M"),
            "annule": annule,
            "nb_produits": len(items),
            "details": items,
        })
    return result


@app.post("/api/imports/{import_id}/annuler")
def annuler_import(import_id: int, db: Session = Depends(get_db)):
    from datetime import timedelta
    imp = db.query(ImportLog).get(import_id)
    if not imp or imp.import_type != "delivery":
        raise HTTPException(404, "Import introuvable")

    try:
        details = json.loads(getattr(imp, 'details_json', '[]') or '[]')
    except Exception:
        details = []

    if isinstance(details, dict) and details.get('annule'):
        raise HTTPException(400, "Cet import a déjà été annulé")

    if datetime.utcnow() - imp.created_at > timedelta(days=7):
        raise HTTPException(400, "Annulation impossible après 7 jours")

    items = details if isinstance(details, list) else details.get('details', [])
    reversed_items = []

    for item in items:
        p = db.query(Product).get(item.get('product_id'))
        if not p:
            continue
        p.stock = round(p.stock - item['added'], 3)
        old_price = item.get('old_price')
        if old_price is not None:
            p.purchase_price = old_price
            p.is_estimated = old_price is None
        reversed_items.append({"product": p.name, "removed": item['added']})

    # Marquer comme annulé
    imp.details_json = json.dumps({"annule": True, "details": items}, ensure_ascii=False)

    log_event(db, "annulation_livraison",
              f"Annulation BL n°{imp.reference} ({imp.supplier})",
              {"numero_facture": imp.reference, "fournisseur": imp.supplier, "reversed": reversed_items})
    db.commit()
    return {"ok": True, "reversed": reversed_items}


# ══════════════════════════════════════════════════════════════════════════
# STATISTIQUES DE CONSOMMATION
# ══════════════════════════════════════════════════════════════════════════

@app.get("/api/stats/consommation")
def stats_consommation(periode: int = 30, db: Session = Depends(get_db)):
    """
    Agrège les consommations sur N jours (sorties réserve + Cashpad).
    Retourne : top produits, par catégorie, évolution journalière.
    """
    cutoff = datetime.utcnow() - timedelta(days=periode)
    rows = db.query(StockHistory).filter(
        StockHistory.created_at >= cutoff,
        StockHistory.event_type.in_(["mouvement_manuel", "import_cashpad"])
    ).order_by(StockHistory.created_at).all()

    # Récupère les infos produits pour la catégorie
    products_map = {p.id: p for p in db.query(Product).all()}

    by_product = {}   # product_name → {qty, category, product_id}
    by_day = {}       # "YYYY-MM-DD" → qty totale

    for row in rows:
        try:
            d = json.loads(row.data_json)
        except Exception:
            continue

        day = to_local(row.created_at).strftime("%Y-%m-%d")

        if row.event_type == "mouvement_manuel":
            qty = d.get("quantity", 0)
            if qty >= 0:
                continue  # ignore les entrées, seulement les sorties
            qty = abs(qty)
            name = d.get("product", "?")
            pid = d.get("product_id")
            cat = products_map[pid].category if pid and pid in products_map else "Autres"
            key = name
            if key not in by_product:
                by_product[key] = {"qty": 0, "category": cat, "product_id": pid}
            by_product[key]["qty"] += qty
            by_day[day] = by_day.get(day, 0) + qty

        elif row.event_type == "import_cashpad":
            deductions = d.get("deductions", [])
            for ded in deductions:
                qty = abs(float(ded.get("quantity", ded.get("qty", 0)) or 0))
                if qty <= 0:
                    continue
                name = ded.get("product", ded.get("nom", "?"))
                pid = ded.get("product_id")
                cat = products_map[pid].category if pid and pid in products_map else "Autres"
                key = name
                if key not in by_product:
                    by_product[key] = {"qty": 0, "category": cat, "product_id": pid}
                by_product[key]["qty"] += qty
                by_day[day] = by_day.get(day, 0) + qty

    # Top produits triés
    top_products = sorted(
        [{"name": k, "qty": round(v["qty"], 2), "category": v["category"]} for k, v in by_product.items()],
        key=lambda x: x["qty"], reverse=True
    )

    # Par catégorie
    by_cat = {}
    for item in top_products:
        c = item["category"]
        by_cat[c] = round(by_cat.get(c, 0) + item["qty"], 2)
    by_category = sorted([{"category": k, "qty": v} for k, v in by_cat.items()], key=lambda x: x["qty"], reverse=True)

    # Évolution journalière (tous les jours de la période)
    from datetime import date, timedelta as td
    daily = []
    for i in range(periode):
        d_str = (date.today() - td(days=periode - 1 - i)).strftime("%Y-%m-%d")
        daily.append({"date": d_str, "qty": round(by_day.get(d_str, 0), 2)})

    return {
        "periode": periode,
        "top_products": top_products[:20],
        "by_category": by_category,
        "daily": daily,
        "total": round(sum(x["qty"] for x in top_products), 2),
    }


@app.post("/api/stats/import-historique")
async def import_historique(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """
    Importe un fichier Cashpad Synthèse (Excel) pour alimenter les stats historiques.
    Utilise la feuille 'Ventes-par-produit-par-date-4' (données mensuelles).
    """
    import openpyxl, io as _io
    content = await file.read()
    wb = openpyxl.load_workbook(_io.BytesIO(content), data_only=True)

    # Cherche la feuille par-date
    sheet_name = None
    for s in wb.sheetnames:
        if "par-date" in s.lower() or "date" in s.lower():
            sheet_name = s
            break
    if not sheet_name:
        raise HTTPException(400, "Feuille 'par date' introuvable dans ce fichier")

    ws = wb[sheet_name]
    rows = list(ws.iter_rows(values_only=True))

    # Ligne 11 (index 11) = en-têtes avec les dates des mois
    header_row = rows[11]
    # Colonnes paires = Quantité, impaires = Montant (à partir de col 2)
    months = []  # liste de (col_index_qty, datetime_mois)
    for ci, cell in enumerate(header_row):
        if ci < 2:
            continue
        from datetime import datetime as _dt
        if hasattr(cell, 'year') or (isinstance(cell, _dt)):
            months.append((ci, cell))

    if not months:
        raise HTTPException(400, "Impossible de trouver les colonnes de dates")

    # Supprime les anciens imports historiques de ce fichier (évite doublons)
    source_tag = file.filename or "cashpad_historique"

    imported = 0
    errors = []

    for row in rows[13:]:
        if not row[0] and not row[1]:
            continue
        cat = str(row[0] or "").strip()
        nom = str(row[1] or "").strip()
        if not nom or nom.startswith("Total"):
            continue

        for ci, mois_dt in months:
            qty_val = row[ci] if ci < len(row) else None
            if not qty_val or float(qty_val or 0) <= 0:
                continue
            qty = float(qty_val)

            # Crée une entrée StockHistory par mois/produit
            from datetime import datetime as _dt2
            if hasattr(mois_dt, 'year'):
                event_date = _dt2(mois_dt.year, mois_dt.month, 15)  # milieu du mois
            else:
                continue

            # Récupère aussi le CA (colonne suivante)
            ca_val = row[ci + 1] if ci + 1 < len(row) else None
            ca = round(float(ca_val), 2) if ca_val else 0.0

            h = StockHistory(
                event_type="ventes_historiques",
                description=f"Historique {mois_dt.strftime('%b %Y') if hasattr(mois_dt,'strftime') else mois_dt} — {nom}",
                data_json=json.dumps({
                    "product": nom,
                    "category": cat,
                    "quantity": qty,
                    "ca": ca,
                    "mois": event_date.strftime("%Y-%m"),
                    "source": source_tag,
                }, ensure_ascii=False),
                created_at=event_date,
            )
            db.add(h)
            imported += 1

    db.commit()
    return {"ok": True, "imported": imported, "mois": len(months), "source": source_tag}


@app.get("/api/stats/historique")
def stats_historique(db: Session = Depends(get_db)):
    """Retourne les ventes historiques avec analyses décisionnelles."""
    rows = db.query(StockHistory).filter(
        StockHistory.event_type == "ventes_historiques"
    ).all()

    by_month = {}     # "2025-05" → {qty, ca}
    by_product = {}   # nom → {qty, ca, category, par_mois}
    by_cat = {}       # cat → {qty, ca}

    for row in rows:
        try:
            d = json.loads(row.data_json)
        except Exception:
            continue
        mois = d.get("mois", "")
        qty  = float(d.get("quantity", 0))
        ca   = float(d.get("ca", 0))
        nom  = d.get("product", "?")
        cat  = d.get("category", "Autres")

        if mois not in by_month:
            by_month[mois] = {"qty": 0, "ca": 0}
        by_month[mois]["qty"] = round(by_month[mois]["qty"] + qty, 1)
        by_month[mois]["ca"]  = round(by_month[mois]["ca"]  + ca,  2)

        if nom not in by_product:
            by_product[nom] = {"qty": 0, "ca": 0, "category": cat, "par_mois": {}}
        by_product[nom]["qty"] = round(by_product[nom]["qty"] + qty, 1)
        by_product[nom]["ca"]  = round(by_product[nom]["ca"]  + ca,  2)
        by_product[nom]["par_mois"][mois] = round(by_product[nom]["par_mois"].get(mois, 0) + qty, 1)

        if cat not in by_cat:
            by_cat[cat] = {"qty": 0, "ca": 0}
        by_cat[cat]["qty"] = round(by_cat[cat]["qty"] + qty, 1)
        by_cat[cat]["ca"]  = round(by_cat[cat]["ca"]  + ca,  2)

    total_qty = round(sum(v["qty"] for v in by_month.values()), 1)
    total_ca  = round(sum(v["ca"]  for v in by_month.values()), 2)

    # Classement produits
    all_products = sorted(
        [{"name": k, "qty": v["qty"], "ca": v["ca"], "category": v["category"],
          "par_mois": v["par_mois"],
          "pct": round(v["qty"] / total_qty * 100, 1) if total_qty else 0}
         for k, v in by_product.items()],
        key=lambda x: x["qty"], reverse=True
    )

    # Top 20 par catégorie
    by_cat_products = {}
    for p in all_products:
        c = p["category"]
        if c not in by_cat_products:
            by_cat_products[c] = []
        by_cat_products[c].append(p)

    # Mois peak
    peak = max(by_month.items(), key=lambda x: x[1]["qty"]) if by_month else ("—", {"qty": 0})

    monthly = sorted([{"mois": k, "qty": v["qty"], "ca": v["ca"]} for k, v in by_month.items()], key=lambda x: x["mois"])
    by_category = sorted([{"category": k, "qty": v["qty"], "ca": v["ca"]} for k, v in by_cat.items()], key=lambda x: x["qty"], reverse=True)

    return {
        "total_qty": total_qty,
        "total_ca": total_ca,
        "peak_mois": peak[0],
        "peak_qty": peak[1]["qty"],
        "monthly": monthly,
        "by_category": by_category,
        "top_products": all_products[:20],
        "bottom_products": all_products[-30:][::-1],  # 30 moins vendus, du moins au plus
        "by_cat_products": {k: v[:20] for k, v in by_cat_products.items()},
        "nb_produits": len(all_products),
    }


# ══════════════════════════════════════════════════════════════════════════
# INVENTAIRE DU SOIR
# ══════════════════════════════════════════════════════════════════════════

PRIORITY_CATEGORIES = [
    "Spiritueux", "Rhums", "Gins", "Whiskies", "Vodkas",
    "Champagnes", "Apéritifs", "Digestifs", "Anisés", "Tequilas", "Cachaça"
]

# Ordre d'affichage des catégories dans l'inventaire du soir
INVENTORY_CATEGORY_ORDER = [
    "Bières", "Spiritueux", "Rhums", "Gins", "Whiskies", "Vodkas",
    "Tequilas", "Cachaça", "Apéritifs", "Digestifs", "Anisés",
    "Champagnes", "Vins", "Jus de fruit", "Sodas", "Eaux", "Sirops"
]


@app.get("/api/inventaire/session")
@app.get("/api/inventory/session")
def get_inventory_session(db: Session = Depends(get_db)):
    """Retourne TOUS les produits à comptabiliser groupés par catégorie.
    Priorité : alcools + grandes bouteilles de mixing (volume >= 75cl, qty_per_pack=1).
    Exclut les produits en carton (comptés à la réception) et fûts (comptés par le débit).
    """
    all_products = db.query(Product).filter(
        Product.unit != 'Fût',       # Les fûts sont suivis via Cashpad
    ).order_by(Product.category, Product.name).all()

    result = []
    for p in all_products:
        # Cartons → compté à la réception, pas à l'inventaire soir
        if p.unit and 'Carton' in p.unit:
            continue
        result.append({
            "id": p.id,
            "nom": p.name,
            "name": p.name,
            "categorie": p.category,
            "category": p.category,
            "unite": p.unit,
            "unit": p.unit,
            "volume_cl": p.volume_cl,
            "qty_per_pack": p.qty_per_pack,
            "quantite_theorique": round(p.stock, 3),
            "theoretical": round(p.stock, 3),
            "is_grande_bouteille": bool(p.volume_cl and p.volume_cl >= 75 and (p.qty_per_pack or 1) == 1 and p.unit not in ('Fût',)),
        })

    # Trier : ordre des catégories prioritaires, puis le reste
    def sort_key(item):
        cat = item["category"] or "ZZZ"
        try:
            return (INVENTORY_CATEGORY_ORDER.index(cat), item["name"])
        except ValueError:
            return (99, item["name"])

    result.sort(key=sort_key)
    return result


class InventoryCountIn(BaseModel):
    counts: List[dict]
    staff_name: str = ""


@app.post("/api/inventaire/compter")
@app.post("/api/inventory/submit")
def submit_inventory(body: InventoryCountIn, db: Session = Depends(get_db)):
    results = []
    alerts = []
    for item in body.counts:
        pid = item.get("product_id") or item.get("produit_id")
        p = db.query(Product).get(pid)
        if not p:
            continue
        theoretical = p.stock
        actual = float(item.get("actual", item.get("quantite_reelle", 0)))
        diff = actual - theoretical
        sess = InventorySession(
            product_id=p.id,
            theoretical_qty=theoretical,
            actual_qty=actual,
            difference=diff,
            staff_name=body.staff_name,
        )
        db.add(sess)
        p.stock = actual
        result = {
            "product": p.name,
            "theoretical": round(theoretical, 3),
            "actual": actual,
            "diff": round(diff, 3),
            "ecart": round(diff, 3),
        }
        results.append(result)
        if diff < -0.5:
            alerts.append(f"Écart anormal : {p.name} (écart {diff:+.3f})")
            log_event(db, "alerte_inventaire", f"Écart anormal détecté : {p.name}", result)

    log_event(db, "inventaire_soir", f"Inventaire du soir — {len(results)} produits comptés", {
        "staff": body.staff_name,
        "results": results,
        "alerts": alerts,
    })
    db.commit()
    return {"ok": True, "results": results, "alerts": alerts}
