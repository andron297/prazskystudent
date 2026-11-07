# Stihnuto – logo a prvky pro prezentace

## Co je v balíčku

| Soubor | K čemu |
|---|---|
| `logo-znacka.svg` / `.png` | samotná značka (ikona), čtverec 512 px |
| `ikona-1024.png`, `ikona-512.png`, `ikona-192.png` | ikona aplikace v různých velikostech |
| `logo-vodorovne.svg` / `.png` | značka + název vedle sebe, na světlé pozadí |
| `logo-vodorovne-svetle.svg` / `.png` | totéž na tmavé pozadí |
| `logo-nad-sebou.svg` / `.png`, `logo-nad-sebou-svetle.*` | značka nad názvem (titulní snímky) |
| `nazev.svg` / `.png`, `nazev-svetly.*` | jen název „Stihnuto“ |
| `paleta.svg` / `.png` | barvy aplikace (světlý a tmavý režim) |
| `barvy.css`, `barvy.json` | barvy jako proměnné pro web a nástroje |
| `obrazovky/` | snímky aplikace (počítač i mobil) ve vysokém rozlišení |

SVG soubory mají písmo převedené na křivky – fungují v PowerPointu, Keynote, Google Prezentacích
i Canvě bez instalace písma. Pro tisk a velké plochy používejte SVG, pro rychlé vložení PNG.

## Písma

- **Instrument Serif** – nadpisy a název (kurzíva pro zvýraznění, např. „Dobré *odpoledne*“).
- **Manrope** – texty, popisky a tlačítka.

Obě písma jsou zdarma pod licencí SIL Open Font License: [Instrument Serif](https://fonts.google.com/specimen/Instrument+Serif),
[Manrope](https://fonts.google.com/specimen/Manrope).

## Barvy

| Název | Světlý režim | Tmavý režim |
|---|---|---|
| podklad (canvas) | `#eeeae0` | `#0b110d` |
| plocha (surface) | `#faf8f3` | `#121b15` |
| text (fg) | `#17241c` | `#ece7db` |
| hlavní barva (accent) | `#2b5a40` | `#a8c79f` |
| les (forest) | `#1d3a2a` | `#16291e` |
| mech (moss) | `#7a8a52` | `#9aab70` |
| písek (sand) | `#c7a676` | `#d4b98e` |
| hlína (clay) | `#a36f45` | `#c48c5f` |

Logo: přechod `#3f7a55 → #1b3626`, ciferník `#f1ece0`, oblouk `#d4b98e`, lístek `#a8c79f`.
Zvýraznění textu na fotce: `#e7d6b5`.

## Jak logo používat

- Kolem loga nechte volné místo aspoň polovinu výšky značky.
- Nejmenší velikost: značka 24 px, vodorovné logo 120 px na šířku.
- Logo nedeformujte, neotáčejte a neměňte mu barvy. Na tmavé pozadí patří varianta `-svetle`.
- Na fotku dávejte logo tam, kde je fotka klidná, případně na ztmavený pruh.

## Fotografie

Fotky Prahy v aplikaci jsou z Wikimedia Commons pod licencí CC BY-SA – když je použijete
v prezentaci, uveďte autora a licenci (seznam je v `public/images/CREDITS.md` v repozitáři).
