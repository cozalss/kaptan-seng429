"""The holdout result as a plain-Turkish HTML page, in the panel's ink-on-paper look, for people who did not build it.

    docker compose exec -T postgres psql -U kaptan_owner -d kaptan -At \
      -c "SELECT row_to_json(r) FROM core.holdout_runs r WHERE kind = 'main'" > holdout_row.json
    uv run python scripts/holdout_page.py holdout_row.json sinav-sonucu.html

The input is one `core.holdout_runs` row as JSON (its `report` is what `kaptan.evalreports.holdout` stored).
Nothing is computed here except formatting: every number on the page is a number of the stored report.
`--sample` puts a "these numbers are invented" band on the page, for previews.
Colours, fonts and marks follow kaptan-panel/src/app/globals.css; the sheet lies on a desk photo (holdout_desk.jpg).
"""

from __future__ import annotations

import argparse
import base64
import html
import json
import math
import sys
from pathlib import Path
from typing import Any

TYPE_NAMES = {
    "E1": ("Pay geri alımı", "Şirket kendi hissesini borsadan geri aldı."),
    "E2": ("Yönetici alımı", "Yöneticisi ya da ana ortağı kendi parasıyla hisse aldı."),
    "E3": ("Yeni iş, ihale", "Şirket önemli bir sözleşme ya da ihale kazandı."),
    "E4": ("Bilanço", "Şirket dönem sonuçlarını açıkladı."),
}

#: A photo of a desk, generated once with no text on it; the sheet lies on its leather pad.
DESK = Path(__file__).with_name("holdout_desk.jpg")

FONTS = (
    '<link rel="preconnect" href="https://fonts.googleapis.com">'
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:opsz,wght@6..96,500;6..96,600'
    '&family=Inter:wght@400;500;600;700&display=swap">'
)

