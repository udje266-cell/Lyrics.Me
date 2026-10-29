# Génère la pub Verso (1080×1920, 30 i/s) : vrais écrans de l'application Android en plein cadre,
# touchers visibles (point + onde Material), transitions Material (container transform,
# shared axis, fade through), défilements, calés mot à mot sur la voix off.
# Relancer après un changement de voix ou de captures : python3 build.py
import json, html, pathlib

ROOT = pathlib.Path(__file__).parent
W, H, OFF, SCR_H = 1080, 1920, 84, 1788          # barre d'état 84 px, écran 1788 px, geste 48 px
R = json.load(open(ROOT / 'assets/screens/rects.json'))
words = json.load(open(ROOT / 'assets/transcript.json'))
FIX = {5: 'vibrer…', 6: 'et', 32: 'les', 68: 'Sept', 69: 'styles :', 70: 'Bandeau,', 71: 'Vinyle,', 72: 'Éditorial,', 73: 'Typographique…',
       96: 'Carré,', 97: 'Portrait,', 98: 'Story.', 99: 'Un', 100: 'toucher,', 126: 'musicale', 127: 'et', 137: 'cartes.'}
for i, txt in FIX.items():
    words[i]['text'] = txt
END = 53.1
t = lambda i: words[i]['start']

# --- Sous-titres ------------------------------------------------------------
groups, cur = [], []
for w in words[:132]:  # la carte de fin porte le slogan : pas de sous-titres dessus
    cur.append(w)
    if w['text'][-1] in '.,?!:…' or len(cur) >= 5:
        groups.append(cur); cur = []
if cur: groups.append(cur)

def captions_file():
    rows, js = [], []
    for g, ws in enumerate(groups):
        s = ws[0]['start']
        e = groups[g + 1][0]['start'] if g + 1 < len(groups) else t(132)
        e = min(e, ws[-1]['end'] + 0.6)
        spans = ' '.join(f'<span id="cw{g}-{k}">{html.escape(w["text"])}</span>' for k, w in enumerate(ws))
        rows.append(f'<div id="cg{g}" class="clip cap" data-start="{s:.2f}" data-duration="{max(0.3, e - s):.2f}" data-track-index="3"><p>{spans}</p></div>')
        js.append(f'tl.fromTo("#cg{g} p", {{y: 24, opacity: 0, scale: 0.96}}, {{y: 0, opacity: 1, scale: 1, duration: 0.18, ease: "power3.out"}}, {s:.2f});')
        for k, w in enumerate(ws):
            js.append(f'tl.fromTo("#cw{g}-{k}", {{color: "#ffffff"}}, {{color: "#cce988", duration: 0.05}}, {w["start"]:.2f});')
            js.append(f'tl.to("#cw{g}-{k}", {{color: "#ffffff", duration: 0.12}}, {max(w["end"], w["start"] + 0.15):.2f});')
    (ROOT / 'compositions/captions.html').write_text(f'''<template>
  <style>
    #root {{ position: absolute; inset: 0; pointer-events: none; }}
    .cap {{ position: absolute; left: 80px; right: 80px; top: 1170px; text-align: center; }}
    .cap p {{ display: inline-block; padding: 14px 26px 18px; border-radius: 28px; background: rgba(10, 14, 9, 0.82); font-family: Inter, sans-serif; font-weight: 900; font-size: 56px; line-height: 1.12; color: #fff; letter-spacing: -0.01em; box-shadow: 0 10px 40px rgba(0,0,0,.35); }}
  </style>
  <div id="root" data-composition-id="captions" data-width="{W}" data-height="{H}">
{chr(10).join(rows)}
  </div>
  <script>
    const tl = gsap.timeline({{ paused: true }});
    {chr(10).join('    ' + j for j in js).strip()}
    window.__timelines["captions"] = tl;
  </script>
</template>
''')

# --- Outils de scène --------------------------------------------------------
SCENES = []

