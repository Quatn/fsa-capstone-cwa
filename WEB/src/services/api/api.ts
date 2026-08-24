import axios from "axios";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 5000,
  // headers: { "X-Custom-Header": "foobar" },
});

export default api;
