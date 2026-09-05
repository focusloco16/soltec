export const API = "http://127.0.0.1:8007";

export function obtenerToken() {
  return localStorage.getItem("token");
}

export function obtenerUsuario() {
  try {
    return JSON.parse(localStorage.getItem("usuario") || "null");
  } catch {
    return null;
  }
}

export function guardarSesion(token, usuario) {
  localStorage.setItem("token", token);
  localStorage.setItem("usuario", JSON.stringify(usuario));
}

export function cerrarSesion() {
  localStorage.removeItem("token");
  localStorage.removeItem("usuario");
  window.location.href = "/login";
}

export async function peticion(url, opciones = {}) {
  const cabeceras = { ...(opciones.headers || {}) };
  // Si el body no es FormData se asume JSON
  if (!(opciones.body instanceof FormData)) {
    cabeceras["Content-Type"] = "application/json";
  }
  const token = obtenerToken();
  if (token) {
    cabeceras["Authorization"] = "Bearer " + token;
  }
  const respuesta = await fetch(API + url, { ...opciones, headers: cabeceras });
  if (respuesta.status === 401) {
    cerrarSesion();
  }
  return respuesta;
}
