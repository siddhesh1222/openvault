/**
 * The single HTTP client used by the whole app.
 *
 * - Adds the saved login token to every request ("Authorization: Bearer ...").
 * - If the server says 401 (token expired/invalid), logs the user out.
 */
import axios from "axios";

export const TOKEN_KEY = "ov_token";

export const api = axios.create({ baseURL: "/api" });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const hadToken = Boolean(error.config?.headers?.Authorization);
    if (error.response?.status === 401 && hadToken) {
      // Session expired: forget the token and go to the login page.
      localStorage.removeItem(TOKEN_KEY);
      if (!window.location.pathname.startsWith("/login")) {
        window.location.assign("/login?expired=1");
      }
    }
    return Promise.reject(error);
  },
);

/** Turn any API error into a short message that can be shown in a toast. */
export function errorMessage(error, fallback = "Something went wrong") {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail[0]?.msg) {
    // FastAPI validation errors: "Value error, Name cannot be empty" -> "Name cannot be empty"
    return detail[0].msg.replace(/^Value error, /, "");
  }
  if (error?.code === "ERR_NETWORK") return "Can't reach the server. Is it running?";
  return fallback;
}

/** Start a normal browser download of `url` (an API link with a token in it). */
export function downloadUrl(url) {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
