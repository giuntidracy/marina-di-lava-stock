import json
import random
import base64
import io
import os
from datetime import datetime
from dotenv import load_dotenv
load_dotenv(override=True)
from typing import Optional, List
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel

from database import get_db, engine
from models import (
    Base, Supplier, Product, Cocktail, CocktailIngredient,
    CashpadMapping, ImportLog, StockHistory, InventorySession
)

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Marina di Lava — Gestion Stock")
app.mount("/static", StaticFiles(directory="static"), name="static")


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


# ── root ───────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return FileResponse("static/index.html")


class PinIn(BaseModel):
    pin: str

@app.post("/api/auth")
def auth_pin(body: PinIn):
    manager_pin = os.environ.get("MANAGER_PIN", "1234")
    if body.pin == manager_pin:
        return {"ok": True, "role": "manager"}
    raise HTTPException(status_code=401, detail="Code PIN incorrect")


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
                "date": h.created_at.isoformat(),
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
            "created_at": e.created_at.isoformat(),
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
    log_event(db, "mouvement_manuel", f"Mouvement manuel : {p.name} ({'+' if body.quantity >= 0 else ''}{body.quantity})", {
        "product": p.name, "old_stock": old, "new_stock": p.stock, "note": body.note
    })
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
                detail=f"Clôture n°{numero_cloture} déjà importée le {existing.created_at.strftime('%d/%m/%Y %H:%M')}."
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
                    prix = float(pr[0].replace(',', '.')) if pr else None

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

        nom = _clean_nom(' '.join(v for k, v in sorted_cl))
        if not nom or len(nom) < 3:
            continue

        # Calcul quantité individuelle
        # Format NxVol : "6X33CL", "20X25CL", "12X20CL", "6X 1.5L", "24X33"
        m1 = _re.search(r'(\d+)\s*[Xx]\s*\d+[,\.]?\d*\s*(?:cl|CL|L\b|l\b)?', nom)
        # Format VolxN : "20CL X12", "20CLX12"
        m2 = _re.search(r'\d+[,\.]?\d*\s*[Cc][Ll]\s*[Xx]\s*(\d+)', nom)

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
                return {"products": products}
        except Exception:
            pass

        # 2. Essayer PGV Distribution / Empreinte du Vin (PGFA / VVFA)
        try:
            products, invoice_num = _parse_pgv_vv_pdf(content)
            if products:
                return {"products": products}
        except Exception:
            pass

        # 3. Essayer Esprit du Vin (factures SARL Esprit du Vin)
        try:
            products, invoice_num = _parse_esprit_du_vin_pdf(content)
            if products:
                return {"products": products}
        except Exception:
            pass

        # 3. Essayer Auchan (commandes Gmail/Auchan)
        try:
            products, order_num = _parse_auchan_pdf(content)
            if products:
                return {"products": products}
        except Exception:
            pass

    # ── Pour les photos (ou si pdfplumber n'a rien extrait) : Claude ──
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise HTTPException(400, detail="Clé API Anthropic non configurée. Vérifiez le fichier .env")

    import anthropic as _anthropic
    client = _anthropic.Anthropic(api_key=api_key)

    prompt_text = """Tu lis une facture SOCOBO au format DSAC.

COLONNES du document (gauche → droite) :
  LIBELLE | COLIS | CONTENANT | COLS | PRIX UNIT HT | REMISE | NET HT | VOLUME EFFECTIF | ALCOOL PUR

⚠️ VOLUME EFFECTIF et ALCOOL PUR = colonnes fiscales en LITRES. NE JAMAIS les utiliser comme quantités.

Calcule "quantite" = total d'unités individuelles reçues :
Si le nom contient xN ou /N → quantite = COLIS × N
Sinon → quantite = COLIS uniquement
Pour les FÛTS → quantite = COLIS uniquement

LIGNES À IGNORER : FRAIS DE REGIE, DECONSIGNE, CONSIGNE, FUT 30 EUROS.
PROMO FOURN / GRATUIT : ajoute leur COLIS au produit principal.

Réponds UNIQUEMENT en JSON valide :
[{"nom": "Pastis 51 1L", "quantite": 12, "prix_unitaire_ht": 16.84, "numero_facture": "100051"}]"""

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
    start = raw.find("[")
    end = raw.rfind("]") + 1
    if start == -1:
        raise HTTPException(400, detail="Impossible d'extraire les données du document. Essayez avec une meilleure photo.")
    try:
        products = json.loads(raw[start:end])
    except json.JSONDecodeError:
        raise HTTPException(400, detail="Le document n'a pas pu être analysé correctement.")

    return {"products": products}


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
    # Normaliser décimales : "1,5" "1.5" → "15"
    s = re.sub(r'(\d)[,.](\d)', r'\1\2', s)
    # Supprimer multiplicateurs : "33clx6" → "33cl", "x6" → ""
    s = re.sub(r'(\d+(?:cl|l))x\d+', r'\1', s)
    s = re.sub(r'x\d+', ' ', s)
    # Supprimer "/24" après cl : "33cl/24" → "33cl"
    s = re.sub(r'(\d+cl)/\d+', r'\1', s)
    # Supprimer caractères non-alphanumériques
    s = re.sub(r'[^\w\s]', ' ', s)
    # Mots parasites à ignorer
    STOP = {'vp','bte','pet','bt','pres','purjus','pur','abc','slim','nectar',
            'pack','carton','lot','de','le','la','les','du','des','et','en',
            'un','une','fut','fût','lx6','lx4','lx12','lx24','bionda'}
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
    existing = db.query(ImportLog).filter(
        ImportLog.import_type == "delivery",
        ImportLog.reference == body.numero_facture,
    ).first()
    if existing:
        raise HTTPException(
            400,
            detail=f"Facture n°{body.numero_facture} déjà importée le {existing.created_at.strftime('%d/%m/%Y %H:%M')}."
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

        if p and qty > 0:
            if p.id not in matched_map:
                matched_map[p.id] = {"product": p, "total_qty": 0.0, "prix": None}
            matched_map[p.id]["total_qty"] += qty
            if prix is not None and prix != "" and float(prix) > 0:
                matched_map[p.id]["prix"] = float(prix)
        elif qty > 0:
            not_found.append(nom)

    # 2. Appliquer les quantités en tenant compte du conditionnement
    updated = []
    for pid, entry in matched_map.items():
        p = entry["product"]
        raw_qty = entry["total_qty"]
        prix = entry["prix"]

        # Le parser extrait des unités individuelles (bouteilles, canettes...).
        # Pour les produits en carton (unit contient "Carton", qty_per_pack > 1),
        # on divise pour obtenir le nombre de cartons.
        # Pour bouteilles et fûts (qty_per_pack=1), on utilise tel quel.
        if p.unit and "Carton" in p.unit and p.qty_per_pack and p.qty_per_pack > 1:
            actual_qty = round(raw_qty / p.qty_per_pack, 2)
        else:
            actual_qty = raw_qty

        if actual_qty > 0:
            p.stock += actual_qty
            if prix is not None and prix > 0:
                p.purchase_price = prix
                p.is_estimated = False
            updated.append({"product": p.name, "added": actual_qty})

    db.add(ImportLog(import_type="delivery", reference=body.numero_facture, supplier=body.fournisseur))
    log_event(
        db,
        "livraison",
        f"Bon de livraison n°{body.numero_facture} — {len(updated)} produits réceptionnés",
        {
            "numero_facture": body.numero_facture,
            "fournisseur": body.fournisseur,
            "updated": updated,
            "not_found": not_found,
        }
    )
    db.commit()
    return {"ok": True, "updated": updated, "not_found": not_found}


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
