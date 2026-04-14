"""
Creates tables and injects seed data if the DB doesn't exist yet.
Run: python init_db.py
"""
import os
from database import engine, SessionLocal
from models import Base, Supplier, Product, Cocktail, CocktailIngredient, CashpadMapping

DB_FILE = "marina_stock.db"
already_exists = os.path.exists(DB_FILE)

Base.metadata.create_all(bind=engine)

if already_exists:
    print("✅ Base de données existante — aucun seed.")
else:
    print("🌱 Initialisation de la base de données…")
    db = SessionLocal()

    # ── Fournisseurs ──────────────────────────────────────────────────────
    suppliers = {
        "Socobo": Supplier(name="Socobo", contact="Dominique Sialelli", phone="04 95 23 22 00", categories="Bières, Eaux, Jus, Anisés"),
        "Auchan": Supplier(name="Auchan", contact="Drive Pro", phone="04 95 10 00 00", categories="Spiritueux, Sodas, Eaux"),
        "Vinipolis": Supplier(name="Vinipolis", contact="Marc Dupont", phone="04 91 23 45 67", categories="Vins, Champagnes, Apéritifs"),
        "Cocktalis": Supplier(name="Cocktalis", contact="Service client", phone="", categories="Cocktails sans alcool"),
    }
    for s in suppliers.values():
        db.add(s)
    db.flush()

    def s(name):
        return suppliers[name].id

    # ── Produits ──────────────────────────────────────────────────────────
    raw_products = [
        # name, category, stock, unit, qty_per_pack, volume_cl, threshold, px_achat, px_vente, supplier, estimated
        ("Fût Pietra Blonde 30L",   "Bières",        3,   "Fût",       1,  3000, 2,  89.0,    None,  "Socobo",   False),
        ("Fût Pietra Ambrée 20L",   "Bières",        1,   "Fût",       1,  2000, 1,  65.0,    None,  "Socobo",   False),
        ("Pietra Limoncella 33cl",  "Bières",        6,   "Carton 12", 12, 33,   2,  23.88,   7.0,   "Socobo",   False),
        ("Pietra Summer 33cl",      "Bières",        3,   "Carton 24", 24, 33,   1,  16.8,    6.5,   "Socobo",   True),
        ("Colomba Blanche",         "Bières",        2,   "Carton 24", 24, 25,   1,  15.6,    5.5,   "Socobo",   True),
        ("Desperados",              "Bières",        5,   "Carton 24", 24, 25,   2,  20.4,    6.5,   "Socobo",   True),
        ("Heineken 25cl",           "Bières",        2,   "Carton 24", 24, 25,   1,  16.8,    4.5,   "Auchan",   True),
        ("Bud",                     "Bières",        3,   "Carton 24", 24, 25,   1,  15.6,    5.5,   "Auchan",   True),
        ("Santini Blanc 75cl",      "Vins Blancs",   73,  "Bouteille", 1,  75,   20, 8.5,     20.0,  "Vinipolis",False),
        ("1769 Blanc",              "Vins Blancs",   21,  "Bouteille", 1,  75,   6,  12.0,    29.0,  "Vinipolis",True),
        ("San Ghjuva Blanc 75cl",   "Vins Blancs",   17,  "Bouteille", 1,  75,   6,  10.0,    24.0,  "Vinipolis",True),
        ("Sant Armettu Rosumarinu", "Vins Blancs",   12,  "Bouteille", 1,  75,   4,  14.0,    35.0,  "Vinipolis",True),
        ("Pieretti Blanc",          "Vins Blancs",   9,   "Bouteille", 1,  75,   3,  13.0,    33.0,  "Vinipolis",True),
        ("Santini Rosé 75cl",       "Vins Rosés",    153, "Bouteille", 1,  75,   40, 8.5,     20.0,  "Vinipolis",False),
        ("Fiumicicoli Rosé 75cl",   "Vins Rosés",    30,  "Bouteille", 1,  75,   10, 11.0,    28.0,  "Vinipolis",True),
        ("Ornasca Rosé",            "Vins Rosés",    15,  "Bouteille", 1,  75,   5,  10.0,    26.0,  "Vinipolis",True),
        ("Alzeto Rosé 75cl",        "Vins Rosés",    13,  "Bouteille", 1,  75,   4,  13.0,    36.0,  "Vinipolis",True),
        ("Santini Rouge 75cl",      "Vins Rouges",   0,   "Bouteille", 1,  75,   6,  8.5,     16.0,  "Vinipolis",False),
        ("Saparale Rouge 75cl",     "Vins Rouges",   18,  "Bouteille", 1,  75,   5,  10.0,    26.0,  "Vinipolis",True),
        ("Moët & Chandon Brut",     "Champagnes",    6,   "Bouteille", 1,  75,   3,  32.0,    95.0,  "Vinipolis",False),
        ("Laurent Perrier Rosé",    "Champagnes",    4,   "Bouteille", 1,  75,   2,  55.0,    120.0, "Vinipolis",False),
        ("Pastis 51 1L",            "Anisés",        11,  "Bouteille", 1,  100,  3,  16.838,  3.5,   "Auchan",   False),
        ("Ricard 1L",               "Anisés",        13,  "Bouteille", 1,  100,  4,  16.63,   3.5,   "Auchan",   False),
        ("Casanis 1L",              "Anisés",        2,   "Bouteille", 1,  100,  1,  14.84,   3.5,   "Socobo",   False),
        ("Aperol",                  "Apéritifs",     18,  "Bouteille", 1,  70,   5,  12.0,    6.0,   "Auchan",   False),
        ("Campari",                 "Apéritifs",     3,   "Bouteille", 1,  70,   2,  14.0,    6.0,   "Auchan",   False),
        ("Cap Mattei Blanc",        "Apéritifs",     1,   "Bouteille", 1,  75,   2,  15.298,  6.0,   "Auchan",   False),
        ("Cap Mattei Rouge",        "Apéritifs",     1,   "Bouteille", 1,  75,   2,  15.298,  6.0,   "Auchan",   False),
        ("Martini Bianco",          "Apéritifs",     2,   "Bouteille", 1,  75,   1,  11.0,    6.0,   "Auchan",   True),
        ("Muscat Pétillant",        "Apéritifs",     8,   "Bouteille", 1,  75,   3,  9.0,     6.0,   "Vinipolis",True),
        ("St Germain",              "Apéritifs",     4,   "Bouteille", 1,  70,   2,  18.0,    14.0,  "Auchan",   True),
        ("Prosecco",                "Apéritifs",     1,   "Bouteille", 1,  75,   3,  8.0,     7.0,   "Auchan",   True),
        ("Havana Club 3 ans",       "Rhums",         40,  "Bouteille", 1,  70,   10, 16.0,    8.0,   "Auchan",   False),
        ("Captain Morgan",          "Rhums",         3,   "Bouteille", 1,  70,   2,  18.0,    8.0,   "Auchan",   True),
        ("Diplomatico",             "Rhums",         2,   "Bouteille", 1,  70,   1,  28.0,    13.0,  "Auchan",   True),
        ("Gin Gordon's",            "Gins",          5,   "Bouteille", 1,  70,   2,  16.0,    8.0,   "Auchan",   False),
        ("Hendrick's Gin",          "Gins",          2,   "Bouteille", 1,  70,   1,  32.0,    13.0,  "Auchan",   False),
        ("Gin Mattei",              "Gins",          2,   "Bouteille", 1,  70,   1,  22.0,    11.0,  "Auchan",   True),
        ("Johnnie Walker",          "Whiskies",      2,   "Bouteille", 1,  70,   1,  22.0,    8.0,   "Auchan",   False),
        ("Jack Daniel's",           "Whiskies",      2,   "Bouteille", 1,  70,   1,  24.0,    10.0,  "Auchan",   False),
        ("Jack Daniel's Honey",     "Whiskies",      1,   "Bouteille", 1,  70,   1,  24.0,    10.0,  "Auchan",   False),
        ("Vodka Poliakov",          "Vodkas",        9,   "Bouteille", 1,  70,   3,  9.26,    8.0,   "Auchan",   False),
        ("Janeiro",                 "Cachaça",       6,   "Bouteille", 1,  70,   2,  18.0,    8.0,   "Auchan",   True),
        ("José Cuervo",             "Tequilas",      2,   "Bouteille", 1,  70,   1,  18.0,    8.0,   "Auchan",   False),
        ("Get 27",                  "Digestifs",     8,   "Bouteille", 1,  70,   3,  14.0,    7.0,   "Socobo",   False),
        ("Myrte",                   "Digestifs",     5,   "Bouteille", 1,  70,   2,  18.0,    7.0,   "Vinipolis",True),
        ("Limoncello",              "Digestifs",     3,   "Bouteille", 1,  70,   1,  12.0,    7.0,   "Auchan",   False),
        ("Menthe Poivrée",          "Digestifs",     4,   "Bouteille", 1,  70,   2,  12.0,    8.0,   "Auchan",   True),
        ("ST Georges 1,5L",         "Eaux",          54,  "Bouteille", 1,  150,  12, 2.21,    5.0,   "Auchan",   False),
        ("Orezza 33cl",             "Eaux",          12,  "Carton 6",  6,  33,   3,  5.289,   3.5,   "Socobo",   False),
        ("Orezza 1L",               "Eaux",          15,  "Bouteille", 1,  100,  4,  7.08,    6.0,   "Auchan",   False),
        ("San Pellegrino 1L",       "Eaux",          11,  "Bouteille", 1,  100,  3,  5.55,    5.0,   "Socobo",   False),
        ("ST Georges 33cl",         "Eaux",          20,  "Carton 24", 24, 33,   5,  0.437,   3.0,   "Socobo",   False),
        ("Coca-Cola 33cl",          "Sodas",         20,  "Carton 24", 24, 33,   5,  12.14,   3.5,   "Auchan",   False),
        ("Ice Tea Pêche 33cl",      "Sodas",         13,  "Carton 24", 24, 33,   4,  0.696,   3.5,   "Socobo",   False),
        ("Coca Zéro 33cl",          "Sodas",         11,  "Carton 24", 24, 33,   3,  12.14,   3.5,   "Auchan",   True),
        ("Liptonic 33cl",           "Sodas",         8,   "Carton 24", 24, 33,   2,  4.07,    3.5,   "Auchan",   True),
        ("Cocktalis Virgin Mojito", "Cocktails SA",  3,   "Bouteille", 1,  75,   2,  6.5,     9.0,   "Cocktalis",False),
        ("Cocktalis Caribbean Sun", "Cocktails SA",  2,   "Bouteille", 1,  75,   2,  6.5,     7.5,   "Cocktalis",False),
        ("Cocktalis Peace & Love",  "Cocktails SA",  2,   "Bouteille", 1,  75,   2,  6.5,     7.5,   "Cocktalis",False),
        ("Cocktalis Jungle Green",  "Cocktails SA",  1,   "Bouteille", 1,  75,   2,  6.5,     7.5,   "Cocktalis",False),
    ]

    products = {}
    for row in raw_products:
        name, cat, stock, unit, qty, vol, thr, px_a, px_v, sup, est = row
        p = Product(
            name=name, category=cat, stock=stock, unit=unit,
            qty_per_pack=qty, volume_cl=vol, alert_threshold=thr,
            purchase_price=px_a, sale_price_ttc=px_v,
            supplier_id=suppliers[sup].id, is_estimated=est,
        )
        db.add(p)
        products[name] = p
    db.flush()

    # ── Cocktails & recettes ──────────────────────────────────────────────
    def p(name):
        return products[name].id

    cocktail_recipes = [
        ("Mojito Cubain",       12.0,  [("Havana Club 3 ans", 4)]),
        ("Mojito Fraise",       13.5,  [("Havana Club 3 ans", 4)]),
        ("Punch",               6.0,   [("Havana Club 3 ans", 4)]),
        ("Ti Punch",            11.0,  [("Havana Club 3 ans", 4)]),
        ("Daiquiri",            12.0,  [("Havana Club 3 ans", 4)]),
        ("Daiquiri Fraise",     12.0,  [("Havana Club 3 ans", 4)]),
        ("Cuba libre",          10.0,  [("Havana Club 3 ans", 4)]),
        ("Pina Colada",         13.5,  [("Havana Club 3 ans", 4)]),
        ("Planteur des îles",   8.0,   [("Havana Club 3 ans", 4)]),
        ("Maï Taï",             13.5,  [("Havana Club 3 ans", 2), ("Captain Morgan", 2)]),
        ("Caïpirinha",          12.0,  [("Janeiro", 4)]),
        ("Caïpirinha Fraise",   13.5,  [("Janeiro", 4)]),
        ("Caïpirinha Jack",     13.5,  [("Jack Daniel's Honey", 4)]),
        ("Aperol Spritz",       11.0,  [("Aperol", 4), ("Prosecco", 12)]),
        ("Campari Spritz",      13.5,  [("Campari", 4), ("Prosecco", 12)]),
        ("Capo'Spritz Blanc",   12.0,  [("Cap Mattei Blanc", 4), ("Muscat Pétillant", 12)]),
        ("Capo'Spritz Rouge",   12.0,  [("Cap Mattei Rouge", 4), ("Muscat Pétillant", 12)]),
        ("St Germain Spritz",   14.0,  [("St Germain", 4), ("Muscat Pétillant", 12)]),
        ("Limoncello Spritz",   13.5,  [("Limoncello", 4), ("Prosecco", 12)]),
        ("Gin Tonic",           11.0,  [("Gin Gordon's", 4)]),
        ("Gin Tonic Corsica",   11.0,  [("Gin Mattei", 4)]),
        ("Gin Fizz",            12.5,  [("Gin Gordon's", 4)]),
        ("Gin Mule",            12.5,  [("Gin Gordon's", 4)]),
        ("Basil Hendrick's",    13.5,  [("Hendrick's Gin", 4)]),
        ("Margarita",           11.5,  [("José Cuervo", 4)]),
        ("Sex on The Beach",    13.5,  [("Vodka Poliakov", 4)]),
        ("Moscow Mule",         12.0,  [("Vodka Poliakov", 4)]),
        ("Cosmopolitan",        13.0,  [("Vodka Poliakov", 4)]),
        ("Porn",                12.0,  [("Vodka Poliakov", 4)]),
        ("Espresso Martini",    12.0,  [("Vodka Poliakov", 4)]),
        ("Americano",           10.0,  [("Martini Bianco", 3), ("Campari", 3)]),
        ("Irish Coffee",        13.0,  [("Johnnie Walker", 4)]),
        ("Cap Corse Tonic",     10.0,  [("Cap Mattei Blanc", 4)]),
        ("Sangria rouge 1L",    25.0,  [("Santini Rouge 75cl", 75)]),
        ("Sangria blanc 1L",    25.0,  [("Santini Blanc 75cl", 75)]),
        ("Verre Blanc 15cl",    7.0,   [("Santini Blanc 75cl", 15)]),
        ("Verre Rosé 15cl",     7.0,   [("Santini Rosé 75cl", 15)]),
        ("Verre Rouge 15cl",    7.0,   [("Santini Rouge 75cl", 15)]),
        ("Piscine Blanc 20cl",  7.0,   [("Santini Blanc 75cl", 20)]),
        ("Piscine Rosé 20cl",   7.0,   [("Santini Rosé 75cl", 20)]),
        ("Coupe Champagne 12cl",12.0,  [("Moët & Chandon Brut", 12)]),
        ("Virgin Mojito",       9.0,   [("Cocktalis Virgin Mojito", 4)]),
        ("Virgin Mojito Fraise",10.0,  [("Cocktalis Virgin Mojito", 4)]),
        ("Virgin Pina Colada",  10.0,  [("Cocktalis Caribbean Sun", 4)]),
        ("Peace and Love",      7.5,   [("Cocktalis Peace & Love", 4)]),
        ("Carribean Sun",       7.5,   [("Cocktalis Caribbean Sun", 4)]),
        ("Jungle Green",        7.5,   [("Cocktalis Jungle Green", 4)]),
    ]

    cocktails = {}
    for name, prix, ings in cocktail_recipes:
        c = Cocktail(name=name, sale_price_ttc=prix)
        db.add(c)
        db.flush()
        for prod_name, dose in ings:
            db.add(CocktailIngredient(cocktail_id=c.id, product_id=products[prod_name].id, dose_cl=dose))
        cocktails[name] = c
    db.flush()

    # ── Cashpad mapping ───────────────────────────────────────────────────
    # Anisés — Pastis 51 1L
    pastis51_id = products["Pastis 51 1L"].id
    ricard_id   = products["Ricard 1L"].id
    casanis_id  = products["Casanis 1L"].id
    pietra_blonde_id = products["Fût Pietra Blonde 30L"].id
    pietra_ambree_id = products["Fût Pietra Ambrée 20L"].id
    santini_rose_id  = products["Santini Rosé 75cl"].id
    santini_blanc_id = products["Santini Blanc 75cl"].id
    santini_rouge_id = products["Santini Rouge 75cl"].id

    direct_mappings = [
        # (nom_cashpad, product_id, dose_cl)
        ("Pastis 51", pastis51_id, 3), ("Pastis 51 Mauresque 3cl", pastis51_id, 3),
        ("Pastis 51 Tomate", pastis51_id, 3), ("Pastis 51 Perroquet 3cl", pastis51_id, 3),
        ("Double Pastis 51", pastis51_id, 6),
        ("Ricard", ricard_id, 3), ("Ricard Mauresque 3cl", ricard_id, 3),
        ("Ricard Tomate 3cl", ricard_id, 3), ("Ricard Perroquet 3cl", ricard_id, 3),
        ("Double Ricard", ricard_id, 6),
        ("Casanis", casanis_id, 3), ("Casanis Mauresque 3cl", casanis_id, 3),
        ("Casanis Tomate 3cl", casanis_id, 3), ("Casanis Perroquet 3cl", casanis_id, 3),
        ("Double Casanis", casanis_id, 6),
        # bières pression
        ("Pietra Blonde Pression 25cl", pietra_blonde_id, 25),
        ("Pietra Blonde Pinte", pietra_blonde_id, 50),
        ("Panaché Pietra Blonde 25cl", pietra_blonde_id, 25),
        ("Panaché Pinte Pietra Blonde", pietra_blonde_id, 50),
        ("Monaco Pietra blonde 25cl", pietra_blonde_id, 25),
        ("Monaco Pinte Pietra Blonde", pietra_blonde_id, 50),
        ("Tango Pietra Blonde 25cl", pietra_blonde_id, 25),
        ("Tango pinte Pietra Blonde", pietra_blonde_id, 50),
        ("Pêche Pietra Blonde 25cl", pietra_blonde_id, 25),
        ("Pêche Pinte Pietra Blonde", pietra_blonde_id, 50),
        ("Piètra Ambrée pression 25cl", pietra_ambree_id, 25),
        ("Pietra Ambrée Pinte 50cl", pietra_ambree_id, 50),
        # vins — bouteille entière et verres
        ("Verre Rosé 15cl", santini_rose_id, 15),
        ("Piscine Rosé 20cl", santini_rose_id, 20),
        ("Santini Rosé75cl", santini_rose_id, 75),
        ("Verre Blanc 15cl", santini_blanc_id, 15),
        ("Piscine Blanc 20cl", santini_blanc_id, 20),
        ("Santini Blanc 75cl", santini_blanc_id, 75),
        ("Verre Rouge 15cl", santini_rouge_id, 15),
    ]

    for nom, prod_id, dose in direct_mappings:
        db.add(CashpadMapping(nom_cashpad=nom, product_id=prod_id, dose_cl=dose, mapping_type="direct", ignored=False))

    # cocktails via recette
    for cname, cocktail in cocktails.items():
        db.add(CashpadMapping(nom_cashpad=cname, cocktail_id=cocktail.id, dose_cl=0, mapping_type="cocktail", ignored=False))

    # ignorés
    ignored_names = [
        "Café", "Café allongé", "Thé", "Chocolat chaud", "Citron pressé", "Orange pressée",
        "Cocktail du Jour", "Sirop", "Diabolo Menthe", "Diabolo Fraise", "Diabolo Citron",
        "Boissons chaudes", "Sirops", "Diabolos",
    ]
    for nom in ignored_names:
        db.add(CashpadMapping(nom_cashpad=nom, product_id=None, dose_cl=0, mapping_type="direct", ignored=True))

    db.commit()
    print(f"✅ Seed terminé — {len(raw_products)} produits, {len(cocktail_recipes)} cocktails, {len(direct_mappings)} mappings Cashpad.")
    db.close()