CSS = """
:root{--paper:#f3eee3;--panel:#fffdf8;--sunk:#e9e2d3;--ink:#121318;--ink-soft:#23242a;--muted:#45433e;
--gold:#8f6b1e;--gold-line:#b8954a;--gold-soft:#d9bf7a;
--brand:#0c2f63;--wash:#2a4c8c;--north:#b3261e;--gain:#0a5530;--loss:#8c1038;--ochre:#d9961a;
--ochre-tint:rgb(217 150 26/.22);--line:rgb(12 47 99/.16);--sea:#12224f;--flag:#c62a20;--up:#2a4c8c;--down:#8c1038;
--hairline:rgb(18 19 24/.3);--wood:#3a2618;--desk-dim:0}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--desk-dim:.35}}
:root[data-theme="dark"]{--desk-dim:.35}
:root{--grunge:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='60'%3E%3Cfilter \
id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.55' numOctaves='3' seed='4'/%3E%3CfeColorMatrix \
values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -1.5 1.4'/%3E%3C/filter%3E%3Crect width='160' height='60' \
filter='url(%23g)'/%3E%3C/svg%3E")}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--wood);color:var(--ink);font:16px/1.6 Inter,system-ui,sans-serif;
font-feature-settings:"tnum" 1;overflow-x:hidden}
.desk{position:fixed;inset:0;z-index:-2;background:var(--wood) var(--desk-img,none) center/cover no-repeat}
.desk::after{content:"";position:absolute;inset:0;background:rgb(0 0 0/var(--desk-dim))}
.sheet{position:relative;isolation:isolate;max-width:1040px;margin:7vh auto 9vh;padding:56px 60px 40px;
transform:rotate(-.35deg)}
.sheet::before{content:"";position:absolute;inset:0;z-index:-1;background-color:#f6f1e6;
background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' \
width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' \
stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .2 0 0 0 0 .15 0 0 0 0 .08 0 0 0 .5 -.2'/%3E%3C/filter%3E\
%3Crect width='220' height='220' filter='url(%23n)' opacity='.22'/%3E%3C/svg%3E"),
radial-gradient(120% 90% at 50% 40%,transparent 60%,rgb(120 90 50/.13));
filter:url(#deckle) drop-shadow(0 2px 2px rgb(0 0 0/.35)) drop-shadow(0 22px 34px rgb(0 0 0/.45))}
.paper-svg{position:absolute;width:0;height:0}
.display{font-family:"Bodoni Moda",Didot,Georgia,serif;font-optical-sizing:auto;letter-spacing:-.01em}
.mast{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-bottom:14px;
border-bottom:2px solid var(--ink)}
.mark{display:flex;align-items:center;gap:10px;color:var(--ink);font-size:1.7rem;font-weight:600}
.mark svg{width:34px;height:34px}
.mast .doc{font-size:.85rem;color:var(--muted);text-align:right}
.mast .doc b{display:block;color:var(--ink);font-size:.95rem}
.notes{display:flex;flex-wrap:wrap;gap:10px;margin:16px 0 0}
.warn{flex:1 1 260px;display:flex;gap:10px;align-items:flex-start;margin:0;padding:8px 12px;font-size:.88rem;
color:var(--ink-soft);border:1px solid rgb(18 19 24/.4);background:rgb(255 253 248/.55)}
.warn svg{flex:0 0 20px;height:18px;margin-top:2px}
.warn.sample{background:var(--ochre-tint)}
.hero{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);gap:36px;align-items:center;margin-top:28px;
padding-bottom:28px;border-bottom:1px solid var(--hairline)}
.hero .main{text-align:center;position:relative;padding-top:64px}
.hero h1{color:var(--brand);font-size:clamp(2.4rem,6vw,4rem)}
.hero .lede{margin:0 auto;max-width:46ch;font-size:1.05rem}
.hero .kicker{justify-content:center}
.summary{border:1.5px solid var(--gold-line);padding:20px 22px;position:relative;background:rgb(255 253 248/.5)}
.rosette{position:absolute;top:-22px;right:4%;width:104px;height:124px}
.summary h2{font-size:clamp(1.6rem,3vw,2.1rem);margin:0 0 10px;font-weight:600}
.summary p{margin:0;color:var(--ink-soft);font-size:.98rem}
.summary .after{margin-top:12px;padding-top:12px;border-top:1px solid var(--gold-soft);font-size:.9rem}
.summary .row{display:flex;gap:6px;margin:4px 0 14px}
.summary .row span{flex:1;height:8px;border:1.5px solid var(--gold-line)}
.summary .row span.on{background:var(--gold-line)}
.kicker{font-size:.95rem;color:var(--muted);margin:0 0 10px;display:flex;gap:14px;flex-wrap:wrap}
.kicker span+span::before{content:"○";margin-right:8px;font-size:.7em;vertical-align:.15em}
h1{font-size:clamp(2.3rem,5.6vw,3.6rem);line-height:1.04;margin:0 0 18px;font-weight:600}
.lede{font-size:1.25rem;line-height:1.5;color:var(--ink-soft);margin:0;max-width:34ch}
h3{font:600 1.05rem Inter,sans-serif;margin:56px 0 2px}
.info{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:48px 56px;margin-top:64px}
.blk{border-top:2px solid var(--ink);padding-top:14px}
.blk header{display:flex;align-items:baseline;gap:12px;margin-bottom:6px}
.blk .no{font-family:"Bodoni Moda",Georgia,serif;font-size:1.5rem;line-height:1;color:var(--brand);min-width:2ch}
.blk h3{margin:0;font:600 1.05rem Inter,sans-serif}
.items{list-style:none;padding:0;margin:0}
.items li{padding:12px 0 12px calc(2ch + 22px);border-bottom:1px solid var(--hairline);color:var(--ink-soft);
font-size:.95rem;line-height:1.5}
.items li:last-child{border-bottom:0}
.items b{display:block;color:var(--ink);font-weight:600;margin-bottom:2px}
@media (max-width:760px){.info{grid-template-columns:1fr;gap:40px}.items li{padding-left:0}}
.h3s{margin:0 0 16px;color:var(--muted);font-size:.95rem}
.types{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,196px),1fr));gap:18px}
.type{--r:0deg;background:var(--panel);border:1px solid rgb(18 19 24/.35);padding:18px 16px 16px;
display:flex;flex-direction:column;transform:rotate(var(--r));
box-shadow:0 1px 1px rgb(60 40 20/.25),0 10px 18px -8px rgb(60 40 20/.45)}
.type:nth-child(1){--r:-.9deg}.type:nth-child(2){--r:.6deg}.type:nth-child(3){--r:-.4deg}
.type:nth-child(4){--r:.9deg}
.type::before{content:"";position:absolute;top:-11px;left:calc(50% - 38px);width:76px;height:22px;
background:rgb(236 224 196/.78);border-left:1px dashed rgb(150 120 70/.35);
border-right:1px dashed rgb(150 120 70/.35);transform:rotate(-3deg);box-shadow:0 1px 2px rgb(60 40 20/.18)}
.type .code{font-size:.78rem;color:var(--muted);letter-spacing:.06em}
.type h4{font-size:1.55rem;line-height:1.1;margin:2px 0 4px;font-weight:600}
.type .what{font-size:.88rem;color:var(--muted);margin:0 0 10px;min-height:2.8em}
.water{width:100%;height:92px;display:block;margin:4px 0 2px}
.fig{font-size:1.9rem;font-weight:700;line-height:1.1}
.fig.up{color:var(--gain)}.fig.down{color:var(--loss)}.fig.none{color:var(--muted)}
.figs{font-size:.85rem;color:var(--muted);margin:2px 0 12px}
.checks{list-style:none;padding:12px 0 0;margin:auto 0 0;border-top:1px solid var(--hairline);font-size:.88rem}
.checks li{display:flex;gap:8px;align-items:baseline;margin:3px 0}
.checks b{flex:0 0 1.1em;text-align:center}
.checks .y b{color:var(--gain)}.checks .n b{color:var(--north)}
.type{position:relative;margin-top:26px}
.type .boat{position:absolute;top:-30px;right:14px;width:40px;height:34px}
.stamp{align-self:center;margin:16px 0 2px;padding:3px 16px 1px;font:800 1.55rem/1.15 Inter,sans-serif;
letter-spacing:.1em;border:3.5px solid currentColor;border-radius:7px;transform:rotate(-7deg);
mix-blend-mode:multiply;-webkit-mask:var(--grunge) 0 0/160px 60px;mask:var(--grunge) 0 0/160px 60px}
.stamp.y{color:var(--gain)}.stamp.n{color:var(--loss)}
.type{transition:transform .25s cubic-bezier(.2,.8,.2,1),box-shadow .25s cubic-bezier(.2,.8,.2,1)}
@media (hover:hover){.type:hover{transform:translateY(-4px) rotate(0deg);
box-shadow:0 2px 2px rgb(60 40 20/.2),0 18px 26px -10px rgb(60 40 20/.5)}}
.wave{animation:drift 3.2s linear infinite}
@keyframes drift{to{transform:translateX(40px)}}
.boat{transform-origin:50% 90%;animation:bob 3.6s ease-in-out infinite}
.type:nth-child(2) .boat{animation-delay:-.9s}.type:nth-child(3) .boat{animation-delay:-1.8s}
.type:nth-child(4) .boat{animation-delay:-2.7s}
@keyframes bob{0%,100%{transform:translateY(0) rotate(-3deg)}50%{transform:translateY(-3px) rotate(3deg)}}
.bar{transform-box:fill-box}.bar.up{transform-origin:50% 100%}.bar.down{transform-origin:50% 0}
.js .type{opacity:0;transform:translateY(28px) rotate(var(--r))}
.js .type .bar{transform:scaleY(0)}
.js .type .checks li{opacity:0;transform:translateX(-8px)}
.js .type .stamp{opacity:0;transform:scale(1.9) rotate(-14deg)}
.js .type.in{opacity:1;transform:rotate(var(--r));transition:opacity .5s ease-out var(--d),
transform .6s cubic-bezier(.2,.8,.2,1) var(--d),box-shadow .25s}
.js .type.in .bar{transform:scaleY(1);transition:transform .9s cubic-bezier(.3,1.4,.5,1) calc(var(--d) + .35s)}
.js .type.in .checks li{opacity:1;transform:none;transition:opacity .3s,transform .3s cubic-bezier(.2,.8,.2,1)}
.js .type.in .checks li:nth-child(1){transition-delay:calc(var(--d) + 1s)}
.js .type.in .checks li:nth-child(2){transition-delay:calc(var(--d) + 1.15s)}
.js .type.in .checks li:nth-child(3){transition-delay:calc(var(--d) + 1.3s)}
.js .type.in .stamp{opacity:1;transform:rotate(-7deg);transition:opacity .12s calc(var(--d) + 1.55s),
transform .32s cubic-bezier(.3,1.5,.55,1) calc(var(--d) + 1.55s)}
@media (hover:hover){.js .type.in:hover{transform:translateY(-4px) rotate(0deg);
transition:transform .25s,box-shadow .25s}}
.js .rosette{animation:pin .6s cubic-bezier(.3,1.5,.55,1) .4s both}
@keyframes pin{from{opacity:0;transform:translateY(-14px) rotate(-8deg)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.wave,.boat{animation:none}
.js .type,.js .type .bar,.js .type .checks li{opacity:1;transform:none;transition:none}
.js .type{transform:rotate(var(--r))}.js .type .stamp{opacity:1;transform:rotate(-7deg);transition:none}
.js .rosette{animation:none}}
.meta{margin-top:56px;padding-top:14px;border-top:2px solid var(--ink);font-size:.82rem;color:var(--muted);
display:flex;flex-wrap:wrap;gap:6px 22px}
.meta .pg{margin-left:auto;font-family:"Bodoni Moda",Georgia,serif;font-size:.95rem}
code{font-size:.9em;background:var(--sunk);padding:1px 5px}
@media (max-width:760px){.hero{grid-template-columns:1fr;gap:40px}.mast .doc{display:none}
.sheet{margin:16px 8px 32px;padding:32px 18px 28px;transform:none}
.rosette{width:80px;height:96px;top:-10px;right:0}.hero .main{padding-top:84px}
.type{--r:0deg!important}}
"""