def scene(sid, start, end, body, js):
    SCENES.append((sid, start, end))
    (ROOT / f'compositions/{sid}.html').write_text(f'''<template>
  <style>
    #root {{ position: absolute; inset: 0; overflow: hidden; background: #131a11; }}
    .scrw {{ position: absolute; left: 0; top: {OFF}px; width: {W}px; height: {SCR_H}px; }}
    .scr {{ position: absolute; inset: 0; overflow: hidden; background: #131a11; }}
    .scr > img {{ position: absolute; left: 0; top: 0; width: {W}px; height: auto; }}
    .stage {{ position: absolute; left: 0; top: 0; width: {W}px; height: 1000px; overflow: hidden; }}
    .stage > img {{ position: absolute; left: 0; top: -200px; width: {W}px; height: auto; }}
    .tap {{ position: absolute; width: 0; height: 0; }}
    .tap i {{ position: absolute; left: -60px; top: -60px; width: 120px; height: 120px; border-radius: 50%; }}
    .tap .dot {{ background: rgba(255, 255, 255, 0.55); box-shadow: 0 0 0 3px rgba(0,0,0,.18); }}
    .tap .ring {{ background: rgba(255, 255, 255, 0.35); }}
  </style>
  <div id="root" data-composition-id="{sid}" data-width="{W}" data-height="{H}">
    {body}
  </div>
  <script>
    const tl = gsap.timeline({{ paused: true }});
    {js}
    window.__timelines["{sid}"] = tl;
  </script>
</template>
''')

def screen(sid, src, start, dur, z=1, stage=None, hidden=False):
    """Un écran plein cadre. stage=image ajoute l'aperçu du studio fixé en haut, comme dans l'appli."""
    st = f'<div id="{sid}-stage" class="stage"><img id="{sid}-stg" src="assets/screens/{stage}.png" alt=""></div>' if stage else ''
    return (f'<div id="{sid}" class="clip scrw" data-start="{start:.2f}" data-duration="{dur:.2f}" style="z-index:{z}" data-layout-allow-overflow>'
            f'<div id="{sid}-in" class="scr"{' style="opacity:0"' if hidden else ''}><img id="{sid}-img" src="assets/screens/{src}.png" alt="">{st}</div></div>')

def center(rect, scroll=0, page=False):
    y = rect['y'] if page else rect['vy']
    return rect['x'] + rect['w'] / 2, OFF + y - scroll + rect['h'] / 2

def tap(tid, at, pos, hold=0.12, move_to=None, move_at=None, move_dur=0.6):
    """Toucher visible (comme « Afficher les appuis » d'Android) avec onde Material."""
    x, y = pos
    end = (move_at + move_dur + 0.25) if move_to else (at + hold + 0.5)
    m = f'<div id="{tid}" class="clip tap" data-start="{max(0, at - 0.05):.2f}" data-duration="{end - at + 0.1:.2f}" style="left:{x:.0f}px;top:{y:.0f}px;z-index:30"><i id="{tid}-r" class="ring"></i><i id="{tid}-d" class="dot"></i></div>'
    j = [f'tl.fromTo("#{tid}-d", {{scale: 0.4, opacity: 0}}, {{scale: 1, opacity: 1, duration: 0.08, ease: "power2.out"}}, {at:.2f});',
         f'tl.fromTo("#{tid}-r", {{scale: 0.3, opacity: 0.9}}, {{scale: 2.6, opacity: 0, duration: 0.5, ease: "power2.out"}}, {at:.2f});']
    if move_to:
        dx, dy = move_to[0] - x, move_to[1] - y
        j.append(f'tl.fromTo("#{tid}-d", {{x: 0, y: 0}}, {{x: {dx:.0f}, y: {dy:.0f}, duration: {move_dur:.2f}, ease: "power2.inOut"}}, {move_at:.2f});')
        rel = move_at + move_dur + 0.05
    else:
        rel = at + hold
    j.append(f'tl.to("#{tid}-d", {{scale: 0.6, opacity: 0, duration: 0.14, ease: "power2.in"}}, {rel:.2f});')
    return m, '\n    '.join(j)

def enter_fade_through(sid, at):
    return f'tl.fromTo("#{sid}-in", {{opacity: 0, scale: 0.92}}, {{opacity: 1, scale: 1, duration: 0.3, ease: "power2.out"}}, {at:.2f});'

