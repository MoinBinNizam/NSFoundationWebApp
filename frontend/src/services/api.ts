const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data: T;
  pagination?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export async function apiRequest<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    // A development-proxy failure (for example, when the backend is not
    // running) may return an empty response body. Read text first so an empty
    // or non-JSON response cannot mask the actual request failure with a
    // JSON parsing exception.
    const responseText = await response.text();
    let data: ApiResponse<T> | { message?: string } | null = null;

    if (responseText.trim()) {
      try {
        data = JSON.parse(responseText) as ApiResponse<T>;
      } catch {
        if (!response.ok) {
          throw new Error(
            `The API returned an invalid response (HTTP ${response.status}). ` +
              'Ensure the backend server is running and try again.'
          );
        }
        throw new Error('The API returned invalid JSON. Please contact an administrator.');
      }
    }

    if (!response.ok) {
      if (response.status === 401) {
        // Token invalid or expired: clear token and notify auth context
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.dispatchEvent(new Event('auth:unauthorized'));
      }
      const message = data?.message;
      if (!message && !responseText.trim()) {
        throw new Error(
          `The API server did not return a response (HTTP ${response.status}). ` +
            'Ensure the backend server is running on port 5000 and MongoDB is available.'
        );
      }
      throw new Error(message || `Request failed with status ${response.status}`);
    }

    if (!data) {
      throw new Error('The API returned an empty response. Please try again.');
    }

    return data as ApiResponse<T>;
  } catch (error) {
    throw error;
  }
}
