export type ApiClient = {
  request<T>(
    path: string,
    options?: Omit<RequestInit, "body"> & { body?: unknown },
  ): Promise<T>;
  download(path: string, options?: Omit<RequestInit, "body">): Promise<Blob>;
};