def enter_shared_x(sid, at):
    return f'tl.fromTo("#{sid}-in", {{x: 300, opacity: 0}}, {{x: 0, opacity: 1, duration: 0.34, ease: "power3.out"}}, {at:.2f});'

def exit_shared_x(sid, at):
    return f'tl.to("#{sid}-in", {{x: -300, opacity: 0, duration: 0.34, ease: "power3.out"}}, {at:.2f});'

def enter_container(sid, at, rect, scroll=0, page=False):
    y = (rect['y'] if page else rect['vy']) - scroll
    top, left = max(0, y), rect['x']
    bottom, right = max(0, SCR_H - (y + rect['h'])), max(0, W - (rect['x'] + rect['w']))
    return (f'tl.fromTo("#{sid}-in", {{clipPath: "inset({top:.0f}px {right:.0f}px {bottom:.0f}px {left:.0f}px round 60px)"}}, '
            f'{{clipPath: "inset(0px 0px 0px 0px round 0px)", duration: 0.5, ease: "power3.inOut"}}, {at:.2f});')

def scroll(sid, at, to, dur=0.7, ease='power3.out', start=None):
    if start is not None:
        return f'tl.fromTo("#{sid}-img", {{y: {-start}}}, {{y: {-to}, duration: {dur:.2f}, ease: "{ease}"}}, {at:.2f});'
    return f'tl.to("#{sid}-img", {{y: {-to}, duration: {dur:.2f}, ease: "{ease}"}}, {at:.2f});'

def card(cid, src, start, dur, x, y, w, h, z=5):
    return f'<img id="{cid}" class="clip" src="assets/screens/{src}.png" alt="" data-start="{start:.2f}" data-duration="{dur:.2f}" style="position:absolute;left:{x}px;top:{y}px;width:{w}px;height:{h}px;z-index:{z};border-radius:6px">'

# 1. Accroche : la carte plein écran dès la première image.
s, e = 0, t(15)
scene('hook', s, e,
      f'<img id="hook-card" class="clip" src="assets/screens/carte-bandeau-story.png" alt="" data-start="0" data-duration="{e:.2f}" style="position:absolute;left:0;top:0;width:{W}px;height:{H}px">',
      f'tl.fromTo("#hook-card", {{scale: 1.1}}, {{scale: 1, duration: {e:.2f}, ease: "power1.out"}}, 0);')

# 2. Écran de démarrage Android 12 : l'icône, puis la carte.
s, e = t(15), t(21); d = e - s
scene('splash', s, e,
      f'''<img id="sp-icon" class="clip" src="assets/icon.png" alt="" data-start="0" data-duration="{d:.2f}" style="position:absolute;left:390px;top:520px;width:300px;height:300px;border-radius:70px">
    <img id="sp-word" class="clip" src="assets/logo-blanc.png" alt="Verso" data-start="0" data-duration="{d:.2f}" style="position:absolute;left:290px;top:300px;width:500px;height:auto">
    <img id="sp-card" class="clip" src="assets/screens/carte-bandeau-square.png" alt="" data-start="0" data-duration="{d:.2f}" style="position:absolute;left:160px;top:520px;width:760px;height:760px;border-radius:32px">''',
      f'''tl.fromTo("#sp-icon", {{scale: 0.3, opacity: 0}}, {{scale: 1, opacity: 1, duration: 0.45, ease: "back.out(1.7)"}}, 0);
    tl.fromTo("#sp-word", {{opacity: 0, y: 30}}, {{opacity: 1, y: 0, duration: 0.35, ease: "power3.out"}}, {t(16) - s:.2f});
    tl.to("#sp-icon", {{scale: 0.2, opacity: 0, duration: 0.3, ease: "power2.in"}}, {t(17) - s:.2f});
    tl.fromTo("#sp-card", {{scale: 0.3, opacity: 0, rotation: -6}}, {{scale: 1, opacity: 1, rotation: 0, duration: 0.5, ease: "back.out(1.5)"}}, {t(17) - s + 0.15:.2f});''')

