export type CurrentUser = {
  id: string;
  keycloakId: string;
  email: string;
  fullName: string;
  roles: readonly string[];
};

export function isCurrentUser(value: unknown): value is CurrentUser {
  if (typeof value !== "object" || value === null) return false;
  const user = value as Record<string, unknown>;
  return (
    ["id", "keycloakId", "email", "fullName"].every(
      (key) => typeof user[key] === "string",
    ) &&
    Array.isArray(user.roles) &&
    user.roles.every((role) => typeof role === "string")
  );
}
