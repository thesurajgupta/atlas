# Presentation decks

`ATLAS-Team-Kickoff.pptx` is **generated**, not hand-edited. Edit `build_deck.js` and rebuild:

```bash
npm install     # once
npm run build   # writes ATLAS-Team-Kickoff.pptx
```

Why generated rather than edited in PowerPoint: the deck changes every time the plan does, and
regenerating keeps it consistent — same palette, same spacing, same card layout — instead of drifting
each time someone nudges a text box.

## Design rules

- **Navy dominates; amber is reserved for risk and alerts.** It is semantic, not decoration — this is a
  warning system, so amber means something. Don't spend it on ordinary highlights.
- Cambria headers, Calibri body. Both ship with Office and render predictably.
- The repeated motif is the **circular badge** — initials, step numbers, rule numbers.
- No accent stripes, no colour bars under titles. They read as filler.
- Every slide has a visual. No slide is a wall of bullets.

## Before shipping a change

Titles wrap silently — a two-line title in a one-line box just gets clipped, and it is easy to miss.
Check geometry after any text change:

```bash
python3 -c "
from pptx import Presentation
E=914400.0; d=Presentation('ATLAS-Team-Kickoff.pptx')
for i,s in enumerate(d.slides,1):
    for sh in s.shapes:
        if sh.left is None or not sh.has_text_frame: continue
        t=sh.text_frame.text.strip()
        if not t: continue
        w,h=sh.width/E,sh.height/E
        pts=[r.font.size.pt for p in sh.text_frame.paragraphs for r in p.runs if r.font.size]
        pt=max(pts) if pts else 18
        per=max(1,int(w/(pt*0.5/72))); lines=sum(max(1,-(-len(l)//per)) for l in t.split(chr(10)))
        if lines*pt*1.35/72 > h*1.12: print(f'slide {i}: may overflow -> {t[:50]!r}')
"
```

Needs `python-pptx`. Then open the file and look at it — the checker is an estimate, not a substitute
for eyes.
