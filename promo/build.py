# Génère la composition HyperFrames de la pub Verso (1080×1920, 30 i/s) à partir de la
# transcription mot à mot de la voix off. Relancer après avoir changé la voix : python3 build.py
import json, html, pathlib

ROOT = pathlib.Path(__file__).parent
W, H = 1080, 1920
words = json.load(open(ROOT / 'assets/transcript.json'))
FIX = {6: 'et', 32: 'les', 68: 'Sept', 69: 'styles :', 70: 'Bandeau,', 71: 'Vinyle,', 72: 'Éditorial,', 73: 'Typographique…',
       98: 'Story.', 99: 'Un', 100: 'toucher,', 126: 'musicale', 127: 'et', 137: 'cartes.', 96: 'Carré,', 97: 'Portrait,', 5: 'vibrer…'}
for i, t in FIX.items():
    words[i]['text'] = t
END = 53.1

# --- Sous-titres : groupes de 2 à 5 mots, coupés sur la ponctuation --------
groups, cur = [], []
for i, w in enumerate(words[:132]):  # la carte de fin porte déjà le slogan : pas de sous-titres dessus
    cur.append(w)
    if w['text'][-1] in '.,?!:…' or len(cur) >= 5:
        groups.append(cur); cur = []
if cur: groups.append(cur)

def cap_html():
    out = []
    for g, ws in enumerate(groups):
        s = ws[0]['start']
        e = groups[g + 1][0]['start'] if g + 1 < len(groups) else words[132]['start']
        e = min(e, ws[-1]['end'] + 0.6)
        spans = ''.join(f'<span id="cw{g}-{k}" class="w">{html.escape(w["text"])}</span> ' for k, w in enumerate(ws))
        out.append(f'<div id="cg{g}" class="clip cap" data-start="{s:.2f}" data-duration="{max(0.3, e - s):.2f}" data-track-index="3"><p>{spans.strip()}</p></div>')
    return '\n'.join(out)

def cap_js():
    js = []
    for g, ws in enumerate(groups):
        s0 = ws[0]['start']
        js.append(f'tl.fromTo("#cg{g} p", {{y: 26, opacity: 0}}, {{y: 0, opacity: 1, duration: 0.16, ease: "power3.out"}}, {s0:.2f});')
        for k, w in enumerate(ws):
            js.append(f'tl.fromTo("#cw{g}-{k}", {{color: "#ffffff"}}, {{color: "#cce988", duration: 0.05}}, {w["start"]:.2f});')
            js.append(f'tl.to("#cw{g}-{k}", {{color: "#ffffff", duration: 0.12}}, {max(w["end"], w["start"] + 0.15):.2f});')
    return '\n      '.join(js)

def t(i):  # début du mot i
    return words[i]['start']

# --- Scènes -----------------------------------------------------------------
SCENES = []
def scene(sid, start, end, body, script, style=''):
    SCENES.append((sid, start, end))
    (ROOT / f'compositions/{sid}.html').write_text(f'''<template>
  <style>
    @font-face {{ font-family: "Space Grotesk"; font-weight: 700; src: url("assets/fonts/SpaceGrotesk-700-normal-latin.woff2") format("woff2"); }}
    @font-face {{ font-family: "Space Grotesk"; font-weight: 700; src: url("assets/fonts/SpaceGrotesk-700-normal-latin-ext.woff2") format("woff2"); unicode-range: U+0100-024F; }}
    #root {{ position: absolute; inset: 0; overflow: hidden; background: #131a11; font-family: "Space Grotesk", Inter, sans-serif; }}
    .phone {{ position: absolute; left: 190px; top: 250px; width: 700px; height: 900px; border-radius: 74px; padding: 14px; background: linear-gradient(145deg, #2c2f2b, #0b0c0b 45%, #1d1f1c); box-shadow: 0 0 0 2px #3a3d38 inset, 0 40px 120px rgba(0,0,0,.6); }}
    .phone .screen {{ position: relative; width: 672px; height: 872px; border-radius: 60px; overflow: hidden; background: #131a11; }}
    .phone .screen > img {{ position: absolute; left: 0; top: 54px; width: 672px; height: auto; transform-origin: 0 0; }}
    .phone .sb {{ position: absolute; left: 0; right: 0; top: 0; height: 54px; background: #131a11; display: flex; align-items: center; justify-content: space-between; padding: 0 34px 0 40px; color: #eef3e4; font-family: Inter, sans-serif; font-size: 22px; font-weight: 700; }}
    .phone .sb svg {{ height: 20px; width: auto; fill: #eef3e4; margin-left: 8px; }}
    .phone .cam {{ position: absolute; left: 50%; top: 14px; width: 26px; height: 26px; margin-left: -13px; border-radius: 50%; background: #050505; box-shadow: 0 0 0 3px #1a1a1a; }}
    .phone .gest {{ position: absolute; left: 50%; bottom: 10px; width: 180px; height: 7px; margin-left: -90px; border-radius: 4px; background: rgba(238,243,228,.85); }}
    .phone .btn-side {{ position: absolute; right: -5px; top: 190px; width: 6px; height: 120px; border-radius: 3px; background: #2a2c29; }}
    .claim {{ position: absolute; left: 90px; right: 90px; top: 172px; text-align: center; color: #cce988; font-size: 46px; font-weight: 700; letter-spacing: -0.02em; }}
    .card {{ position: absolute; border-radius: 28px; box-shadow: 0 40px 120px rgba(0,0,0,.6); }}
    {style}
  </style>
  <div id="root" data-composition-id="{sid}" data-width="{W}" data-height="{H}">
    {body}
  </div>
  <script>
    const tl = gsap.timeline({{ paused: true }});
    {script}
    window.__timelines["{sid}"] = tl;
  </script>
</template>
''')

