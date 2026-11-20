export const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

export async function apiFetch(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch (err) {
    throw new Error(`Can't reach the server at ${API_URL}. Is the backend running?`);
  }

  let data = null;
  try { data = await res.json(); } catch (e) { /* empty body is fine */ }

  if (!res.ok) throw new Error((data && data.message) || `Request failed (${res.status})`);
  return data;
}