const STORAGE_KEY = "kpl_api_base";

export function getApiBase() {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved.trim()) return saved.trim().replace(/\/$/, "");
  }
  const env = import.meta.env.VITE_API_BASE_URL;
  if (env && String(env).trim()) return String(env).trim().replace(/\/$/, "");
  // Same-origin when UI is served by the Node backend / reverse proxy
  if (typeof window !== "undefined") return "";
  return "http://localhost:4000";
}

export function setApiBase(url) {
  const clean = String(url || "").trim().replace(/\/$/, "");
  if (clean) localStorage.setItem(STORAGE_KEY, clean);
  else localStorage.removeItem(STORAGE_KEY);
}

export function getSocketBase() {
  const savedSocket =
    typeof window !== "undefined"
      ? localStorage.getItem("kpl_socket_base")
      : null;
  if (savedSocket && savedSocket.trim()) {
    return savedSocket.trim().replace(/\/$/, "");
  }
  return (
    import.meta.env.VITE_SOCKET_URL ||
    getApiBase() ||
    (typeof window !== "undefined" ? window.location.origin : "http://localhost:4000")
  );
}

export function setSocketBase(url) {
  const clean = String(url || "").trim().replace(/\/$/, "");
  if (clean) localStorage.setItem("kpl_socket_base", clean);
  else localStorage.removeItem("kpl_socket_base");
}