# 3. Musique en cours → « Paroles » → page des paroles.
s, e = t(21), t(36); d = e - s
ta = t(29) - s + 0.05
m1, j1 = tap('ls-t1', ta, center(R['01-accueil']['paroles']))
scene('listen', s, e,
      screen('ls-home', '01-accueil', 0, ta + 0.6) + screen('ls-lyr', '02-paroles', ta + 0.25, d - ta - 0.25, z=2) + m1,
      f'''{enter_fade_through("ls-home", 0)}
    tl.fromTo("#ls-home-img", {{scale: 1, x: 0, y: 0}}, {{scale: 1.16, x: -50, y: -10, duration: 0.6, ease: "power2.inOut"}}, {t(25) - s:.2f});
    tl.to("#ls-home-img", {{scale: 1, x: 0, y: 0, duration: 0.4, ease: "power2.inOut"}}, {ta - 0.45:.2f});
    {j1}
    {enter_container("ls-lyr", ta + 0.25, R["01-accueil"]["paroles"])}
    {scroll("ls-lyr", ta + 1.1, 380, 1.4, "power2.inOut", start=0)}''')

# 4. Loupe → recherche → page artiste → discographie.
s, e = t(36), t(54); d = e - s
a1 = 0.25
a2 = t(39) - s + 0.1
m1, j1 = tap('ar-t1', a1, center(R['01-accueil']['loupe']))
m2, j2 = tap('ar-t2', a2, center(R['04-recherche']['artiste']))
imp = t(47) - s
m3, j3 = tap('ar-t3', imp, center(R['05-artiste']['importer']))
scene('artist', s, e,
      screen('ar-lyr', '02-paroles', 0, a1 + 0.4) + screen('ar-search', '04-recherche', a1 + 0.1, a2 + 0.4 - a1, z=2, hidden=True) +
      screen('ar-page', '05-artiste-full', a2 + 0.1, d - a2 - 0.1, z=3) + m1 + m2 + m3,
      f'''tl.fromTo("#ar-lyr-img", {{y: -380}}, {{y: -380, duration: 0.01}}, 0);
    {j1}
    {enter_fade_through("ar-search", a1 + 0.1)}
    {j2}
    {exit_shared_x("ar-search", a2 + 0.1)}
    {enter_shared_x("ar-page", a2 + 0.1)}
    {scroll("ar-page", t(41) - s, 900, min(0.8, t(43) - t(41) - 0.05), start=0)}
    {scroll("ar-page", t(43) - s, 1750, min(0.8, t(45) - t(43) - 0.05))}
    {scroll("ar-page", t(45) - s, 2600, min(0.7, imp - 0.75 - (t(45) - s) - 0.05))}
    {scroll("ar-page", imp - 0.75, 0, 0.65, "power3.inOut")}
    {j3}
    {scroll("ar-page", t(51) - s, 1750, 0.9, "power3.inOut")}''')

# 5. Sélection mot par mot (appui long, étirement) → « Créer une carte » → studio.
s, e = t(54), t(68); d = e - s
lp = t(57) - s
st = t(61) - s
mk = t(64) - s + 0.3
mot = center(R['03-selection']['mot']); fin = center(R['03-selection']['fin'])
m1, j1 = tap('se-t1', lp, mot, move_to=fin, move_at=st, move_dur=0.9)
m2, j2 = tap('se-t2', mk, center(R['03-selection']['creer']))
scene('select', s, e,
      screen('se-ref', '02b-refrain', 0, st + 0.5) + screen('se-sel', '03-selection', st + 0.3, mk + 0.5 - st - 0.3, z=2) +
      screen('se-studio', '06-studio', mk + 0.2, d - mk - 0.2, z=3) + m1 + m2,
      f'''{enter_fade_through("se-ref", 0)}
    {j1}
    tl.fromTo("#se-sel-in", {{opacity: 0}}, {{opacity: 1, duration: 0.6, ease: "power1.inOut"}}, {st + 0.3:.2f});
    {j2}
    {enter_container("se-studio", mk + 0.2, R["03-selection"]["creer"])}''')