COMPASS = (
    '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12.6" fill="none" stroke="currentColor" '
    'stroke-width="2.4"/><path d="M16 5.6v2.6M16 23.8v2.6M5.6 16h2.6M23.8 16h2.6" stroke="currentColor" '
    'stroke-width="1.6"/><path d="M16 8.6 18.2 16 16 23.4 13.8 16Z" fill="currentColor"/></svg>'
)
WARN = (
    '<svg viewBox="0 0 20 18" aria-hidden="true"><path d="M10 1 19 17H1Z" fill="var(--ink)"/>'
    '<path d="M10 7v5" stroke="var(--paper)" stroke-width="2"/><circle cx="10" cy="14.4" r="1.1" '
    'fill="var(--paper)"/></svg>'
)


#: Cards rise in one after another when scrolled to; the figure counts up while the bar grows. Without JS, or with
#: reduced motion, every card is simply there with its final numbers.
MOTION_JS = """<script>
(function(){
  var cards = document.querySelectorAll('.type');
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.documentElement.classList.add('js');
  cards.forEach(function(c, i){ c.style.setProperty('--d', (i * 0.12) + 's'); });
  function fmt(v){
    return '%' + (v < 0 ? '\\u2212' : '+') + Math.abs(v).toFixed(2).replace('.', ',');
  }
  function count(el, delay){
    var v = parseFloat(el.dataset.v);
    if (isNaN(v)) return;
    el.textContent = fmt(0);
    setTimeout(function(){
      var t0 = performance.now(), dur = 1100;
      (function step(now){
        var p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
        el.textContent = fmt(v * e);
        if (p < 1) requestAnimationFrame(step);
      })(t0);
    }, delay);
  }
  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(en){
      if (!en.isIntersecting) return;
      var c = en.target, i = Array.prototype.indexOf.call(cards, c);
      c.classList.add('in');
      count(c.querySelector('.fig'), 350 + i * 120);
      io.unobserve(c);
    });
  }, {threshold: 0.25});
  cards.forEach(function(c){ io.observe(c); });
})();
</script>"""


