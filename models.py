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
    categories = Column(String, default="")
    products = relationship("Product", back_populates="supplier_rel")
    product_suppliers = relationship("ProductSupplier", back_populates="supplier")


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
