// API config

const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000";

// Build full API URL
export function api(path: string): string {
  return `${API_BASE_URL}${path}`;
}

// Check if JWT is expired
export function isTokenExpired(): boolean {
  const token = sessionStorage.getItem("token");
  if (!token) return true;

  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    // exp is in seconds
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}
