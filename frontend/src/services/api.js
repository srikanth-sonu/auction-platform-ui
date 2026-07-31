import axios from "axios";
import { getApiBase } from "./config";

const api = axios.create({
  timeout: 20000,
});

api.interceptors.request.use((config) => {
  config.baseURL = getApiBase();
  const username = localStorage.getItem("admin_user");
  const password = localStorage.getItem("admin_pass");
  if (username) config.headers.username = username;
  if (password) config.headers.password = password;
  return config;
});

export async function checkApiHealth() {
  const base = getApiBase();
  try {
    const res = await api.get("/health", { timeout: 8000 });
    return { ok: true, base, data: res.data };
  } catch (err) {
    try {
      const res = await api.get("/api/auction/health", { timeout: 8000 });
      return { ok: true, base, data: res.data };
    } catch {
      return {
        ok: false,
        base: base || "(same origin)",
        error:
          err?.message ||
          "Cannot reach API. Set a working backend URL in Settings.",
      };
    }
  }
}

export default api;
