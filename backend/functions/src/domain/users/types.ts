// Shapes for the user domain module. These mirror the request/profile shapes
// the legacy users.ts handlers used (CreatePortalUserInput / UpdatePortalUserInput
// / ExistingUserProfile), relocated next to the logic that owns them.

export type Role = "groom" | "driver" | "admin";

export interface CreateUserInput {
  username: string;
  password: string;
  phoneE164?: string;
  role: Role;
  displayName?: string;
  canSeeAttendance?: boolean;
  canUsePhotographer?: boolean;
  canUseBoardingPass?: boolean;
}

export interface UpdateUserInput {
  username?: string;
  displayName?: string | null;
  phoneE164?: string;
  role?: Role;
}

export interface ExistingUserProfile {
  username: string;
  role: Role;
  phoneE164?: string;
  displayName?: string | null;
}
