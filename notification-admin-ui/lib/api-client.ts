import { type ServiceName, getServiceUrl } from "./service-config";

export class ApiError extends Error {
  code: string;
  details: string;
  status: number;

  constructor(code: string, message: string, details: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

interface RequestOptions {
  params?: Record<string, string | number | boolean | undefined | null>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

function buildQueryString(
  params?: Record<string, string | number | boolean | undefined | null>,
): string {
  if (!params) return "";
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null,
  );
  if (entries.length === 0) return "";
  const searchParams = new URLSearchParams();
  for (const [key, value] of entries) {
    searchParams.append(key, String(value));
  }
  return `?${searchParams.toString()}`;
}

async function parseErrorResponse(response: Response): Promise<ApiError> {
  try {
    const body = await response.json();
    return new ApiError(
      body.code ?? "UNKNOWN",
      body.message ?? response.statusText,
      body.details ?? "",
      body.status ?? response.status,
    );
  } catch {
    return new ApiError(
      "UNKNOWN",
      response.statusText || "Request failed",
      "",
      response.status,
    );
  }
}

async function request<T>(
  service: ServiceName,
  method: string,
  path: string,
  body?: unknown,
  options?: RequestOptions,
): Promise<T> {
  const baseUrl = getServiceUrl(service);
  const queryString = buildQueryString(options?.params);
  const url = `${baseUrl}${path}${queryString}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...options?.headers,
  };

  const fetchOptions: RequestInit = {
    method,
    headers,
    signal: options?.signal,
  };

  if (body !== undefined) {
    fetchOptions.body = JSON.stringify(body);
  }

  const response = await fetch(url, fetchOptions);

  if (!response.ok) {
    throw await parseErrorResponse(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export const apiClient = {
  get<T>(service: ServiceName, path: string, options?: RequestOptions) {
    return request<T>(service, "GET", path, undefined, options);
  },

  post<T>(
    service: ServiceName,
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ) {
    return request<T>(service, "POST", path, body, options);
  },

  put<T>(
    service: ServiceName,
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ) {
    return request<T>(service, "PUT", path, body, options);
  },

  patch<T>(
    service: ServiceName,
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ) {
    return request<T>(service, "PATCH", path, body, options);
  },

  delete<T>(service: ServiceName, path: string, options?: RequestOptions) {
    return request<T>(service, "DELETE", path, undefined, options);
  },
};

export function swrFetcher<T>(
  key: string | [ServiceName, string, Record<string, string | number | boolean | undefined | null>?],
): Promise<T> {
  if (typeof key === "string") {
    return fetch(key).then((res) => {
      if (!res.ok) throw new Error(res.statusText);
      return res.json();
    });
  }
  const [service, path, params] = key;
  return apiClient.get<T>(service, path, params ? { params } : undefined);
}
