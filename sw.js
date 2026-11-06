"use strict";
// Guarda la app en el aparato para que abra al momento y funcione sin conexión,
// y envía las notas por su cuenta: sigue aunque la app esté cerrada y espera a que vuelva la conexión.
importScripts("cola.js");
const VERSION = "apuntar-3";
const FICHEROS = ["./", "index.html", "cola.js", "manifest.webmanifest", "icon-192.png", "icon-512.png"];

self.addEventListener("install", e => {
  // cache: "reload" evita guardar una copia vieja que siga en la memoria del navegador.
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FICHEROS.map(f => new Request(f, { cache: "reload" })))));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const k = await caches.keys(), habia = k.some(x => x !== VERSION);
    await Promise.all(k.filter(x => x !== VERSION).map(x => caches.delete(x)));
    await self.clients.claim();
    // Si estaba abierta la versión anterior, la recarga: así basta con abrir la app una vez.
    if (habia) for (const c of await self.clients.matchAll({ type: "window" })) c.navigate(c.url).catch(() => {});
  })());
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
});

const avisa = m => self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(cs => cs.forEach(c => c.postMessage(m)));

async function trabaja() {
  try {
    const n = await enviaCola();
    if (n) await avisa({ enviado: n });
  } catch (e) {
    await avisa({ fallo: true, clave: !!e.clave });
    throw e;
  }
}

// De una pasada en una: nunca salen dos envíos a la vez, y cada aviso repasa la cola por si llegó algo nuevo.
let turno = Promise.resolve();
const envia = () => (turno = turno.catch(() => {}).then(trabaja));

self.addEventListener("sync", e => { if (e.tag.startsWith("enviar")) e.waitUntil(envia()) });
self.addEventListener("periodicsync", e => { if (e.tag === "enviar") e.waitUntil(envia()) });