SB = ('<div class="sb"><span>20:41</span><span>'
      '<svg viewBox="0 0 24 24"><path d="M2 22h3v-4H2zm5 0h3v-8H7zm5 0h3V9h-3zm5 0h3V3h-3z"/></svg>'
      '<svg viewBox="0 0 24 24"><path d="M12 20l3.5-4.4a5.6 5.6 0 0 0-7 0zM4.2 10.3l1.9 2.4a9.5 9.5 0 0 1 11.8 0l1.9-2.4a12.6 12.6 0 0 0-15.6 0zM.4 5.5l1.9 2.4a15.6 15.6 0 0 1 19.4 0l1.9-2.4a18.6 18.6 0 0 0-23.2 0z"/></svg>'
      '<svg viewBox="0 0 30 24"><rect x="1" y="5" width="24" height="14" rx="3" fill="none" stroke="#eef3e4" stroke-width="2"/><rect x="4" y="8" width="16" height="8" rx="1.5"/><rect x="26" y="9" width="3" height="6" rx="1"/></svg>'
      '</span></div><div class="cam"></div><div class="gest"></div>')

def phone(pid, src, start, dur, extra=''):
    return (f'<div id="{pid}" class="clip phone" data-start="{start:.2f}" data-duration="{dur:.2f}" data-layout-allow-overflow>'
            f'<div class="btn-side"></div><div class="screen"><img id="{pid}-img" src="assets/screens/{src}.png" alt="" {extra}>{SB}</div></div>')

def claim(cid, text, start, dur):
    return f'<div id="{cid}" class="clip claim" data-start="{start:.2f}" data-duration="{dur:.2f}"><span>{text}</span></div>'

def claim_in(cid, at):
    return f'tl.fromTo("#{cid} span", {{y: -20, opacity: 0}}, {{y: 0, opacity: 1, duration: 0.3, ease: "power3.out"}}, {at:.2f});'

S = lambda x: 700 / 1080  # échelle capture → téléphone

# 1. Accroche : la carte, plein cadre, dès la première image.
s, e = 0, t(15)
scene('hook', s, e,
      f'''<img id="hook-card" class="clip" src="assets/screens/carte-bandeau-story.png" alt="" data-start="0" data-duration="{e - s:.2f}" style="position:absolute;left:0;top:0;width:1080px;height:1920px">''',
      f'''tl.fromTo("#hook-card", {{scale: 1.12}}, {{scale: 1, duration: {e - s:.2f}, ease: "power1.out"}}, 0);''')

