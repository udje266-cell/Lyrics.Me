# Verso pour Android (APK)

L'APK embarque l'application web (fichiers de la racine du dépôt) dans une vue web Android.
Tout fonctionne hors connexion ; les données restent sur le téléphone, dans l'application.

Différences avec la version web :
- « Partager » ouvre la feuille de partage Android (WhatsApp, Instagram…).
- « Télécharger » et les sauvegardes sont enregistrés dans la galerie (`Pictures/Verso`) ou dans `Téléchargements/Verso`.
- Le choix de photo ou de fichier ouvre le sélecteur du téléphone.
- Les données de l'APK sont **séparées** de celles du site dans Chrome : utilisez Réglages → Exporter / Restaurer pour passer de l'un à l'autre.

## Compiler

Prérequis : JDK 17+, Gradle 8.14+, Android SDK (plateforme 35, build-tools 35).

```bash
cd android
echo "sdk.dir=/chemin/vers/android-sdk" > local.properties
gradle assembleDebug                       # APK de test : app/build/outputs/apk/debug/
# APK signée (mises à jour sans désinstaller) :
VERSO_KEYSTORE=/chemin/verso.keystore VERSO_KEYSTORE_PASSWORD=… gradle assembleRelease
```

Conservez précieusement `verso.keystore` et son mot de passe **hors du dépôt** : Android n'accepte une mise à
jour que si elle est signée avec la même clé. Pour une nouvelle version, augmentez `versionCode` dans `app/build.gradle`.
