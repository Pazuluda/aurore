# aurore

Lecteur de musique perso : une vraie app pour **Windows** et **Android**, et un site installable.

## Télécharger

- **Windows** : [aurore-windows-setup.exe](https://github.com/Pazuluda/aurore/releases/latest/download/aurore-windows-setup.exe)
- **Android** : [aurore-android.apk](https://github.com/Pazuluda/aurore/releases/latest/download/aurore-android.apk)
- **Dans le navigateur** : [pazuluda.github.io/aurore](https://pazuluda.github.io/aurore/)

Toutes les versions : [Releases](https://github.com/Pazuluda/aurore/releases).

- **Ajoute ta musique** : un dossier entier sur PC, ou tes fichiers sur téléphone. Tags, pochettes, artistes, albums et disques sont rangés tout seuls (MP3, FLAC, M4A/AAC, OGG, Opus, WAV).
- **Animé par le son** : spectre façon Audacious, mode immersif (touche F) avec halo, spectre et onde, couleurs tirées de la pochette en cours.
- **Organisé comme Spotify** : titres, albums, artistes, playlists, titres likés, les plus écoutés, file d'attente, aléatoire, répétition.
- **Découvertes** : Claude propose des artistes d'après ce que tu écoutes le plus (directement dans la version claude.ai, ou via une conversation Claude préremplie dans l'app installée).

Tout reste sur ton appareil : rien n'est envoyé sur internet, à part les noms de tes artistes préférés quand tu demandes des découvertes.

## Installer la version web

- **Windows** (Edge ou Chrome) : ouvre l'adresse du site, puis l'icône « Installer » dans la barre d'adresse (ou le bouton « Installer l'app » dans aurore).
- **Android** (Chrome) : menu ⋮ → « Installer l'application ».
- **iPhone** (Safari) : bouton Partager → « Sur l'écran d'accueil ».

## Comment c'est construit

- `source/` : le lecteur (HTML, CSS, JS sans dépendance). `python3 source/build.py` produit `index.html`, `sw.js` et le reste du site.
- `apps/windows/` : l'app Windows (Electron). Elle retient tes dossiers de musique et les relit à chaque lancement.
- `apps/android/` : l'app Android (Capacitor), avec la lecture en arrière-plan et la notification de lecture.
- `.github/workflows/apps.yml` : à chaque envoi sur `main`, GitHub compile l'installateur Windows et l'APK, puis les publie dans Releases.

L'APK est signé avec la clé rangée dans les secrets du dépôt (`AURORE_KEYSTORE_B64`, `AURORE_KEYSTORE_PASSWORD`), toujours la même : chaque nouvelle version s'installe par-dessus l'ancienne. Sans ces secrets, la compilation utilise une clé temporaire et le signale.