#: Torn paper: the sheet's background layer (not its text) is displaced by noise along its edges.
DECKLE = (
    '<svg class="paper-svg" aria-hidden="true"><filter id="deckle" x="-2%" y="-2%" width="104%" height="104%">'
    '<feTurbulence type="fractalNoise" baseFrequency=".045" numOctaves="4" seed="7" result="n"/>'
    '<feDisplacementMap in="SourceGraphic" in2="n" scale="9" xChannelSelector="R" yChannelSelector="G"/>'
    "</filter></svg>"
)


def _leaves(side: int) -> str:
    """One branch of the laurel: seven leaves along an arc, mirrored by `side` (-1 left, 1 right)."""
    out = []
    for i in range(7):
        a = 200 - i * 24 if side < 0 else -20 + i * 24
        r = math.radians(a)
        x, y = 52 + 40 * math.cos(r), 52 + 40 * math.sin(r)
        rot = a + (90 if side < 0 else -90)
        out.append(
            f'<ellipse cx="{x:.1f}" cy="{y:.1f}" rx="4.2" ry="9" transform="rotate({rot:.0f} {x:.1f} {y:.1f})" '
            'fill="var(--gold-line)" stroke="var(--gold)" stroke-width=".8"/>'
        )
    return "".join(out)


ROSETTE = (
    '<svg class="rosette" viewBox="0 0 104 124" aria-hidden="true">'
    '<path d="M36 82 26 122l14-8 8 10 6-36Z" fill="var(--sea)"/><path d="M68 82l10 40-14-8-8 10-6-36Z" '
    'fill="var(--sea)"/>'
    f"{_leaves(-1)}{_leaves(1)}"
    '<circle cx="52" cy="52" r="31" fill="var(--sea)" stroke="var(--gold-line)" stroke-width="3"/>'
    '<circle cx="52" cy="52" r="25" fill="none" stroke="var(--gold-soft)" stroke-width="1" stroke-dasharray="2 3"/>'
    '<g transform="translate(36 36)" color="#f4f6fb">'
    '<circle cx="16" cy="16" r="12.6" fill="none" stroke="currentColor" stroke-width="2.2"/>'
    '<path d="M16 5.6v2.6M16 23.8v2.6M5.6 16h2.6M23.8 16h2.6" stroke="currentColor" stroke-width="1.6"/>'
    '<path d="M16 8.6 18.2 16 16 23.4 13.8 16Z" fill="currentColor"/><path d="M16 8.6 18.2 16H13.8Z" '
    'fill="var(--flag)"/></g></svg>'
)


