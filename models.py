from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base


class Supplier(Base):
    __tablename__ = "suppliers"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    contact = Column(String, default="")
    phone = Column(String, default="")
    email = Column(String, default="")
    categories = Column(String, default="")
    products = relationship("Product", back_populates="supplier_rel")
    product_suppliers = relationship("ProductSupplier", back_populates="supplier")
    orders = relationship("SupplierOrder", back_populates="supplier", cascade="all, delete-orphan")


class Product(Base):
    __tablename__ = "products"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    category = Column(String, nullable=False)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=True)
    stock = Column(Float, default=0)
    unit = Column(String, default="Bouteille")
    qty_per_pack = Column(Float, default=1)
    volume_cl = Column(Float, default=70)
    alert_threshold = Column(Float, default=2)
    purchase_price = Column(Float, nullable=True)
    sale_price_ttc = Column(Float, nullable=True)
    is_estimated = Column(Boolean, default=False)
    barcode = Column(String, default="")
    archived = Column(Boolean, default=False)
    vat_rate = Column(Float, default=0.20)   # 0.20 pour alcool, 0.10 pour softs/restauration
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    supplier_rel = relationship("Supplier", back_populates="products")
    cocktail_ingredients = relationship("CocktailIngredient", back_populates="product")
    cashpad_mappings = relationship("CashpadMapping", back_populates="product")
    product_suppliers = relationship("ProductSupplier", back_populates="product", cascade="all, delete-orphan")


class Cocktail(Base):
    __tablename__ = "cocktails"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    sale_price_ttc = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    ingredients = relationship("CocktailIngredient", back_populates="cocktail", cascade="all, delete-orphan")


class CocktailIngredient(Base):
    __tablename__ = "cocktail_ingredients"
    id = Column(Integer, primary_key=True, index=True)
    cocktail_id = Column(Integer, ForeignKey("cocktails.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    dose_cl = Column(Float, nullable=False)

    cocktail = relationship("Cocktail", back_populates="ingredients")
    product = relationship("Product", back_populates="cocktail_ingredients")


class ProductSupplier(Base):
    """Lien many-to-many produit ↔ fournisseur avec prix d'achat par fournisseur."""
    __tablename__ = "product_suppliers"
    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=False)
    purchase_price = Column(Float, nullable=True)
    is_primary = Column(Boolean, default=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (UniqueConstraint("product_id", "supplier_id", name="uq_product_supplier"),)

    product = relationship("Product", back_populates="product_suppliers")
    supplier = relationship("Supplier", back_populates="product_suppliers")


class CashpadMapping(Base):
    __tablename__ = "cashpad_mapping"
    id = Column(Integer, primary_key=True, index=True)
    nom_cashpad = Column(String, nullable=False, unique=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=True)
    cocktail_id = Column(Integer, ForeignKey("cocktails.id"), nullable=True)
    dose_cl = Column(Float, default=0)
    mapping_type = Column(String, default="direct")  # "direct" or "cocktail"
    ignored = Column(Boolean, default=False)

    product = relationship("Product", back_populates="cashpad_mappings")


class ImportLog(Base):
    __tablename__ = "imports_log"
    id = Column(Integer, primary_key=True, index=True)
    import_type = Column(String, nullable=False)  # "cashpad" or "delivery"
    reference = Column(String, nullable=False)
    supplier = Column(String, default="")
    details_json = Column(Text, default="[]")
    created_at = Column(DateTime, default=datetime.utcnow)


class StockHistory(Base):
    __tablename__ = "stock_history"
    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String, nullable=False)
    description = Column(Text, default="")
    data_json = Column(Text, default="{}")
    created_at = Column(DateTime, default=datetime.utcnow)


class InventorySession(Base):
    __tablename__ = "inventory_sessions"
    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    theoretical_qty = Column(Float, nullable=False)
    actual_qty = Column(Float, nullable=False)
    difference = Column(Float, nullable=False)
    staff_name = Column(String, default="")
    created_at = Column(DateTime, default=datetime.utcnow)


class SupplierOrder(Base):
    """Commande fournisseur (brouillon → envoyée → reçue)."""
    __tablename__ = "supplier_orders"
    id = Column(Integer, primary_key=True, index=True)
    reference = Column(String, nullable=False, unique=True)   # CMD-YYYYMMDD-XXX
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=False)
    status = Column(String, default="draft")  # draft / sent / partial / received
    notes = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    sent_at = Column(DateTime, nullable=True)
    received_at = Column(DateTime, nullable=True)

    supplier = relationship("Supplier", back_populates="orders")
    items = relationship("SupplierOrderItem", back_populates="order", cascade="all, delete-orphan")


class SupplierOrderItem(Base):
    """Ligne d'une commande fournisseur."""
    __tablename__ = "supplier_order_items"
    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("supplier_orders.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=True)
    product_name = Column(String, default="")   # snapshot au moment de la commande
    qty_ordered = Column(Float, default=0)
    unit_price_ht = Column(Float, nullable=True)

    order = relationship("SupplierOrder", back_populates="items")
    product = relationship("Product")


class Event(Base):
    """Événement (concert, soirée, brunch…) pour analyse de boost consommation."""
    __tablename__ = "events"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)          # "Concert vendredi soir"
    event_type = Column(String, default="Autre")   # "Concert", "Soirée", "Brunch"…
    date = Column(DateTime, nullable=False)        # date de début
    end_date = Column(DateTime, nullable=True)     # date de fin (null = événement 1 jour)
    start_time = Column(String, default="")        # "HH:MM" optionnel
    end_time = Column(String, default="")          # "HH:MM" optionnel
    notes = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    requirements = relationship("EventRequirement", back_populates="event", cascade="all, delete-orphan")