# 2. « Avec Verso, elle devient une carte. » : la carte se pose, le logo arrive.
s, e = t(15), t(21)
d = e - s
scene('reveal', s, e,
      f'''<img id="rv-card" class="clip card" src="assets/screens/carte-bandeau-square.png" alt="" data-start="0" data-duration="{d:.2f}" style="left:140px;top:420px;width:800px;height:800px">
    <img id="rv-logo" class="clip" src="assets/logo-blanc.png" alt="Verso" data-start="0" data-duration="{d:.2f}" style="position:absolute;left:290px;top:210px;width:500px;height:auto">''',
      f'''tl.fromTo("#rv-card", {{scale: 1.35, y: 240, rotation: -4}}, {{scale: 1, y: 0, rotation: 0, duration: 0.55, ease: "back.out(1.4)"}}, 0);
    tl.fromTo("#rv-logo", {{opacity: 0, y: 30}}, {{opacity: 1, y: 0, duration: 0.35, ease: "power3.out"}}, {t(16) - s:.2f});
    tl.to("#rv-card", {{rotation: 2, duration: 0.5, ease: "power2.out"}}, {t(18) - s:.2f});''')

# 3. Musique en cours → paroles.
s, e = t(21), t(36)
d = e - s; k = 700 / 1080
cut = t(29) - s
scene('listen', s, e,
      claim('ls-claim', 'Reconnaît ce que tu écoutes', 0, cut) +
      phone('ls-home', '01-accueil', 0, cut) +
      claim('ls-claim2', 'Les paroles en un geste', cut, d - cut) +
      phone('ls-lyr', '02-paroles', cut, d - cut),
      f'''{claim_in("ls-claim", 0.05)}
    tl.fromTo("#ls-home", {{y: 80, opacity: 0}}, {{y: 0, opacity: 1, duration: 0.45, ease: "power3.out"}}, 0);
    tl.fromTo("#ls-home-img", {{scale: 1, x: 0, y: 0}}, {{scale: 1.75, x: -40, y: -10, duration: 0.55, ease: "power2.inOut"}}, {t(25) - s:.2f});
    {claim_in("ls-claim2", cut + 0.05)}
    tl.fromTo("#ls-lyr", {{x: 760}}, {{x: 0, duration: 0.45, ease: "power3.out"}}, {cut:.2f});
    tl.fromTo("#ls-lyr-img", {{y: 0}}, {{y: -260, duration: {d - cut - 0.5:.2f}, ease: "power1.inOut"}}, {cut + 0.5:.2f});''')

# 4. Recherche d'artiste → page artiste → discographie.
s, e = t(36), t(54)
d = e - s
c1 = t(40) - s
scene('artist', s, e,
      claim('ar-claim', 'Cherche un artiste', 0, c1) +
      phone('ar-search', '04-recherche', 0, c1) +
      claim('ar-claim2', 'Bio, albums, singles', c1, t(46) - s - c1) +
      claim('ar-claim3', 'Importe sa discographie', t(46) - s, e - t(46)) +
      phone('ar-page', '05-artiste-full', c1, d - c1),
      f'''{claim_in("ar-claim", 0.05)}
    tl.fromTo("#ar-search", {{y: 80, opacity: 0}}, {{y: 0, opacity: 1, duration: 0.4, ease: "power3.out"}}, 0);
    tl.fromTo("#ar-search-img", {{scale: 1}}, {{scale: 1.5, duration: 0.6, ease: "power2.inOut"}}, 0.6);
    {claim_in("ar-claim2", c1 + 0.05)}
    tl.fromTo("#ar-page", {{scale: 0.9, opacity: 0}}, {{scale: 1, opacity: 1, duration: 0.4, ease: "power3.out"}}, {c1:.2f});
    tl.fromTo("#ar-page-img", {{y: 0}}, {{y: -300, duration: {min(0.6, t(43) - t(41) - 0.05):.2f}, ease: "power2.inOut"}}, {t(41) - s:.2f});
    tl.to("#ar-page-img", {{y: -980, duration: {min(0.8, t(44) - t(43) - 0.05):.2f}, ease: "power2.inOut"}}, {t(43) - s:.2f});
    tl.to("#ar-page-img", {{y: -1700, duration: {min(0.8, t(46) - t(44) - 0.05):.2f}, ease: "power2.inOut"}}, {t(44) - s:.2f});
    {claim_in("ar-claim3", t(46) - s + 0.05)}
    tl.to("#ar-page-img", {{y: 0, scale: 1.35, x: -60, duration: 0.7, ease: "power3.inOut"}}, {t(46) - s:.2f});''')

