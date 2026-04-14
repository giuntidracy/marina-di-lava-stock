#!/bin/bash
cd "$(dirname "$0")"

echo ""
echo "🍹 Marina di Lava — Gestion de Stock"
echo "──────────────────────────────────────"

# install deps
echo "📦 Installation des dépendances…"
pip3 install -r requirements.txt -q

# check .env
if [ ! -f ".env" ]; then
  echo "⚠️  Fichier .env manquant — copie de .env.example"
  cp .env.example .env
  echo "   → Editez .env et ajoutez votre ANTHROPIC_API_KEY pour l'import des bons de livraison."
  echo ""
fi

# init / seed DB
echo "🗄️  Initialisation de la base de données…"
python3 init_db.py

# get local IP
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || ipconfig getifaddr en2 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "?")

echo ""
echo "✅ Marina di Lava Stock — démarré sur http://localhost:8000"
echo "📱 Accès réseau local : http://${LOCAL_IP}:8000"
echo ""
echo "Ctrl+C pour arrêter."
echo ""

python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
