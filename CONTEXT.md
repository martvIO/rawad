# دعوة (Dawa)

Glossary for Dawa, the wedding-invitation platform. Pins the ubiquitous language
for the product — with emphasis on the public web surfaces and their cinematic
WebGL reinvention. Glossary only: no implementation detail lives here.

## Public surfaces

**Envelope**:
The single signature object the whole public brand is built around — a
physically-credible, wax-sealed envelope. Sealed on the Landing chapter (the
promise); personalised and opening on the Invitation chapter (the guest's name
embossed, the seal cracks). The thing a guest is meant to screenshot and forward.
_Avoid_: card, hero graphic, "the 3D model" (it is the *brand* object, not a generic asset)

**Chapter**:
One of the two public surfaces that share one design DNA but serve different jobs.
The **Landing chapter** (`/`) sells the product to couples — confident,
product-forward. The **Invitation chapter** (`/d/:couple/:token`) is the intimate
microsite a guest opens from WhatsApp, usually one-handed on a phone.
_Avoid_: page, screen (when naming the two branded surfaces specifically)

**Scene**:
A content section of the invitation — story, gallery, details, venue, countdown,
RSVP, gift, guestbook — presented as a moment the camera travels through rather
than a stacked card.
_Avoid_: section, div, block (when emphasising the cinematic treatment)

## Theming

**Palette**:
One of the 15 complete, pre-approved colour-and-light schemes a couple picks for
their invitation (stored as `themeColor`). A palette is chosen whole — colours are
never mixed across palettes, so combinations never need QA.
_Avoid_: theme, colour scheme, skin

**Font pairing**:
One of the 12 Arabic+Hebrew type pairings a couple picks (stored as `fontFamily`).
Each is a single CSS family stack; the browser renders the Arabic face for Arabic
glyphs and the Hebrew face for Hebrew, with no per-language routing.
_Avoid_: font, typeface (a pairing is two coordinated faces, not one)

## Distribution & resilience

**Snapshot**:
The frozen copy of a couple's design embedded in an invite token at send time
(`designSnapshot`). A guest always sees the snapshot, so edits the couple makes
after sending never change an already-distributed link.
_Avoid_: cache, copy

**Poster fallback**:
The motion-free, WebGL-free rendering a guest sees when their device can't run the
cinematic stage, or when they have asked for reduced motion. It must be beautiful
and complete on its own — never a degraded error state.
_Avoid_: fallback, no-JS version, placeholder
