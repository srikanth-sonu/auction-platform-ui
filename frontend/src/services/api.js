import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:4000",
});

api.interceptors.request.use((config) => {
  const username = localStorage.getItem("admin_user");
  const password = localStorage.getItem("admin_pass");
  if (username) config.headers.username = username;
  if (password) config.headers.password = password;
  return config;
});

export default api;
