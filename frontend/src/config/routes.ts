export const routes = {
  review: "/manual-review",
  reviewDetailsPattern: "/manual-review/:applicationId",
  reviewDetails: (id: string) => `/manual-review/${id}`,
  home: "/",
  login: "/login",
  dashboard: "/dashboard",
  profile: "/profile",
  creditApplication: "/applications/new",
  applicationDetailsPattern: "/applications/:applicationId",
  applicationDetails: (id: string) => `/applications/${id}`,
} as const;