# 5. Sélection mot par mot → créer la carte.
s, e = t(54), t(68)
d = e - s
c2 = t(67) - s
scene('select', s, e,
      claim('se-claim', 'La magie : mot par mot', 0, d) +
      phone('se-sel', '03-selection', 0, c2) +
      phone('se-studio', '06-studio', c2, d - c2),
      f'''{claim_in("se-claim", 0.05)}
    tl.fromTo("#se-sel", {{y: 80, opacity: 0}}, {{y: 0, opacity: 1, duration: 0.4, ease: "power3.out"}}, 0);
    tl.fromTo("#se-sel-img", {{scale: 1, x: 0, y: 0}}, {{scale: 1.55, x: -20, y: -330, duration: 0.6, ease: "power2.inOut"}}, {t(57) - s:.2f});
    tl.to("#se-sel-img", {{scale: 1.35, x: -10, y: -620, duration: 0.6, ease: "power2.inOut"}}, {t(64) - s:.2f});
    tl.fromTo("#se-studio", {{scale: 0.85, opacity: 0}}, {{scale: 1, opacity: 1, duration: 0.4, ease: "back.out(1.3)"}}, {c2:.2f});''')

# 6. Les modèles, chacun sur son mot.
s, e = t(68), t(86)
d = e - s
seq = [('carte-bandeau-square', t(70)), ('carte-vinyle-square', t(71)), ('carte-editorial-square', t(72)), ('carte-typo-square', t(73)),
       ('carte-pochette-square', t(74)), ('carte-minimal-square', t(78)), ('carte-bandeau-square', t(82))]
body = claim('st-claim', '7 styles', 0, t(74) - s) + claim('st-claim2', 'Pochette, photo d\'artiste ou la tienne', t(74) - s, e - t(74))
js = [claim_in('st-claim', 0.05), claim_in('st-claim2', t(74) - s + 0.05)]
for i, (src, at) in enumerate(seq):
    st = (at - s) if i else 0
    en = (seq[i + 1][1] - s) if i + 1 < len(seq) else d
    body += f'<img id="st-c{i}" class="clip card" src="assets/screens/{src}.png" alt="" data-start="{st:.2f}" data-duration="{en - st:.2f}" style="left:115px;top:330px;width:850px;height:850px">'
    js.append(f'tl.fromTo("#st-c{i}", {{scale: 0.86, rotation: {(-3, 3)[i % 2]}}}, {{scale: 1, rotation: 0, duration: 0.28, ease: "back.out(1.6)"}}, {st:.2f});')
scene('styles', s, e, body, '\n    '.join(js))

# 7. Personnalisation.
s, e = t(86), t(96)
d = e - s
scene('custom', s, e,
      claim('cu-claim', 'Police, couleurs, mots en valeur', 0, d) + phone('cu-studio', '06-studio', 0, d),
      f'''{claim_in("cu-claim", 0.05)}
    tl.fromTo("#cu-studio", {{y: 80, opacity: 0}}, {{y: 0, opacity: 1, duration: 0.4, ease: "power3.out"}}, 0);
    tl.fromTo("#cu-studio-img", {{y: 0, scale: 1}}, {{y: -560, scale: 1, duration: 0.7, ease: "power2.inOut"}}, {t(87) - s:.2f});
    tl.to("#cu-studio-img", {{y: -120, scale: 1.25, x: -40, duration: 0.7, ease: "power2.inOut"}}, {t(91) - s:.2f});''')

