import axios from 'axios';

const normalizeBaseUrl = (value) => {
  if (!value || typeof value !== 'string') return null;
  const v = value.trim().replace(/\/$/, '');
  if (!v) return null;

  // Common misconfig: ":5000" or ":5000/api" (gets treated as a relative URL in the browser)
  if (/^:\d+(\/.*)?$/.test(v)) return `http://localhost${v}`;

  // Common misconfig: "localhost:5000" or "localhost:5000/api"
  if (/^[a-zA-Z0-9.-]+:\d+(\/.*)?$/.test(v)) return `http://${v}`;

  // Expected: "http(s)://host:port"
  if (/^https?:\/\//i.test(v)) return v;

  return v;
};

const envBaseURL = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL);
const hostname = typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname : 'localhost';
// In dev, frontend runs on 5173 and backend on 5000. Use the current hostname so
// accessing from another device (LAN IP) works without hardcoding localhost.
const defaultDevBaseURL = `http://${hostname}:5000`;
// In prod (or when backend serves the frontend), use same-origin by default.
const defaultProdBaseURL = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'http://localhost:5000';

const baseURL = envBaseURL || (import.meta.env.DEV ? defaultDevBaseURL : defaultProdBaseURL);

if (import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.info('[API] Using baseURL:', baseURL);
}

export const axiosInstance = axios.create({
  baseURL,
});

axiosInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    // eslint-disable-next-line no-param-reassign
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    if (status === 401) {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    }
    return Promise.reject(error);
  }
);

export default axiosInstance;
