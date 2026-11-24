"use strict";
// Guarda la app en el aparato para que abra al momento y funcione sin conexión,
// y envía las notas por su cuenta: sigue aunque la app esté cerrada y espera a que vuelva la conexión.
// Desde el 24/11/2026 también enseña los avisos que manda el Mac (avisos.js).
importScripts("cola.js", "avisos.js");
const VERSION = "apuntar-4";
const FICHEROS = ["./", "index.html", "cola.js", "avisos.js", "manifest.webmanifest", "icon-192.png", "icon-512.png"];

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

// ----- Avisos del Mac -----
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {} } catch (x) { d = { cuerpo: e.data ? e.data.text() : "" } }
  const titulo = d.titulo || "Segundo Cerebro";
  const op = { body: d.cuerpo || "", data: { url: d.url || "" }, icon: "icon-192.png", requireInteraction: !!d.urgente };
  // El mismo asunto (por ejemplo, una cuenta que sigue sin datos) sustituye al aviso anterior en vez de apilarse.
  if (d.clave) { op.tag = d.clave; op.renotify = true }
  e.waitUntil(Promise.all([
    self.registration.showNotification(titulo, op),
    Avisos.guarda({ titulo, cuerpo: d.cuerpo || "", url: d.url || "", t: Date.now() }).then(() => Avisos.poda()).catch(() => {}),
    avisa({ aviso: true }),
  ]));
});

// Al tocar el aviso se abre lo que dice (normalmente el panel, en su sitio); sin enlace, la app.
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(self.clients.openWindow(url));
});

// Si el navegador cambia la suscripción, se da de alta otra vez solo.
self.addEventListener("pushsubscriptionchange", e => {
  e.waitUntil((async () => {
    const s = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytesClave(VAPID) });
    await Cola.pon(notaAlta(s.toJSON()));
    await envia();
  })().catch(() => {}));
});
