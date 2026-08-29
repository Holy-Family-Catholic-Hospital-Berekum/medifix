// Single source of truth for which roles require TOTP enrollment before
// they're allowed into the app. Imported by both the login flow
// (SignUp.jsx, where enrollment is triggered) and the route guard
// (ProtectedRoute.jsx, where it's enforced) so they can't drift apart.
export const MFA_REQUIRED_ROLES = ["admin", "manager"];
