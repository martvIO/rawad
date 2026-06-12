# data-testid Registry

Every interactive element added for Playwright tests is listed here. Keep this
file in sync when adding new test ids — convention is kebab-case prefixed by
kind: `field-`, `btn-`, `nav-`, `alert-`, `form-`, `stat-`, `modal-`.

## Login (src/pages/portal/LoginScreen.jsx)

| Test id | Element |
|---|---|
| `field-login-user` | Username `<input>` |
| `field-login-pass` | Password `<input>` |
| `btn-login-submit` | Submit `<button>` |
| `btn-login-back` | Back to landing `<button>` |
| `alert-login-error` | Inline error `<div>` |

## Portal shells — shared

| Test id | Element |
|---|---|
| `btn-logout` | Logout in admin/groom/driver shell headers |

## Admin shell (src/pages/portal/admin/AdminPortal.jsx)

| Test id | Element |
|---|---|
| `alert-admin-warning` | Yellow "admin mode" warning banner |
| `nav-admin-users` | Sub-tab nav link |
| `nav-admin-send` | Sub-tab nav link |
| `nav-admin-confirmations` | Sub-tab nav link |
| `nav-admin-designs` | Sub-tab nav link |
| `nav-admin-settings` | Sub-tab nav link |

## Admin → Users (src/pages/portal/admin/AdminUserManager.jsx)

| Test id | Element |
|---|---|
| `btn-new-role-groom` / `-driver` / `-admin` | Role pickers in create form |
| `field-new-user` | New username `<input>` |
| `field-new-pass` | New password `<input>` |
| `btn-create-user` | Create-user submit |
| `btn-filter-all` / `-grooms` / `-drivers` / `-admins` | List filter chips |
| `btn-delete-user` | Per-row delete (first press) |
| `btn-delete-user-confirm` | Per-row delete confirmation |

## Driver shell (src/pages/portal/driver/DriverPortal.jsx)

| Test id | Element |
|---|---|
| `nav-driver-pending` | Pending route nav |
| `nav-driver-map` | Map nav |
| `nav-driver-location` | Share-location nav |
| `nav-driver-shared` | Shared-cities nav |

## Driver → Pick groom (src/pages/portal/driver/DriverPickGroom.jsx)

| Test id | Element |
|---|---|
| `field-driver-pick-groom` | Groom-username `<input>` |
| `btn-driver-pick-groom-submit` | Continue button |
| `alert-driver-pick-error` | Inline error `<div>` |

## Groom type select (src/pages/portal/groom/GroomTypeSelect.jsx)

| Test id | Element |
|---|---|
| `btn-type-handwritten` | Handwritten card button |
| `btn-type-digital` | Digital card button |

## Groom handwritten shell (src/pages/portal/groom/GroomHandwrittenShell.jsx)

| Test id | Element |
|---|---|
| `nav-groom-dashboard` | Dashboard nav |
| `nav-groom-guests` | Guests nav |
| `nav-groom-add` | Add nav |
| `nav-groom-proofs` | Proofs nav |
| `nav-groom-map` | Guest map nav |

## Groom → Add guest (src/pages/portal/groom/GroomAddGuest.jsx)

| Test id | Element |
|---|---|
| `field-guest-name` | Name `<input>` |
| `field-guest-area` | Address wrapper `<div>` (input is inside AddressInput) |
| `btn-guest-type-premium` | Premium type chip |
| `btn-guest-type-vip` | VIP type chip |
| `btn-add-guest` | Submit add-guest |

## Public confirmation + per-guest invite forms

(src/pages/ConfirmationForm.jsx + src/pages/InviteForm.jsx)

| Test id | Element |
|---|---|
| `field-conf-name` | Name `<input>` |
| `field-conf-street` | Street `<input>` |
| `field-conf-house` | House `<input>` |
| `field-conf-note` | Driver note `<textarea>` (invite form only) |
| `btn-conf-submit` | Submit confirmation |
| `alert-conf-error` | Inline error `<div>` |
| `conf-thanks-title` | Success heading |
| `conf-invalid-title` | Invalid-token heading |
| `conf-expired-title` | Expired-token heading |
| `conf-used-title` | Already-used heading |

## Notes

- Phone inputs use the existing `.phone-input-native` class; we don't add a
  test id to keep the PhoneInput component generic.
- City autocomplete uses `.input-field` (no test id added); tests target it by
  position when needed.