def pct(x: float | None, digits: int = 2) -> str:
    if x is None:
        return "—"
    return "%" + f"{x * 100:+.{digits}f}".replace(".", ",").replace("-", "−")


def num(x: float | None, digits: int = 2) -> str:
    return "—" if x is None else f"{x:.{digits}f}".replace(".", ",").replace("-", "−")


def day(iso: str | None) -> str:
    if not iso:
        return "—"
    y, m, d = iso[:10].split("-")
    months: list[str] = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran"]
    months += ["Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"]
    return f"{int(d)} {months[int(m) - 1]} {y}"


def esc(s: Any) -> str:
    return html.escape(str(s))


def waterline(mean: float | None, scale: float, uid: str) -> str:
    """A bar on a waterline: above it (hatched indigo) what was earned, below it (hatched claret) what was lost."""
    w, h, mid = 240, 92, 46
    head = (
        f'<svg class="water" viewBox="0 0 {w} {h}" preserveAspectRatio="none" aria-hidden="true"><defs>'
        f'<pattern id="u{uid}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'
        '<rect width="6" height="6" fill="var(--panel)"/><path d="M0 0v6" stroke="var(--up)" stroke-width="2.4"/>'
        f'</pattern><pattern id="d{uid}" width="6" height="6" patternUnits="userSpaceOnUse" '
        'patternTransform="rotate(-45)"><rect width="6" height="6" fill="var(--panel)"/>'
        '<path d="M0 0v6" stroke="var(--down)" stroke-width="2.4"/></pattern></defs>'
    )
    bar = ""
    if mean is not None and scale > 0:
        hgt = max(3.0, abs(mean) / scale * (mid - 6))
        y = mid - hgt if mean >= 0 else mid
        fill = f"u{uid}" if mean >= 0 else f"d{uid}"
        bar = (
            f'<rect class="bar {"up" if mean >= 0 else "down"}" x="70" y="{y:.1f}" width="100" height="{hgt:.1f}" '
            f'fill="url(#{fill})" stroke="var(--ink)" stroke-width="2"/>'
        )
    # 40 units per wave period; drawn from -40 so a 40-unit loop of the drift never shows an end.
    wave = (
        f'<path class="wave" d="M-40 {mid}' + " q10 -4 20 0 t20 0" + " t20 0" * 14 + '" '
        'fill="none" stroke="var(--ink)" stroke-width="1.6"/>'
    )
    return head + wave + bar + "</svg>"