# 6. Les modèles : toucher chaque modèle, l'aperçu change (aperçu fixé, comme dans l'appli).
s, e = t(68), t(86); d = e - s
SS = 1300                                     # défilement de l'onglet Style
stage, cv = R['07-studio-style']['stage'], R['07-studio-style']['cv']
cvx, cvy = cv['x'], OFF + cv['y'] - stage['y']  # aperçu fixé en haut de l'écran
order = [('bandeau', 'carte-bandeau-square', t(70)), ('vinyle', 'carte-vinyle-square', t(71)), ('editorial', 'carte-editorial-square', t(72)),
         ('typo', 'carte-typo-square', t(73)), ('pochette', 'carte-pochette-square', t(74)), ('minimal', 'carte-minimal-square', t(78)), ('bandeau', 'carte-bandeau-square', t(82))]
m0, j0 = tap('st-t0', 0.15, center(R['06-studio']['style']))
body = screen('st-base', '06-studio', 0, 0.6) + screen('st-style', '07-studio-style-full', 0.35, d - 0.35, z=2, stage='07-studio-style') + m0
js = [j0, enter_fade_through('st-style', 0.35), scroll('st-style', 0.8, SS, 0.7, start=0),
      f'tl.fromTo("#st-style-stage", {{y: -1000}}, {{y: -1000, duration: 0.01}}, 0.35);',
      f'tl.to("#st-style-stage", {{y: 0, duration: 0.35, ease: "power3.out"}}, 1.1);']
for i, (tpl, src, at) in enumerate(order):
    a = at - s
    b = (order[i + 1][2] - s) if i + 1 < len(order) else d
    mm, jj = tap(f'st-t{i + 1}', a - 0.05, center(R['07-studio-style'][tpl], SS, page=True))
    body += mm + card(f'st-c{i}', src, a, b - a, cvx, cvy, cv['w'], cv['h'], z=8)
    js += [jj, f'tl.fromTo("#st-c{i}", {{opacity: 0, scale: 0.94}}, {{opacity: 1, scale: 1, duration: 0.22, ease: "power2.out"}}, {a:.2f});']
scene('styles', s, e, body, '\n    '.join(js))

# 7. Personnalisation : police, couleurs, mots en valeur.
s, e = t(86), t(96); d = e - s
c06 = R['06-studio']
p1, p2, p3 = 2500, 3700, 4750
m1, j1 = tap('cu-t1', t(87) - s + 0.4, center(c06['police'], p1, page=True))
m2, j2 = tap('cu-t2', t(89) - s + 0.4, center(c06['couleur'], p2, page=True))
m3, j3 = tap('cu-t3', t(92) - s + 0.4, center(c06['hl'], p3, page=True))
scene('custom', s, e,
      screen('cu-studio', '06-studio-full', 0, d, stage='06-studio') + m1 + m2 + m3,
      f'''{enter_fade_through("cu-studio", 0)}
    {scroll("cu-studio", 0.2, p1, min(0.7, t(89) - s - 0.35 - 0.25), "power3.out", start=1300)}
    {j1}
    {scroll("cu-studio", t(89) - s - 0.35, p2, 0.7)}
    {j2}
    {scroll("cu-studio", t(92) - s - 0.35, p3, 0.7)}
    {j3}''')

# 8. Formats (Carré, Portrait, Story) → Partager → feuille de partage.
s, e = t(96), t(107); d = e - s
F = R['08-studio-format']; fcv = F['cv']; fst = F['stage']
FS = 1450
fy = OFF + fcv['y'] - fst['y']
boxes = {'square': (fcv['x'], fy, fcv['w'], fcv['h']),
         'portrait': (fcv['x'] + (fcv['w'] - fcv['h'] * 0.8) / 2, fy, fcv['h'] * 0.8, fcv['h']),
         'story': (fcv['x'] + (fcv['w'] - fcv['h'] * 0.5625) / 2, fy, fcv['h'] * 0.5625, fcv['h'])}
