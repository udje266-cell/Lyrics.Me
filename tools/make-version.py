#!/usr/bin/env python3
"""Génère version.json (mise à jour à distance de l'APK) à partir de sw.js.

À lancer après chaque modification de l'application web, avant le commit :
    python3 tools/make-version.py
L'APK compare « build » à sa version et télécharge les fichiers listés.
« minApk » : versionCode minimal de l'APK capable d'utiliser ces fichiers
(à augmenter quand le code web appelle une nouvelle fonction Android).
"""
import hashlib, json, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
MIN_APK = 16

sw = (ROOT / 'sw.js').read_text()
build = int(re.search(r"VERSION = 'verso-v(\d+)'", sw).group(1))
assets = re.search(r'const ASSETS = \[(.*?)\];', sw, re.S).group(1)
files = [f[2:] for f in re.findall(r"""['"](\./[^'"]+)['"]""", assets) if f != './']
out = {'build': build, 'minApk': MIN_APK, 'files': {f: hashlib.sha256((ROOT / f).read_bytes()).hexdigest()[:16] for f in files}}
(ROOT / 'version.json').write_text(json.dumps(out, indent=1) + '\n')
print(f'version.json : build {build}, {len(files)} fichiers')
