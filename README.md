# Verso — paroles et cartes

Application personnelle (PWA) pour conserver des paroles de chansons et créer des cartes visuelles à partir de vos passages préférés. Interface en français, pensée d'abord pour le téléphone (Android), utilisable sur ordinateur, installable sur l'écran d'accueil, utilisable hors connexion.

## Architecture

- **Aucune dépendance, aucune étape de compilation** : HTML, CSS et JavaScript (modules ES) servis tels quels.
- **Stockage local IndexedDB** (`js/db.js`) : morceaux, passages, cartes (réglages + images en Blob), modèles personnels, réglages. Rien n'est envoyé sur un serveur.
- **Moteur de rendu canvas unique** (`js/render.js`) : le même code dessine l'aperçu et le fichier exporté. La mise en page est toujours calculée en unités de l'export (1080 px de large), puis mise à l'échelle : l'aperçu coupe les lignes exactement comme l'image finale.
- **Sources de paroles** (`js/sources.js`) : structure extensible ; LRCLIB branchée.
- **Service worker** (`sw.js`) : met l'application et les polices en cache pour le hors-ligne.
- Polices embarquées (licence SIL OFL, sous-ensembles latin + latin étendu) : Inter, Playfair Display, DM Serif Display, Lora, Space Grotesk, Bebas Neue, Caveat.

```
index.html  manifest.webmanifest  sw.js
css/styles.css  css/fonts.css  fonts/  icons/
js/app.js      écrans : accueil, bibliothèque, ajout, morceau, galerie, réglages
js/studio.js   studio de création, export, partage
js/albums.js   albums : formulaire, page d'album, rattachement des morceaux
js/render.js   rendu des cartes, modèles, palette, textures
js/sources.js  sources externes de paroles
js/db.js       IndexedDB, sauvegarde/restauration
```

## Lancer l'application

Il faut un petit serveur web local (les modules ES et le service worker ne fonctionnent pas en ouvrant le fichier directement) :

```bash
cd Lyrics.Me
python3 -m http.server 8080
# puis ouvrir http://localhost:8080
```

### Adresse en ligne (GitHub Pages)

**https://udje266-cell.github.io/Lyrics.Me/** — publiée depuis la branche `ccr-73841f22-0i93p9`, dossier `/ (root)` (Settings → Pages). Chaque envoi sur cette branche met le site à jour.

### Application Android (APK)

Téléchargement direct : **https://udje266-cell.github.io/Lyrics.Me/dist/Verso.apk** (ouvrir le fichier sur le téléphone, autoriser l'installation depuis cette source). Code et compilation : `android/README.md`.

### L'utiliser sur votre téléphone

L'installation (PWA) et le service worker exigent **HTTPS** (sauf `localhost`). Options gratuites, à choisir quand vous le souhaitez — rien n'a été publié :

- **GitHub Pages** : Settings → Pages → branche à publier. Gratuit. Attention, l'URL est publique (l'application est vide pour toute autre personne : vos données restent dans votre navigateur), mais le code est visible.
- **Netlify / Cloudflare Pages** : glisser-déposer du dossier, gratuit.
- Sur le même Wi-Fi sans HTTPS, l'application fonctionne mais ne s'installe pas et ne marche pas hors connexion.

Ensuite, dans Chrome Android : menu ⋮ → « Installer l'application ».

Après une modification du code, incrémentez `VERSION` dans `sw.js` pour que les appareils récupèrent la nouvelle version.

## Intégrations