def type_card(code: str, t: dict[str, Any], crit: dict[str, Any], scale: float) -> str:
    name, what = TYPE_NAMES.get(code, (code, ""))
    b, s = t["base"], t["sensitivity"]
    mean, tval, n = b["mean_car_net"], b["t_bmp_kp"], t["n"]
    cls = "none" if mean is None else ("up" if mean > 0 else "down")
    checks = [
        (mean is not None and mean > crit["mean_net_above"], "Ortalamada kazandırdı"),
        (tval is not None and tval >= crit["t_min"], f"Şans değil (t = {num(tval)})"),
        (n >= crit["n_min"], f"Yeterli olay ({n})"),
    ]
    items = "".join(
        f'<li class="{"y" if ok else "n"}"><b>{"✓" if ok else "✗"}</b>{esc(txt)}</li>' for ok, txt in checks
    )
    hit = b["hit_rate_net"]
    stamp = '<div class="stamp y">GEÇTİ</div>' if b["passed"] else '<div class="stamp n">GEÇMEDİ</div>'
    flag = "var(--flag)" if b["passed"] else "var(--muted)"
    boat = (
        '<svg class="boat" viewBox="0 0 40 34" aria-hidden="true" fill="none" stroke="var(--ink)" stroke-width="1.6">'
        f'<path d="M20 2v24"/><path d="M21 3h11l-4 4 4 4H21Z" fill="{flag}" stroke="none"/>'
        '<path d="M19 9 9 24h10Z" fill="var(--panel)"/><path d="M4 26h32l-5 6H9Z" fill="var(--panel)"/></svg>'
    )
    return (
        f'<article class="type">{boat}<span class="code">{esc(code)} · {esc(t["horizon"])} İŞLEM GÜNÜ</span>'
        f'<h4 class="display">{esc(name)}</h4><p class="what">{esc(what)}</p>'
        f"{waterline(mean, scale, code)}"
        f'<div class="fig {cls}" data-v="{"" if mean is None else f"{mean * 100:.4f}"}">{pct(mean)}</div>'
        f'<div class="figs">olay başına, masraf sonrası · '
        f"kazandıran olay {'—' if hit is None else f'%{round(hit * 100)}'}</div>"
        f'<ul class="checks">{items}</ul>'
        f'<div class="figs" style="margin:8px 0 0">Masraf 4 katı olsa: {pct(s["mean_car_net"])}</div>'
        f"{stamp}</article>"
    )