seq = [('square', t(96)), ('portrait', t(97)), ('story', t(98))]
m0, j0 = tap('fo-t0', 0.1, center(R['06-studio']['format']))
body = screen('fo-base', '07-studio-style', 0, 0.55) + screen('fo-fmt', '08-studio-format-full', 0.3, d - 0.3, z=2, stage='08-studio-format') + m0
js = [j0, enter_fade_through('fo-fmt', 0.3), scroll('fo-fmt', 0.3, FS, 0.01, start=FS)]
for i, (k, at) in enumerate(seq):
    a = max(0.35, at - s)
    b = (seq[i + 1][1] - s) if i + 1 < len(seq) else d
    x, y, w, h = boxes[k]
    mm, jj = tap(f'fo-t{i + 1}', a, center(F[k], FS, page=True))
    body += mm + card(f'fo-c{i}', 'carte-bandeau-' + k, a, b - a, round(x), round(y), round(w), round(h), z=8)
    js += [jj, f'tl.fromTo("#fo-c{i}", {{scaleY: 0.86, opacity: 0.4}}, {{scaleY: 1, opacity: 1, duration: 0.28, ease: "back.out(1.6)"}}, {a:.2f});']
sh = t(99) - s
SHS = F['share']['y'] - 900
js += [scroll('fo-fmt', sh - 0.2, SHS, 0.6, 'power3.inOut')]
mm, jj = tap('fo-t9', sh + 0.5, center(F['share'], SHS, page=True))
CHIP = 'style="display:inline-block;padding:18px 30px;border-radius:999px;background:#cce988;color:#161f14;font-size:32px;font-weight:700"'
body += mm + f'''<div id="fo-sheet" class="clip" data-start="{sh + 0.75:.2f}" data-duration="{d - sh - 0.75:.2f}" style="position:absolute;left:0;right:0;bottom:48px;height:620px;z-index:20">
      <div id="fo-sheet-in" style="position:absolute;inset:0;background:#202a1c;border-radius:56px 56px 0 0;padding:40px 60px;font-family:Inter,sans-serif;color:#eef3e4">
        <div style="width:90px;height:8px;border-radius:4px;background:#5d6b55;margin:0 auto 34px"></div>
        <div style="font-size:40px;font-weight:700;margin-bottom:30px">Partager la carte</div>
        <div style="display:flex;gap:26px;align-items:center"><img src="assets/screens/carte-bandeau-square.png" alt="" style="width:150px;height:150px;border-radius:20px"><div style="font-size:30px;line-height:1.35">Nina Lumen - Nuits d'Abidjan.png<br><span style="color:#9fae94">Image PNG</span></div></div>
        <div style="display:flex;gap:24px;margin-top:44px"><span id="fo-wa" {CHIP}>WhatsApp</span><span id="fo-ig" {CHIP}>Instagram</span><span id="fo-more" {CHIP}>Plus…</span></div>
      </div></div>'''
js += [jj, f'tl.fromTo("#fo-sheet-in", {{y: 640}}, {{y: 0, duration: 0.4, ease: "power3.out"}}, {sh + 0.75:.2f});',
       f'tl.fromTo("#fo-wa", {{scale: 0.6, opacity: 0}}, {{scale: 1, opacity: 1, duration: 0.25, ease: "back.out(2)"}}, {t(104) - s:.2f});',
       f'tl.fromTo("#fo-ig", {{scale: 0.6, opacity: 0}}, {{scale: 1, opacity: 1, duration: 0.25, ease: "back.out(2)"}}, {t(106) - s:.2f});',
       f'tl.fromTo("#fo-more", {{opacity: 0}}, {{opacity: 1, duration: 0.25}}, {t(106) - s + 0.15:.2f});']
scene('formats', s, e, body, '\n    '.join(js))

# 9. Profil, puis mode avion (barre d'état) : tout reste disponible.
s, e = t(107), t(122); d = e - s
m1, j1 = tap('pr-t1', 0.1, center(R['01-accueil']['profil']))
off = t(119) - s
scene('profile', s, e,
      screen('pr-base', '08b-partager', 0, 0.55) + screen('pr-prof', '09-profil', 0.3, d - 0.3, z=2) + m1 +
      f'<div id="pr-snack" class="clip" data-start="{off:.2f}" data-duration="{d - off:.2f}" style="position:absolute;left:60px;right:60px;top:1440px;z-index:20"><div id="pr-snack-in" style="background:#eef3e4;color:#161f14;border-radius:18px;padding:30px 36px;font-family:Inter,sans-serif;font-size:36px;font-weight:600;box-shadow:0 12px 40px rgba(0,0,0,.4)">✈ Mode avion activé · Verso fonctionne toujours</div></div>',
      f'''{j1}
    {enter_fade_through("pr-prof", 0.3)}
    tl.fromTo("#pr-snack-in", {{y: 160, opacity: 0}}, {{y: 0, opacity: 1, duration: 0.35, ease: "power3.out"}}, {off:.2f});''')