**LRCLIB** (https://lrclib.net) — vérifiée avant intégration : API publique, gratuite, sans clé ni compte, autorise les appels depuis le navigateur (CORS), et renvoie **les paroles complètes** (`plainLyrics`). Les paroles sont contribuées par sa communauté : l'application les présente toujours pour vérification et correction avant l'ajout, et conserve la source (« LRCLIB » + lien). Aucun coût.

**Deezer** (images d'artiste et d'album) — vérifiée avant intégration : API publique gratuite, sans clé. Elle n'envoie pas d'en-tête CORS, donc l'application l'appelle en JSONP ; les images (1000 × 1000 px) sont servies avec CORS et peuvent donc être exportées dans les cartes. L'application reconnaît l'artiste et l'album à partir du titre et de l'artiste, puis propose la pochette de l'album, la photo de l'artiste et les pochettes de ses autres albums. Boutons : « 🎵 Trouver la pochette » (fiche du morceau) et « 🎵 Images de l'artiste » (studio). L'image choisie est copiée dans la carte (utilisable hors connexion) avec sa provenance. Usage personnel : les droits des images appartiennent aux artistes et à leurs labels. Aucun coût.

Sources examinées et non retenues :
- **iTunes Search** : pochettes seulement, pas de photos d'artiste. **MusicBrainz / Cover Art Archive** : pochettes seulement.
- **Genius API** : fournit titres, artistes, pochettes, mais **pas les paroles** (seulement un lien vers la page). Extraire la page web serait contraire à ses conditions.
- **Musixmatch API** : clé obligatoire ; l'offre gratuite ne fournit que 30 % des paroles, le texte complet exige une licence commerciale payante.
- **Pages web quelconques** (Instagram, Facebook, sites d'artistes…) : un navigateur ne peut pas lire le contenu d'un autre site (CORS), et ces sites l'interdisent. L'application l'explique et propose immédiatement de coller le texte, en gardant le lien comme source.

Aucune clé secrète n'est utilisée. Une source nécessitant une clé devra passer par un petit serveur intermédiaire (non fourni) pour ne pas exposer la clé.

## Fonctionnalités réalisées

- **Ajout** : formulaire manuel complet (titre, artiste, invités, album, paroles, pochette, langue, collection, étiquettes, lien d'origine, note), import `.txt` (UTF-8 ou Windows-1252), recherche LRCLIB avec choix de version (titre, artiste, album, durée, source) puis vérification, import depuis un lien LRCLIB, explication claire pour les liens non pris en charge. Structure conservée (paragraphes, [Refrain]…). Détection des doublons probables (titre + artiste, sans tenir compte des accents/majuscules/« œ »).
- **Discographie d'un artiste** (Ajouter → Artiste) : recherche de l'artiste, liste de ses albums, EP, singles et compilations (Deezer) à cocher, puis import des pochettes, des titres (numéros de piste, artistes invités séparés) et des paroles trouvées sur LRCLIB. Les titres sans paroles sont ajoutés avec la mention « (paroles manquantes) » ; filtre dédié dans la bibliothèque et bouton « Chercher sur LRCLIB » sur chaque titre. Les titres déjà présents sont rattachés sans doublon ; import interruptible.
- **Albums** : saisie manuelle d'un album (titre, artiste, année, langue, collection, étiquettes, lien, note, pochette depuis la galerie ou « 🎵 Trouver la pochette ») avec ses morceaux et leurs paroles (collées, un .txt par morceau, ou plusieurs .txt d'un coup : le nom du fichier devient le titre). Page d'album avec la liste des pistes, ajout d'un morceau prérempli, modification (ordre des pistes, pochette propagée aux morceaux), suppression de l'album seul ou avec ses morceaux (corbeille). Un morceau dont l'album existe déjà y est rattaché automatiquement et reprend sa pochette. Vue « 💿 Albums » dans la bibliothèque.
- **Bibliothèque** : recherche plein texte (titre, artiste, album, paroles, avec extrait surligné), tri date/titre/artiste, filtres langue/collection/étiquette/favoris, collections et étiquettes libres, favoris, modification, corbeille avec annulation immédiate, restauration et suppression définitive.
- **Lecture** : pochette, infos, lien source, note, taille de texte réglable (mémorisée), mode lecture confortable, cartes déjà créées pour ce morceau.
- **Sélection** : toucher pour (dé)sélectionner, appui long ou bouton « Plage » pour une plage, passages éloignés, séparateur « … » activable, aperçu immédiat, effacer, passages favoris avec note.
- **Studio** : 7 modèles : Bandeau (par défaut : fond « Ambiance » généré ou votre photo, lignes sur bandes blanches, bandeau ARTISTE, « TITRE » en bas, votre signature à droite), Minimaliste (bandes sur Ambiance Nuit), Éditorial (grand guillemet sur papier), Pochette (pochette, ou votre photo, ou l'icône Verso), Photo (voile progressif), Vinyle (disque hors cadre, étiquette pochette ou icône Verso), Typographique (texte qui remplit la carte). Aucun modèle ne dépend d'images d'artiste ; logo Verso en coin, désactivable, clair ou foncé selon le fond ; police des informations réglable ; bandes derrière les lignes, remplissage automatique, ombre, voile progressif réglables ; police, graisse, italique, majuscules, taille, couleur, alignement, interligne, marges, position (curseur ou glisser sur l'aperçu) ; mots mis en évidence (couleur, gras ou surlignage, sélection par simple toucher, option « atténuer le reste ») ; fonds « Ambiance » générés (7 palettes, variations à volonté, aucune image extérieure), uni, dégradé, pochette, photo importée, 4 textures ; zoom/déplacement (glisser, pincer, molette), flou, voile clair ou sombre ; palette extraite de l'image, modifiable, applicable au fond/texte/accent, harmonie automatique ; titre, artiste, pochette, signature affichables/masquables et positionnables ; extrait et retours à la ligne modifiables sans toucher aux paroles d'origine ; annuler/rétablir ; réinitialiser ; sauvegarde automatique en brouillon ; dupliquer ; modèles personnels ; copier le style d'une autre création. Aucun filigrane.
- **Texte jamais coupé** : alerte dans l'aperçu dès que le texte dépasse, avec « Réduire à N » ou « Répartir sur plusieurs cartes » ; l'export refuse de produire une image coupée et propose la réduction.
- **Export** : PNG ou JPEG en 1080×1080, 1080×1350, 1080×1920 ; nom de fichier modifiable ; partage natif (WhatsApp, Instagram…) via la feuille de partage du téléphone, téléchargement sinon ; export des 3 formats d'un coup ; export d'une série issue d'un même passage.
- **Galerie** : aperçu, extrait, titre/artiste figés à la création, réglages, images (copiées dans la carte : supprimer ou modifier le morceau ne casse rien), dates ; rouvrir, modifier, dupliquer, exporter, supprimer ; brouillons séparés.
- **Données** : persistance IndexedDB, demande de stockage persistant, espace utilisé affiché, hors-ligne, sauvegarde complète `.json` (images incluses), restauration par fusion sans doublon, messages explicites en cas de manque d'espace ou d'erreur. L'écran Réglages indique clairement que les données restent sur l'appareil et ne sont pas synchronisées.
- Thèmes sombre, clair, automatique ; navigation au pouce sur téléphone, rail latéral sur ordinateur ; logo et icône fournis utilisés tels quels (`icons/logo.png`, `icons/icon.png`, fichiers d'origine non modifiés).

## Vérifications effectuées

Parcours automatisés dans Chromium (profil Pixel 7, Playwright), tous réussis, sans erreur JavaScript :

1. Ajout manuel avec pochette et source ✔ ; doublon détecté (« mon coeur balance » vs « Mon cœur balance ») ✔
2. Recherche par phrase des paroles (« meme quand la nuit », sans accent) ✔
3. Sélection de passages éloignés avec « … », sélection d'une plage, passage favori ✔
4. Carte avec photo importée, palette extraite, modèle Photo, mot mis en évidence ✔
5. Passage en Story : canvas 1080×1920, réglages conservés ✔
6. Export PNG 1080×1920, nom « Artiste Test - Mon coeur balance.png » ✔ ; alerte de dépassement à 180 px puis ajustement ✔
7. Données retrouvées après rechargement ✔
8. Réouverture d'une carte, modification, annuler/rétablir ✔
9. Sauvegarde puis restauration : 0 ajout sur le même appareil (pas de doublon), restauration complète sur un navigateur vierge (cartes et pochettes) ✔
10. Lien Instagram : explication + formulaire de collage ✔ ; recherche LRCLIB réelle (« Hello », Adele) et aperçu à vérifier ✔
11. Suppression d'un morceau avec « Annuler », cartes intactes ✔

Non testé sur un vrai téléphone Android (partage natif vers WhatsApp/Instagram en particulier) : à valider de votre côté.

## Limites restantes

- Données sur un seul appareil/navigateur, pas de synchronisation. Effacer les données du navigateur efface Verso : exportez des sauvegardes.
- Une seule source automatique (LRCLIB) ; sa couverture des artistes ivoiriens/africains peut être limitée.
- Le flou d'image utilise `ctx.filter`, absent de Safari avant la version 18 (l'image s'affiche alors sans flou).
- La mise en évidence porte sur des mots isolés, pas sur des expressions de plusieurs mots.
- Pas d'OCR, de cartes animées, de traduction ni de synchronisation (évolutions prévues dans le cahier des charges).
