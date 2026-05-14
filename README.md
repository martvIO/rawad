# دعوة (Dawa)

A wedding-invitation distribution app — marketing landing page, a role-based portal
(groom / driver / admin), and a public guest-confirmation form. State is persisted in the
browser's `localStorage`; the live map uses Leaflet (loaded from CDN) and address lookup uses
the OpenStreetMap Nominatim API.

## Run

```bash
npm install
npm run dev      # start the dev server
npm run build    # production build → dist/
npm run preview  # serve the production build
```

## Login credentials (seed data)

| Role   | Username | Password    |
|--------|----------|-------------|
| Admin  | `admin`  | `admin2026` |
| Groom  | `groom`  | `1234`      |
| Driver | `driver` | `1234`      |

The guest confirmation form opens via a URL parameter: `?form=<groomUsername>` (e.g. `?form=groom`).

## Project structure

```
src/
  main.jsx              React entry — mounts <App/>
  App.jsx               Root: ?form= detection + view router (landing / portal / confirm form)
  styles/               GlobalStyle — the injected global CSS
  i18n/                 Arabic + Hebrew strings and the makeT() translator
  data/                 Static data: sample guests, status map, cities, invite content
  assets/               Brand SVG markup
  utils/                Pure helpers: storage, phone, validation, geo
  hooks/                useLeaflet, useGeolocation, usePortalState
  context/              PortalContext — shares portal state without prop-drilling
  components/            Reusable UI: BrandLogo, LiveMap, modals, address fields, ...
  pages/                LandingPage, ConfirmationForm
  pages/portal/         The portal: login screen + admin / driver / groom views
```
