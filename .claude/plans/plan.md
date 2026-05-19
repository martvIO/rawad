Digital Invitation — Database Restructure + Photos-Not-Showing Fix
Context
Two related problems:

Uploaded photos/files vanish on page refresh. Root cause: Firestore was only just enabled in the Firebase Console — the security rules have never been deployed (firebase deploy --only firestore was never run). Without deployed rules, Firestore defaults to "block all reads and writes." Storage uploads to Firebase Storage succeed (Storage rules were deployed), but the Firestore addDoc/setDoc metadata writes are blocked. On refresh, onSnapshot returns nothing, so the UI shows an empty list.

Scattered Firestore structure. Currently digital invitation data for a groom lives across 4 separate top-level Firestore collections (digitalGuests, digitalMedia, photographerFiles, designRequests). The user wants a clean, unified structure — all digital data for a groom under one path.

Since no real data exists yet in Firestore (it was just created), there is no migration cost.

New Firestore Structure
digitalInvitations/{groomUid}                             ← document (background media)
  backgroundUrl:   string
  backgroundType:  "image" | "gif" | "video"
  storagePath:     string

digitalInvitations/{groomUid}/guests/{guestId}            ← subcollection
  name, phone, status, createdAt
  confirmedAt?, inviteLinkToken?, inviteLinkSentAt?, note?

digitalInvitations/{groomUid}/photographerFiles/{fileId}  ← subcollection
  name, url, type, storagePath, uploadedAt

digitalInvitations/{groomUid}/designRequests/{reqId}      ← subcollection
  groomUsername, status, templateData, mockups[],
  revisionNotes, createdAt, updatedAt, approvedAt?
Old → New collection paths:

Old path	New path
digitalGuests/{groomUid}/guests/{guestId}	digitalInvitations/{groomUid}/guests/{guestId}
digitalMedia/{groomUid} (document)	digitalInvitations/{groomUid} (same doc, different name)
photographerFiles/{groomUid}/files/{fileId}	digitalInvitations/{groomUid}/photographerFiles/{fileId}
designRequests/{reqId} (flat, groomUid field)	digitalInvitations/{groomUid}/designRequests/{reqId}
Storage paths — unchanged (Storage rules already deployed, no need to move files).

Files to Modify
src/services/digitalInvitation.js
Three path changes:

guestsCol(uid) → collection(firestore, 'digitalInvitations', uid, 'guests')
mediaDoc(uid) → doc(firestore, 'digitalInvitations', uid)
filesCol(uid) → collection(firestore, 'digitalInvitations', uid, 'photographerFiles')
All function bodies unchanged.

src/services/designRequests.js
Replace designCol() (flat) with designCol(groomUid) → collection(firestore, 'digitalInvitations', groomUid, 'designRequests')
subscribeAllDesignRequests(cb) → use collectionGroup(firestore, 'designRequests') for admin view
Add groomUid parameter to: startDesigning, commitMockup, approveDesign, requestRevision
Remove groomUid field from addDoc payload in submitDesignTemplate (path is the authority now)
functions/src/digitalInvite.ts
submitDigitalGuestInvite: change Firestore doc ref from digitalGuests/${tk.groomUid}/guests/${tk.guestId} → digitalInvitations/${tk.groomUid}/guests/${tk.guestId}
createDigitalGuestInvite: change guest lookup from digitalGuests/${groomUid}/guests/${guestId} → digitalInvitations/${groomUid}/guests/${guestId}
firestore.rules
Replace all 4 separate match blocks with one unified rule:

match /digitalInvitations/{groomUid} {
  allow read, write: if request.auth != null
    && (request.auth.uid == groomUid || request.auth.token.role == 'admin');

  match /{subcollection=**} {
    allow read, write: if request.auth != null
      && (request.auth.uid == groomUid || request.auth.token.role == 'admin');
  }
}
Also add a collectionGroup rule so admin subscribeAllDesignRequests works:

match /{path=**}/designRequests/{reqId} {
  allow read: if request.auth != null && request.auth.token.role == 'admin';
}
src/pages/portal/admin/AdminDesignRequests.jsx
startDesigning(reqId) → startDesigning(req.groomUid, reqId)
commitMockup(req.id, req.mockups, newMockup) → commitMockup(req.groomUid, req.id, req.mockups, newMockup)
src/pages/portal/groom/digital/DigitalDesignRequest.jsx
approveDesign(reqId) → approveDesign(currentUid, reqId)
requestRevision(reqId, ...) → requestRevision(currentUid, reqId, ...)
Order of Operations
Update digitalInvitation.js (3 line changes)
Update designRequests.js (path + signature changes)
Update digitalInvite.ts Cloud Function (2 path changes)
Update firestore.rules
Fix caller sites in AdminDesignRequests.jsx + DigitalDesignRequest.jsx
Build: cd functions && npm run build && cd .. && npm run build
Deploy: firebase deploy --only functions,firestore,hosting --project dawa-aa793
Verification
firebase deploy --only firestore completes without error.
As groom: open Digital → Photographer → upload a photo → refresh page → photo still shows.
As groom: open Digital → Dashboard → upload background image → refresh → image still shows.
As groom: add a digital guest → refresh → guest still in list.
Firebase Console → Firestore → digitalInvitations/{groomUid} → see document + subcollections guests, photographerFiles.
cd functions && npm run build — clean.
npm run build — clean.