import { translateText } from '../i18n/translations';

const rawApiUrl = (import.meta.env.VITE_API_URL || '').trim().replace(/\/$/, '');
export const API_BASE_URL = rawApiUrl
  ? rawApiUrl.endsWith('/api')
    ? rawApiUrl
    : `${rawApiUrl}/api`
  : '/api';

export function getApiUrl(endpoint: string): string {
  const clean = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  if (clean.startsWith('/api/')) {
    return `${API_BASE_URL}${clean.slice(4)}`;
  }
  if (clean === '/api') {
    return API_BASE_URL;
  }
  return `${API_BASE_URL}${clean}`;
}

function localizeApiMessage(message: string): string {
  const language = localStorage.getItem('language') === 'bn' ? 'bn' : 'en';
  return translateText(message, language);
}

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

export function getAuthToken(): string | null {
  return sessionStorage.getItem('token') || localStorage.getItem('token');
}

export function setAuthSession(token: string, user: unknown): void {
  // Session storage: auto-terminates when browser/tab is closed
  sessionStorage.setItem('token', token);
  sessionStorage.setItem('user', JSON.stringify(user));
  // Keep user profile in local storage for instant hydration, but remove persistent token
  localStorage.setItem('user', JSON.stringify(user));
  localStorage.removeItem('token');
}

export function clearAuthSession(): void {
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('user');
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

export function saveInterruptedWork(path: string): void {
  if (!path || path === '/login' || path === '/dashboard' || path === '/member-portal' || path === '/') {
    return;
  }
  try {
    localStorage.setItem(
      'nsf_interrupted_work',
      JSON.stringify({
        path,
        timestamp: Date.now(),
      })
    );
  } catch {
    // Non-blocking
  }
}

export function getInterruptedWork(): string | null {
  try {
    const raw = localStorage.getItem('nsf_interrupted_work');
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Valid for up to 2 hours
    if (Date.now() - data.timestamp < 7200000 && data.path) {
      return data.path;
    }
    localStorage.removeItem('nsf_interrupted_work');
    return null;
  } catch {
    return null;
  }
}

export function clearInterruptedWork(): void {
  localStorage.removeItem('nsf_interrupted_work');
}

export async function apiRequest<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (options.body instanceof FormData) {
    delete headers['Content-Type'];
  }
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes((options.method || 'GET').toUpperCase())) {
    headers['Idempotency-Key'] = crypto.randomUUID();
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = getApiUrl(endpoint);

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

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
        clearAuthSession();
        window.dispatchEvent(new Event('auth:unauthorized'));
      }
      const message = data?.message;
      if (!message && !responseText.trim()) {
        throw new Error(
          `The API server did not return a response (HTTP ${response.status}). ` +
            'Ensure the backend server is running on port 5000 and MongoDB is available.'
        );
      }
      throw new Error(localizeApiMessage(message || `Request failed with status ${response.status}`));
    }

    if (!data) {
      throw new Error('The API returned an empty response. Please try again.');
    }

    return data as ApiResponse<T>;
  } catch (error) {
    throw error;
  }
}
