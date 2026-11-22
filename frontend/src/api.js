let csrfToken = null;
export function resetToken() {
  csrfToken = null;
}
export async function api(path, { method = 'GET', body, signal } = {}) {
  if (method !== 'GET' && !csrfToken) {
    const response = await api('/auth/csrf', { signal });
    csrfToken = response.data.csrf_token;
  }
  let response;
  try {
    response = await fetch('/api' + path, {
      method,
      signal,
      credentials: 'same-origin',
      headers:
        method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error(
      method === 'GET'
        ? 'Connection failed. Please try again.'
        : 'The result is unconfirmed. Refresh the conversation before retrying.',
    );
  }
  if (response.status === 204) return null;
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error?.message || 'Request failed');
    error.code = result.error?.code;
    error.status = response.status;
    error.fields = result.error?.fields;
    if (error.code === 'AUTH_REQUIRED') {
      resetToken();
      window.dispatchEvent(new Event('session-expired'));
    }
    throw error;
  }
  if (result.data?.csrf_token) csrfToken = result.data.csrf_token;
  return result;
}
export const queryKey = (user, ...parts) => [user.role, user.id, ...parts];
