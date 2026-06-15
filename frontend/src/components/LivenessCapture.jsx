// Lazy-loaded AWS Face Liveness capture. Imported via React.lazy() so the heavy
// Amplify bundle only loads when a guest actually picks the camera path.
//
// The detector streams the camera challenge to AWS; pass/fail confidence is
// fetched SERVER-SIDE (GET FaceLivenessSessionResults in the enroll endpoint),
// so this component only needs to know the session started and finished.
import { FaceLivenessDetector } from "@aws-amplify/ui-react-liveness";
import "@aws-amplify/ui-react/styles.css";
import { Amplify } from "aws-amplify";
import { COGNITO_IDENTITY_POOL_ID, LIVENESS_REGION } from "../utils/awsLiveness.js";

let configured = false;
function ensureConfigured() {
  if (configured || !COGNITO_IDENTITY_POOL_ID) return;
  Amplify.configure({
    Auth: { Cognito: { identityPoolId: COGNITO_IDENTITY_POOL_ID, allowGuestAccess: true } },
  });
  configured = true;
}

export default function LivenessCapture({ sessionId, region, onComplete, onError, onCancel }) {
  ensureConfigured();
  return (
    <div style={{ maxWidth: 420, margin: "0 auto" }}>
      <FaceLivenessDetector
        sessionId={sessionId}
        region={region || LIVENESS_REGION}
        onAnalysisComplete={async () => {
          if (onComplete) await onComplete();
        }}
        onError={(err) => {
          if (onError) onError(err);
        }}
        onUserCancel={() => {
          if (onCancel) onCancel();
        }}
      />
    </div>
  );
}