class EventRequirement(Base):
    """Besoin spécifique pour un événement : produit + quantité demandée."""
    __tablename__ = "event_requirements"
    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    quantity = Column(Float, nullable=False, default=0)
    notes = Column(String, default="")

    event = relationship("Event", back_populates="requirements")
    product = relationship("Product")


class AppSetting(Base):
    """Paires clé-valeur pour stocker l'état de l'app (dernière sync Cashpad, etc.)."""
    __tablename__ = "app_settings"
    key = Column(String, primary_key=True)
    value = Column(Text, default="")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class DeliveryCheck(Base):
    """
    Contrôle de réception d'une livraison fournisseur.
    Flux : le serveur compte en aveugle → le gérant saisit le BL → validation → stock.
    """
    __tablename__ = "delivery_checks"
    id = Column(Integer, primary_key=True, index=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=False)
    order_id = Column(Integer, ForeignKey("supplier_orders.id"), nullable=True)  # optionnel
    # Statuts : pending_count (serveur doit compter) / counted (en attente validation) /
    #           validated (stock appliqué) / rejected (refusé par le manager)
    status = Column(String, default="pending_count")
    checked_by = Column(String, default="")       # nom du serveur
    validated_by = Column(String, default="")     # nom du gérant validateur
    bl_reference = Column(String, default="")     # n° BL papier
    bl_photo = Column(Text, default="")            # base64 du BL photographié
    bl_photo_type = Column(String, default="")     # mime type (image/jpeg, image/png, application/pdf)
    notes = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    counted_at = Column(DateTime, nullable=True)
    validated_at = Column(DateTime, nullable=True)

    supplier = relationship("Supplier")
    order = relationship("SupplierOrder")
    items = relationship("DeliveryCheckItem", back_populates="check", cascade="all, delete-orphan")


class DeliveryCheckItem(Base):
    __tablename__ = "delivery_check_items"
    id = Column(Integer, primary_key=True, index=True)
    check_id = Column(Integer, ForeignKey("delivery_checks.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=True)
    product_name = Column(String, default="")     # snapshot
    qty_expected = Column(Float, default=0)       # depuis la commande (null si spontané)
    qty_bl = Column(Float, nullable=True)         # saisi par le gérant (lecture BL)
    qty_physical = Column(Float, nullable=True)   # saisi par le serveur (comptage aveugle)
    qty_validated = Column(Float, nullable=True)  # quantité finale validée = entrée en stock
    unit_price_ht = Column(Float, nullable=True)  # prix unitaire HT saisi depuis le BL
    stock_applied = Column(Boolean, default=False)  # déjà ajouté au stock (évite doublon partiel)
    notes = Column(String, default="")            # "bouteille cassée", etc.

    check = relationship("DeliveryCheck", back_populates="items")
    product = relationship("Product")


class OrderTemplate(Base):
    """Modèle de commande récurrente (ex: 'Commande hebdo Socobo')."""
    __tablename__ = "order_templates"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_used_at = Column(DateTime, nullable=True)

    supplier = relationship("Supplier")
    items = relationship("OrderTemplateItem", back_populates="template", cascade="all, delete-orphan")


class OrderTemplateItem(Base):
    __tablename__ = "order_template_items"
    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(Integer, ForeignKey("order_templates.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    default_qty = Column(Float, default=0)

    template = relationship("OrderTemplate", back_populates="items")
    product = relationship("Product")


class PriceHistory(Base):
    """Historique des variations de prix d'achat d'un produit."""
    __tablename__ = "price_history"
    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    old_price = Column(Float, nullable=True)
    new_price = Column(Float, nullable=False)
    changed_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    source = Column(String, default="")   # "bl_validation" / "manual_edit" / "import"
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=True)
    reference = Column(String, default="")   # n° BL, commande…

    product = relationship("Product")
    supplier = relationship("Supplier")


class StockSnapshot(Base):
    """Photo du stock d'un produit à un instant donné (pour démarque auto hebdo)."""
    __tablename__ = "stock_snapshots"
    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    taken_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    stock = Column(Float, nullable=False, default=0)
    label = Column(String, default="")   # ex: "weekly_auto", "pre_inventory", "user"

    product = relationship("Product")


class ManualLoss(Base):
    """Perte déclarée manuellement : casse, offert maison, vol, etc."""
    __tablename__ = "manual_losses"
    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    quantity = Column(Float, nullable=False)
    reason = Column(String, default="Autre")   # Casse | Offert maison | Vol suspecté | Périmé | Dégustation | Autre
    notes = Column(Text, default="")
    date = Column(DateTime, default=datetime.utcnow)
    staff_name = Column(String, default="")
    stock_updated = Column(Boolean, default=True)  # stock déjà déduit

    product = relationship("Product")


class ServiceAlert(Base):
    """Alerte stock signalée par un serveur (rupture ou stock bas)."""
    __tablename__ = "service_alerts"
    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    reported_stock = Column(Float, nullable=False)
    is_rupture = Column(Boolean, default=False)
    staff_name = Column(String, default="")
    notes = Column(Text, default="")
    status = Column(String, default="open")  # open / acknowledged / ordered / resolved
    created_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)

    product = relationship("Product")