# 8. Formats → partage.
s, e = t(96), t(107)
d = e - s
f1, f2, f3, sh = 0, t(97) - s, t(98) - s, t(99) - s
scene('formats', s, e,
      claim('fo-claim', 'Carré, portrait, story', 0, sh) +
      f'<img id="fo-sq" class="clip card" src="assets/screens/carte-bandeau-square.png" alt="" data-start="0" data-duration="{f2:.2f}" style="left:190px;top:370px;width:700px;height:700px">' +
      f'<img id="fo-po" class="clip card" src="assets/screens/carte-bandeau-portrait.png" alt="" data-start="{f2:.2f}" data-duration="{f3 - f2:.2f}" style="left:220px;top:300px;width:640px;height:800px">' +
      f'<img id="fo-st" class="clip card" src="assets/screens/carte-bandeau-story.png" alt="" data-start="{f3:.2f}" data-duration="{d - f3:.2f}" style="left:315px;top:290px;width:450px;height:800px">' +
      claim('fo-claim2', 'Partage en un toucher', sh, d - sh) +
      f'<div id="fo-chips" class="clip" data-start="{t(103) - s:.2f}" data-duration="{e - t(103):.2f}" style="position:absolute;left:0;right:0;top:1130px;display:flex;justify-content:center;gap:22px"><span id="fo-wa" class="chip">WhatsApp</span><span id="fo-ig" class="chip">Instagram</span></div>',
      f'''{claim_in("fo-claim", 0.05)}
    tl.fromTo("#fo-sq", {{scale: 0.9}}, {{scale: 1, duration: 0.25, ease: "back.out(1.5)"}}, 0);
    tl.fromTo("#fo-po", {{scaleY: 0.875}}, {{scaleY: 1, duration: 0.25, ease: "back.out(1.5)"}}, {f2:.2f});
    tl.fromTo("#fo-st", {{scaleY: 0.85}}, {{scaleY: 1, duration: 0.25, ease: "back.out(1.5)"}}, {f3:.2f});
    {claim_in("fo-claim2", sh + 0.05)}
    tl.fromTo("#fo-st", {{y: 0}}, {{y: -40, duration: 0.4, ease: "power2.out"}}, {sh:.2f});
    tl.fromTo("#fo-wa", {{scale: 0, opacity: 0}}, {{scale: 1, opacity: 1, duration: 0.3, ease: "back.out(2)"}}, {t(104) - s:.2f});
    tl.fromTo("#fo-ig", {{scale: 0, opacity: 0}}, {{scale: 1, opacity: 1, duration: 0.3, ease: "back.out(2)"}}, {t(106) - s:.2f});''',
      style='.chip { display: inline-block; padding: 18px 36px; border-radius: 999px; background: #cce988; color: #161f14; font-size: 40px; font-weight: 700; }')

# 9. Profil, hors connexion.
s, e = t(107), t(122)
d = e - s
off = t(119) - s
scene('profile', s, e,
      claim('pr-claim', 'Ta bibliothèque, ton profil', 0, off) + phone('pr-prof', '09-profil', 0, d) +
      claim('pr-claim2', 'Même sans connexion', off, d - off) +
      f'<div id="pr-off" class="clip" data-start="{off:.2f}" data-duration="{d - off:.2f}" style="position:absolute;left:0;right:0;top:1050px;text-align:center"><span id="pr-badge" class="chip">✈ Mode avion</span></div>',
      f'''{claim_in("pr-claim", 0.05)}
    tl.fromTo("#pr-prof", {{y: 80, opacity: 0}}, {{y: 0, opacity: 1, duration: 0.4, ease: "power3.out"}}, 0);
    tl.fromTo("#pr-prof-img", {{y: 0}}, {{y: -470, duration: 0.8, ease: "power2.inOut"}}, {t(109) - s:.2f});
    tl.to("#pr-prof-img", {{y: 0, duration: 0.7, ease: "power2.inOut"}}, {t(112) - s:.2f});
    {claim_in("pr-claim2", off + 0.05)}
    tl.fromTo("#pr-badge", {{scale: 0, opacity: 0}}, {{scale: 1, opacity: 1, duration: 0.35, ease: "back.out(2)"}}, {off:.2f});''',
      style='.chip { display: inline-block; padding: 16px 34px; border-radius: 999px; background: #212b1d; border: 2px solid #cce988; color: #eef3e4; font-size: 38px; font-weight: 700; }')

# 10. Actualités et tendances.
s, e = t(122), t(132)
d = e - s
scene('news', s, e,
      claim('nw-claim', "L'actu et les tendances, chaque jour", 0, d) + phone('nw-home', '01-accueil-full', 0, d),
      f'''{claim_in("nw-claim", 0.05)}
    tl.fromTo("#nw-home", {{y: 80, opacity: 0}}, {{y: 0, opacity: 1, duration: 0.4, ease: "power3.out"}}, 0);
    tl.fromTo("#nw-home-img", {{y: -560}}, {{y: -560, duration: 0.1}}, 0);
    tl.to("#nw-home-img", {{y: -1150, duration: 1.4, ease: "power2.inOut"}}, {t(128) - s:.2f});''')