# 10. Actualités et tendances.
s, e = t(122), t(132); d = e - s
m1, j1 = tap('nw-t1', 0.1, center(R['09-profil']['accueil']))
NW = R['01-accueil-full']['news']['y'] - 260
TR = R['01-accueil-full']['trends']['y'] - 200
scene('news', s, e,
      screen('nw-base', '09-profil', 0, 0.55) + screen('nw-home', '01-accueil-full', 0.3, d - 0.3, z=2) + m1,
      f'''{j1}
    {enter_fade_through("nw-home", 0.3)}
    {scroll("nw-home", t(124) - s, NW, 0.9, "power3.out", start=0)}
    {scroll("nw-home", t(128) - s, TR, 0.9, "power3.out")}''')

# 11. Fin : le logo et le slogan.
s, e = t(132), END; d = e - s
scene('endcard', s, e,
      f'''<div id="ec-bg" class="clip" data-start="0" data-duration="{d:.2f}" style="position:absolute;inset:0;background:#f5f7ef"></div>
    <div id="ec-mark" class="clip" data-start="0" data-duration="{d:.2f}" style="position:absolute;left:190px;top:600px;width:700px;height:234px;overflow:hidden" data-layout-allow-overflow><img id="ec-logo" src="assets/logo.png" alt="Verso" style="width:700px;height:auto"></div>
    <div id="ec-tag" class="clip" data-start="0.6" data-duration="{d - 0.6:.2f}" style="position:absolute;left:90px;right:90px;top:900px;text-align:center;color:#161f14;font-family:Inter,sans-serif;font-size:58px;font-weight:900;letter-spacing:-0.02em;line-height:1.15"><span>Tes paroles préférées,<br>en cartes.</span></div>''',
      f'''tl.fromTo("#ec-logo", {{clipPath: "inset(0 72% 0 0)", scale: 0.5, y: 40}}, {{clipPath: "inset(0 72% 0 0)", scale: 1, y: 0, duration: 0.4, ease: "back.out(1.6)"}}, 0);
    tl.to("#ec-logo", {{clipPath: "inset(0 0% 0 0)", duration: 0.45, ease: "power3.inOut"}}, 0.42);
    tl.fromTo("#ec-tag span", {{y: 30, opacity: 0}}, {{y: 0, opacity: 1, duration: 0.4, ease: "power3.out"}}, 0.7);''')

captions_file()

# --- Barre d'état et barre de geste Android (au-dessus de tout) ------------
airplane = t(119)
chrome = f'''<div id="sysbar" class="clip" data-start="0" data-duration="{END}" data-track-index="4" style="position:absolute;left:0;top:0;width:{W}px;height:{OFF}px;z-index:60">
        <div id="sysbar-in" style="position:absolute;inset:0;font-family:Inter,sans-serif;font-size:30px;font-weight:700;color:#eef3e4">
          <span style="position:absolute;left:52px;top:22px">20:41</span>
          <span style="position:absolute;left:525px;top:24px;width:30px;height:30px;border-radius:50%;background:#050505"></span>
          <svg id="sb-net" viewBox="0 0 48 24" style="position:absolute;right:120px;top:29px;height:26px;width:52px;fill:#eef3e4"><path d="M2 22h4v-5H2zm7 0h4V12H9zm7 0h4V7h-4zm7 0h4V2h-4zM32 20l4-5a7 7 0 0 0-8 0zM28 10l2 2.6a10.5 10.5 0 0 1 12 0l2-2.6a14 14 0 0 0-16 0z"/></svg>
          <svg id="sb-air" viewBox="0 0 24 24" style="position:absolute;right:130px;top:27px;height:30px;width:30px;fill:#eef3e4"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/></svg>
          <svg viewBox="0 0 30 24" style="position:absolute;right:52px;top:29px;height:26px;width:33px;fill:#eef3e4"><rect x="1" y="5" width="24" height="14" rx="3" fill="none" stroke="#eef3e4" stroke-width="2"/><rect x="4" y="8" width="16" height="8" rx="1.5"/><rect x="26" y="9" width="3" height="6" rx="1"/></svg>
        </div>
      </div>
      <div id="gesture" class="clip" data-start="0" data-duration="{END}" data-track-index="4" style="position:absolute;left:0;top:{H - 48}px;width:{W}px;height:48px;z-index:60">
        <div id="gesture-in" style="position:absolute;left:400px;top:20px;width:280px;height:9px;border-radius:5px;background:#eef3e4"></div>
      </div>'''
