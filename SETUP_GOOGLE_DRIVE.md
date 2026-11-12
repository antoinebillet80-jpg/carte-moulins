# 🔐 Configuration Google Drive

Ton app est maintenant prête à se synchroniser avec Google Drive! Voici comment ça marche.

## ✅ Déjà configuré:

- ✓ Identifiants Google Cloud (Client ID + Secret)
- ✓ Backend Node.js pour l'authentification
- ✓ Synchronisation automatique

## 🚀 Lancer l'app

### Terminal 1 - Backend (Port 3000)
```bash
cd C:\Claude\carte-moulins
npm run server
```

Devrait afficher:
```
Serveur lancé sur http://localhost:3000
🔐 Authentification Google: http://localhost:3000/auth/google
```

### Terminal 2 - Frontend (Port 5173)
```bash
cd C:\Claude\carte-moulins
npm run dev
```

Devrait afficher:
```
  ➜  Local:   http://localhost:5173/
```

---

## 🔗 Comment utiliser

1. **Ouvre** http://localhost:5173/
2. **Clique** sur le bouton bleu "🔐 Connexion Google"
3. **Accepte** les permissions Google
4. ✅ **Connecté!** Les données se synchronisent automatiquement avec Drive

---

## 📊 Ce qui se passe:

- **Au démarrage**: L'app charge le fichier `Carte des Moulins.gpx` depuis Google Drive
- **À chaque modification**: Les changements sont automatiquement sauvegardés sur Drive
- **Gestion des droits**: Via Google Drive (partage, permissions, etc.)

---

## 🐛 Dépannage

### "Backend non disponible"
- Vérifie que le serveur Node.js est lancé sur le port 3000
- Vérifie les identifiants dans `.env`

### Erreur d'authentification
- Recharge la page
- Déconnecte-toi et reconnecte-toi

### Fichier GPX non trouvé
- Vérifie que tu as un fichier `Carte des Moulins.gpx` dans ton Google Drive
- Le fichier doit être au nom exact (case-sensitive)

### Données perdues
- Les données sont en mémoire jusqu'à la prochaine sauvegarde
- La sauvegarde est automatique après chaque modification

---

## 📝 Variables d'environnement (.env)

```
GOOGLE_CLIENT_ID=163336672780-...
GOOGLE_CLIENT_SECRET=GOCSPX-...
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
SESSION_SECRET=carte-moulins-dev-secret-key-change-in-production
DRIVE_FILE_NAME=Carte des Moulins.gpx
```

Ne partage JAMAIS le fichier `.env` ou le Client Secret!

---

## 🎯 Prochaines étapes

- Partage le fichier GPX avec d'autres personnes via Google Drive
- Elles pourront voir et modifier les points via le site
- Les droits d'accès sont gérés par Google Drive

**Enjoy! 🎉**