# 11. Carte de fin.
s, e = t(132), END
d = e - s
scene('endcard', s, e,
      f'''<div id="ec-bg" class="clip" data-start="0" data-duration="{d:.2f}" style="position:absolute;inset:0;background:#f5f7ef"></div>
    <div id="ec-mark" class="clip" data-start="0" data-duration="{d:.2f}" style="position:absolute;left:190px;top:560px;width:700px;height:234px;overflow:hidden" data-layout-allow-overflow><img id="ec-logo" src="assets/logo.png" alt="Verso" style="width:700px;height:auto"></div>
    <div id="ec-tag" class="clip" data-start="0.6" data-duration="{d - 0.6:.2f}" style="position:absolute;left:90px;right:90px;top:860px;text-align:center;color:#161f14;font-size:56px;font-weight:700;letter-spacing:-0.02em;line-height:1.15"><span>Tes paroles préférées,<br>en cartes.</span></div>''',
      f'''tl.fromTo("#ec-logo", {{clipPath: "inset(0 72% 0 0)", scale: 0.6, y: 40}}, {{clipPath: "inset(0 72% 0 0)", scale: 1, y: 0, duration: 0.4, ease: "back.out(1.6)"}}, 0);
    tl.to("#ec-logo", {{clipPath: "inset(0 0% 0 0)", duration: 0.45, ease: "power3.inOut"}}, 0.42);
    tl.fromTo("#ec-tag span", {{y: 30, opacity: 0}}, {{y: 0, opacity: 1, duration: 0.4, ease: "power3.out"}}, 0.7);''')

# --- Composition racine -----------------------------------------------------
hosts = '\n'.join(f'      <div id="{sid}" data-composition-id="{sid}" data-composition-src="compositions/{sid}.html" data-start="{a:.2f}" data-duration="{b - a:.2f}" data-track-index="1" data-track-kind="graphics" data-width="{W}" data-height="{H}"></div>' for sid, a, b in SCENES)
(ROOT / 'index.html').write_text(f'''<!doctype html>
<html lang="fr" data-resolution="portrait">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width={W}, height={H}" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      @font-face {{ font-family: "Space Grotesk"; font-weight: 700; src: url("assets/fonts/SpaceGrotesk-700-normal-latin.woff2") format("woff2"); }}
      @font-face {{ font-family: "Space Grotesk"; font-weight: 700; src: url("assets/fonts/SpaceGrotesk-700-normal-latin-ext.woff2") format("woff2"); unicode-range: U+0100-024F; }}
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      html, body {{ width: {W}px; height: {H}px; overflow: hidden; background: #131a11; }}
      #root {{ position: relative; width: 100%; height: 100%; font-family: "Space Grotesk", Inter, sans-serif; }}
      #bg {{ position: absolute; inset: 0; background: #131a11; }}
      #captions {{ z-index: 50; }}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="{END}" data-width="{W}" data-height="{H}">
      <div id="bg" class="clip" data-start="0" data-duration="{END}" data-track-index="0"></div>
{hosts}
      <audio id="voix" class="clip" src="assets/voix.mp3" data-start="0" data-duration="53.00" data-track-index="2" data-volume="1"></audio>
      <div id="captions" data-composition-id="captions" data-composition-src="compositions/captions.html" data-start="0" data-duration="{END}" data-track-index="3" data-track-kind="captions" data-width="{W}" data-height="{H}"></div>
    </div>
    <script>
      window.__timelines["main"] = gsap.timeline({{ paused: true }});
    </script>
  </body>
</html>
''')
(ROOT / 'compositions/captions.html').write_text(f'''<template>
  <style>
    #root {{ position: absolute; inset: 0; pointer-events: none; }}
    .cap {{ position: absolute; left: 90px; right: 90px; top: 1190px; text-align: center; }}
    .cap p {{ display: inline-block; font-family: Inter, sans-serif; font-weight: 900; font-size: 58px; line-height: 1.12; color: #fff; letter-spacing: -0.01em; text-shadow: 0 4px 18px rgba(0,0,0,.75), 0 0 2px rgba(0,0,0,.9); }}
  </style>
  <div id="root" data-composition-id="captions" data-width="{W}" data-height="{H}">
{cap_html()}
  </div>
  <script>
    const tl = gsap.timeline({{ paused: true }});
    {cap_js()}
    window.__timelines["captions"] = tl;
  </script>
</template>
''')
print(len(SCENES), 'scènes,', len(groups), 'groupes de sous-titres')