chrome_js = f'''tl.fromTo("#sb-air", {{opacity: 0}}, {{opacity: 0, duration: 0.01}}, 0);
      tl.fromTo("#sb-net", {{opacity: 1}}, {{opacity: 0, duration: 0.15}}, {airplane:.2f});
      tl.to("#sb-air", {{opacity: 1, duration: 0.15}}, {airplane:.2f});
      tl.fromTo("#sysbar-in", {{color: "#eef3e4"}}, {{color: "#161f14", duration: 0.2}}, {t(132):.2f});
      tl.fromTo("#gesture-in", {{opacity: 0.85}}, {{opacity: 0.5, duration: 0.2}}, {t(132):.2f});'''

(ROOT / 'compositions/chrome.html').write_text(f'''<template>
  <style>
    #root {{ position: absolute; inset: 0; pointer-events: none; }}
  </style>
  <div id="root" data-composition-id="chrome" data-width="{W}" data-height="{H}">
      {chrome}
  </div>
  <script>
    const tl = gsap.timeline({{ paused: true }});
      {chrome_js}
    window.__timelines["chrome"] = tl;
  </script>
</template>
''')

hosts = '\n'.join(f'      <div id="{sid}" data-composition-id="{sid}" data-composition-src="compositions/{sid}.html" data-start="{a:.2f}" data-duration="{b - a:.2f}" data-track-index="1" data-track-kind="graphics" data-width="{W}" data-height="{H}"></div>' for sid, a, b in SCENES)
(ROOT / 'index.html').write_text(f'''<!doctype html>
<html lang="fr" data-resolution="portrait">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width={W}, height={H}" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      html, body {{ width: {W}px; height: {H}px; overflow: hidden; background: #131a11; }}
      #root {{ position: relative; width: 100%; height: 100%; font-family: Inter, sans-serif; }}
      #bg {{ position: absolute; inset: 0; background: #131a11; }}
      #captions {{ z-index: 50; }}
      #chrome {{ z-index: 60; }}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="{END}" data-width="{W}" data-height="{H}">
      <div id="bg" class="clip" data-start="0" data-duration="{END}" data-track-index="0"></div>
{hosts}
      <audio id="voix" class="clip" src="assets/voix.mp3" data-start="0" data-duration="53.00" data-track-index="2" data-volume="1"></audio>
      <div id="captions" data-composition-id="captions" data-composition-src="compositions/captions.html" data-start="0" data-duration="{END}" data-track-index="3" data-track-kind="captions" data-width="{W}" data-height="{H}"></div>
      <div id="chrome" data-composition-id="chrome" data-composition-src="compositions/chrome.html" data-start="0" data-duration="{END}" data-track-index="4" data-track-kind="graphics" data-width="{W}" data-height="{H}"></div>
    </div>
    <script>
      window.__timelines["main"] = gsap.timeline({{ paused: true }});
    </script>
  </body>
</html>
''')
keep = {sid for sid, _, _ in SCENES} | {'captions', 'chrome'}
for f in (ROOT / 'compositions').glob('*.html'):
    if f.stem not in keep:
        f.unlink()
print(len(SCENES), 'scènes,', len(groups), 'groupes de sous-titres')