def render(row: dict[str, Any], sample: bool, desk: str | None = None) -> str:
    desk_style = f' style="--desk-img:url({desk})"' if desk else ""
    r = row["report"]
    types: dict[str, dict[str, Any]] = r["types"]
    passed: list[str] = r["passed_types"]
    crit = r["criteria"]
    lo, hi = r["window"]
    names = [TYPE_NAMES.get(c, (c,))[0] for c in passed]

    if passed:
        headline = f"{esc(' ve '.join(names))} tuttu."
        lede = (
            "KAPtan'ın kuralları, hiç görmediği iki yılda masraflar düşüldükten sonra da piyasanın önüne geçti. "
            "Sıradaki adım gerçek para değil: sahte parayla üç aylık deneme."
        )
        after = "Geçen türler sahte parayla denemeye girer. Gerçek para en erken Nisan–Haziran 2027."
    else:
        headline = "Kurallar tutmadı."
        lede = (
            "Hiç görmediği iki yılda, dört duyuru türünün hiçbiri masraflar düşüldükten sonra güvenilir bir kazanç "
            "göstermedi. Plan gereği gerçek paraya geçilmez. Bu da dürüst bir sonuç."
        )
        after = "Gerçek paraya geçilmez. KAPtan duyuru okuma asistanı olarak devam eder."

    scale = max((abs(t["base"]["mean_car_net"] or 0) for t in types.values()), default=0) or 1.0
    cards = "".join(type_card(c, t, crit, scale) for c, t in types.items())
    cells = "".join(f'<span class="{"on" if c in passed else ""}"></span>' for c in types)

    notes = []
    if sample:
        notes.append(
            f'<p class="warn sample">{WARN}<span><b>Örnek sayfa.</b> Buradaki sayılar uydurmadır, sınavın sonucu '
            "değildir.</span></p>"
        )
    if not row.get("prereg_ref"):
        notes.append(
            f'<p class="warn">{WARN}<span>Kurallar sınavdan önce mühürlenmedi. Plan, kuralların sınavdan önce '
            "donmasını istiyordu; bu yapılmadı.</span></p>"
        )
    open_unknown = sum(t.get("open_unknown", 0) for t in types.values())
    floor_only = sum(t.get("costs_floor_only", 0) for t in types.values())
    if open_unknown or floor_only:
        bits = []
        if open_unknown:
            bits.append(f"{open_unknown} olayda ertesi günün açılış fiyatı yoktu, kapanışla hesaplandı")
        if floor_only:
            bits.append(f"{floor_only} olayda masraf tam bilinmiyordu, en düşüğüyle hesaplandı")
        notes.append(f'<p class="warn">{WARN}<span>{esc("; ".join(bits))}.</span></p>')

    if passed:
        nexts = [
            ("Sahte parayla deneme", "Geçen türler en az 3 ay ve 50 kapanmış işlem boyunca sahte parayla denenir."),
            ("Gölge", "Ardından en az 4 hafta emir fişi çıkar, ama para girmez."),
            ("Geçmeyenler", "Geçmeyen türler kişisel kullanımda hiç işlenmez."),
        ]
    else:
        nexts = [
            ("Gerçek para yok", "Plan gereği gerçek paraya geçilmez."),
            ("KAPtan sürer", "Duyuruları okuyup özetlemeye devam eder; öneri çıkarmaz."),
            ("Birikim", "Kişisel birikim için plan endeks fonuna döner."),
        ]
    nexts.append(("Tekrarı yok", "Sınav aynı dönemle yeniden yapılamaz; sonuç kalıcıdır."))
    blocks_data = [
        (
            "Soru neydi?",
            [
                ("Kenara ayrılan dönem", f"{day(lo)} – {day(hi)}. Kurallar yazılırken bu döneme hiç bakılmadı."),
                (
                    "Sorulan",
                    "Bu duyurulardan sonra alsaydık, piyasanın genel hareketinin ve aracı kurum masrafının ötesinde "
                    "para kazanır mıydık?",
                ),
                ("Neden bir kez", "Kötü sonuç çıkınca kuralları değiştirip yeniden denemek kendini kandırmak olurdu."),
            ],
        ),
        (
            "Geçmek için üçü birden",
            [
                ("Ortalamada kazandırmalı", "Masraf düşüldükten sonra olay başına ortalama sıfırın üstünde."),
                ("Şans olmamalı", f"t en az {num(crit['t_min'], 1)}: kazanç tesadüfle açıklanamayacak kadar tutarlı."),
                ("Yeterince olay olmalı", f"En az {crit['n_min']} olay; birkaç şanslı örnek yetmez."),
            ],
        ),
        ("Sırada ne var?", nexts),
        (
            "Sınırlar",
            [
                (
                    "Yapay zekâ kullanılmadı",
                    "Geçmiş olaylar KAP başlıklarından ve tablolardan seçildi; bu yüzden bazı ince kurallar "
                    "(ör. ihalenin şirkete göre büyüklüğü) sınavda uygulanmadı.",
                ),
                ("Gelecek garanti değil", "Geçmişte tutan bir kural gelecekte de tutacak demek değildir."),
            ],
        ),
    ]
    blocks = "\n".join(
        f'<article class="blk"><header><span class="no">{i:02d}</span><h3>{esc(title)}</h3></header>'
        f'<ul class="items">{"".join(f"<li><b>{esc(h)}</b>{esc(t)}</li>" for h, t in rows)}</ul></article>'
        for i, (title, rows) in enumerate(blocks_data, 1)
    )

    return f"""<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>KAPtan Sınav Sonucu</title>{FONTS}<style>{CSS}</style></head>
<body>{DECKLE}<div class="desk"{desk_style}></div><main class="sheet">
<header class="mast"><div class="mark">{COMPASS}<span class="display">KAPtan</span></div>
<div class="doc"><b>Sınav sonucu</b>{day(lo)} – {day(hi)}</div></header>
<div class="notes">{"".join(notes)}</div>

<section class="hero">
<div class="main">{ROSETTE if passed else ""}
<p class="kicker"><span>{day(row.get("finished_at"))}</span><span>Bir kez yapıldı</span></p>
<h1 class="display">{headline}</h1>
<p class="lede">{lede}</p>
</div>
<aside class="summary">
<h2 class="display">Sonuç: {len(passed)} / {len(types)}</h2>
<div class="row">{cells}</div>
<p>Dört duyuru türünden {len(passed)} tanesi sınavın üç şartını birden sağladı.</p>
<p class="after">{esc(after)}</p>
</aside>
</section>

<h3>Dört tür, tek tek</h3>
<p class="h3s">Duyurudan sonra hisseyi alsaydın, BIST-100'ün götüreceği yerin ne kadar üstüne ya da altına çıkardın.
Su çizgisinin üstü kazanç, altı kayıp.</p>
<div class="types">{cards}</div>

<section class="info">
{blocks}
</section>

<footer class="meta"><span>Karar veren: {esc(row.get("actor") or "—")}</span>
<span>Kod: {esc((row.get("git_sha") or "—")[:10])}</span>
<span>Kural özeti: {esc((row.get("rules_hash") or "—")[:12])}</span>
<span>Ön kayıt: {esc(row.get("prereg_ref") or "yok")}</span><span class="pg">Sayfa 1 / 1</span></footer>
</main>{MOTION_JS}</body></html>
"""


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=(__doc__ or "").splitlines()[0])
    p.add_argument("row", type=Path, help="one core.holdout_runs row as JSON")
    p.add_argument("out", type=Path, help="HTML file to write")
    p.add_argument("--sample", action="store_true", help="mark the page as an invented preview")
    p.add_argument("--desk", type=Path, default=DESK, help="desk photo under the sheet (embedded); 'none': wood")
    args = p.parse_args(argv)
    text = args.row.read_text(encoding="utf-8").strip()
    if not text:
        print("the holdout has not run: the input is empty", file=sys.stderr)
        return 1
    desk = None
    if str(args.desk) != "none" and args.desk.is_file():
        desk = "data:image/jpeg;base64," + base64.b64encode(args.desk.read_bytes()).decode()
    args.out.write_text(render(json.loads(text), args.sample, desk), encoding="utf-8")
    print(f"written: {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
