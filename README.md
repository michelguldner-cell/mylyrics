# MyLyrics

Application web (PWA) de paroles, accords et setlists pour la scène. Fonctionne hors ligne sur iPhone, iPad, Android et ordinateur. Sans abonnement.

**Adresse de l'app :** https://michelguldner-cell.github.io/mylyrics/

## Installation sur un appareil

1. Ouvrir l'adresse ci-dessus dans Safari (iOS) ou Chrome (Android / ordinateur).
2. iOS : bouton Partager → « Sur l'écran d'accueil ». Android / Chrome : menu → « Installer l'application ».
3. L'app se lance ensuite comme une application normale, sans réseau. Les chansons et setlists sont stockées sur l'appareil.

## Format des chansons

Texte brut, compatible avec les fichiers OnSong / ChordPro :

```
Couplet 1:
[G]Je chante [D]ici, [Em]sous les [C]étoiles

Refrain:
[C]Et voilà le re[G]frain
```

- Une ligne qui se termine par `:` est un **titre de section** (affiché en jaune).
- Un accord entre crochets `[G]` s'affiche au-dessus de la syllabe (en cyan). Le bouton ♯ du mode concert masque ou affiche tous les accords.
- Une ligne qui ne contient que des accords (`G  D  Em  C`) est reconnue comme ligne d'accords (intro, solo…).
- Lignes `Key: G`, `Tempo: 120`, `Capo: 2` : affichées en gris.
- Directives ChordPro acceptées : `{title:}`, `{artist:}`, `{comment:}`, `{soc}` / `{eoc}`, `{sov}` / `{eov}`.

### Importer des fichiers OnSong

Bibliothèque → **Importer** → sélectionner un ou plusieurs fichiers `.txt`, `.onsong`, `.pro`, `.cho`, `.chordpro`. La première ligne devient le titre, la deuxième l'artiste. Les accords écrits sur la ligne au-dessus des paroles sont convertis automatiquement en accords inline.

Pour exporter depuis OnSong : Menu → Exporter / Partager → format OnSong ou ChordPro (texte), puis envoyer les fichiers sur l'appareil (AirDrop, Fichiers, Drive…).

### Récupérer une sauvegarde OnSong complète (chansons + setlists)

Dans OnSong : Menu → Sauvegardes → créer une sauvegarde, puis l'envoyer sur le Mac (fichier `OnSong.backup`). Ensuite, dans le dossier du projet :

```bash
node tools/onsong-import.mjs ~/Downloads/OnSong.backup mylyrics-depuis-onsong.json --fixes tools/onsong-fixes.json
```

Le fichier JSON produit se restaure dans l'app via **Réglages → Restaurer une sauvegarde** (sur chaque appareil, ou sur un seul puis synchronisation Drive). Les chansons gardent un identifiant stable : relancer l'import plus tard met à jour au lieu de dupliquer. Nécessite Node 22.5 ou plus.

## Mode concert

- Écran noir, texte blanc, sections en jaune, accords en cyan.
- Navigation : flèches ‹ › , balayage horizontal, tap sur les bords gauche/droit, touches ← → / Page précédente-suivante (compatible pédale Bluetooth type PageFlip / AirTurn).
- **Un tap sur le texte masque la barre d'outils** : seules les paroles restent à l'écran. Un nouveau tap la fait revenir (touche `H` au clavier).
- `⛶` : plein écran du navigateur sur ordinateur et Android (touche `F`). Sur iPad/iPhone, l'app installée sur l'écran d'accueil est déjà en plein écran.
- `Aa` : panneau des tailles, **texte, titres de section et accords réglables indépendamment**, mémorisées par chanson (les valeurs des Réglages servent de défaut ; l'éditeur permet de revenir au défaut). Le panneau contient aussi l'interrupteur des accords. `♯` : accords on/off (touche `C` au clavier). `☰` : liste des chansons de la setlist. `✕` ou `Échap` : quitter.
- L'écran reste allumé pendant le mode concert (si le navigateur le permet).

## Synchronisation Google Drive

Les données sont stockées dans `MyLyrics/mylyrics.json` sur votre Drive. Chaque appareil fusionne ses données avec ce fichier (pour chaque chanson ou setlist, la version la plus récemment modifiée gagne ; une suppression se propage).

À chaque synchronisation qui change quelque chose, une copie datée `mylyrics-AAAA-MM-JJ_HH-MM.json` est déposée dans `MyLyrics/Historique` (les 30 plus récentes sont conservées). Pour revenir en arrière : télécharger la copie voulue depuis Drive, puis Réglages → Restaurer une sauvegarde.

### Créer le Client ID (une seule fois, gratuit)

1. Aller sur https://console.cloud.google.com/ et créer un projet (ex. « MyLyrics »).
2. Menu **API et services → Bibliothèque** : activer **Google Drive API**.
3. **API et services → Écran de consentement OAuth** : type « Externe », nom « MyLyrics », votre e-mail. Dans « Utilisateurs test », ajouter votre adresse Gmail (l'app reste en mode test, ce qui suffit pour un usage personnel).
4. **API et services → Identifiants → Créer des identifiants → ID client OAuth** :
   - Type : **Application Web**
   - Origines JavaScript autorisées : `https://michelguldner-cell.github.io`
   - URI de redirection autorisés : `https://michelguldner-cell.github.io/mylyrics/`
   - (pour tester en local, ajouter aussi `http://localhost:8000` et `http://localhost:8000/`)
5. Copier le **Client ID** (se termine par `.apps.googleusercontent.com`) et le coller dans **Réglages → Google Drive**, puis « Se connecter à Google Drive ».

Ensuite : **Synchroniser maintenant** sur chaque appareil, avant et après vos modifications. La session Google dure environ une heure ; au-delà, l'app redemande simplement la connexion.

## Sauvegarde locale

Réglages → **Exporter une sauvegarde (JSON)** télécharge toutes les chansons et setlists dans un fichier horodaté (`mylyrics-sauvegarde-AAAA-MM-JJ_HH-MM.json`) que vous pouvez garder n'importe où. **Restaurer** fusionne ce fichier avec les données de l'appareil.

## Développement

Aucun build : HTML / CSS / JavaScript pur.

```bash
python3 -m http.server 8000
```

puis ouvrir http://localhost:8000.

Structure :

```
index.html           coquille de l'app
css/app.css          thème sombre
js/app.js            routeur (#/…)
js/db.js             IndexedDB (songs, setlists, settings) + fusion
js/parser.js         analyse du texte (sections, accords, import OnSong)
js/render.js         rendu HTML d'une chanson
js/importer.js       import de fichiers texte
js/backup.js         export / restauration JSON
js/drive.js          OAuth Google + API Drive + synchronisation
js/views/*.js        bibliothèque, éditeur, setlists, mode concert, réglages
sw.js                service worker (hors ligne)
samples/             fichiers d'exemple pour tester l'import
```

### Déployer une nouvelle version

1. Incrémenter `VERSION` dans `sw.js` (et `APP_VERSION` dans `js/app.js`).
2. `git commit` puis `git push` : GitHub Pages publie automatiquement en une à deux minutes.
3. Sur les appareils, rouvrir l'app deux fois (la première charge la nouvelle version en arrière-plan).
