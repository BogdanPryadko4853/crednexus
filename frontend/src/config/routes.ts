export const routes = {
  home: "/",
  login: "/login",
  dashboard: "/dashboard",
  profile: "/profile",
  creditApplication: "/applications/new",
  applicationDetailsPattern: "/applications/:applicationId",
  applicationDetails: (id: string) => `/applications/${id}`,
} as const;
