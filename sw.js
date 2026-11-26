"use strict";
// Guarda la app en el aparato para que abra al momento y funcione sin conexión,
// y envía las notas por su cuenta: sigue aunque la app esté cerrada y espera a que vuelva la conexión.
// Desde el 24/11/2026 también enseña los avisos que manda el Mac (avisos.js).
importScripts("cola.js", "avisos.js");
const VERSION = "apuntar-10";   // 7: iconos en dorado (26/11/2026) · 8: botón con lo que hay que hacer en el aviso (26/11/2026) · 9: ubicación para el tiempo del panel, al abrir la app (26/11/2026) · 10: el Mac quita del móvil los avisos ya resueltos (26/11/2026)
const APP = "10";             // la que se le dice al Mac (AVISOS-VERSION)
const FICHEROS = ["./", "index.html", "cola.js", "avisos.js", "manifest.webmanifest", "icon-192-oro.png", "icon-512-oro.png", "icon-512-oro-mask.png", "badge-96.png"];

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
    // Le dice al Mac en qué versión está: solo a una que lo entiende le manda «retirar». Sale con la siguiente
    // pasada de la cola (la página la pide al abrirse); aquí no se espera a la red para no frenar la recarga.
    await Cola.pon(notaVersion(APP)).catch(() => {});
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
  // El Mac quita un aviso que ya está resuelto (desde la versión 10).
  if (d.retirar) { e.waitUntil(retira(self.registration, d)); return }
  const titulo = d.titulo || "Segundo Cerebro";
  const boton = d.boton && /^https:\/\//.test(d.boton.url || "") ? d.boton : null;
  const op = { body: d.cuerpo || "", data: { url: d.url || "", clave: d.clave || "", boton: boton ? boton.url : "" }, icon: "icon-192-oro.png", badge: "badge-96.png", requireInteraction: !!d.urgente };
  // Al tocar el aviso se abre su tarjeta en el panel. Si lo que hay que hacer es de un toque (abrir el chat del cliente,
  // abrir Axi), el botón sale ya en la notificación (26/11/2026). «Sobra» (25/11/2026): con un toque, ese aviso deja de
  // llegar y el lunes se revisa la regla. Android enseña como mucho dos botones.
  op.actions = [];
  if (boton) op.actions.push({ action: "abrir", title: String(boton.texto || "Abrir").slice(0, 24) });
  if (d.clave) op.actions.push({ action: "sobra", title: "Sobra" });
  // El mismo asunto (por ejemplo, una cuenta que sigue sin datos) sustituye al aviso anterior en vez de apilarse.
  if (d.clave) { op.tag = d.clave; op.renotify = true }
  e.waitUntil(Promise.all([
    // Con un aviso nuevo a la vista, las mudas «✓ Ya está» ya no hacen falta.
    self.registration.showNotification(titulo, op).then(() => cierraHechas(self.registration)),
    Avisos.guarda({ titulo, cuerpo: d.cuerpo || "", url: d.url || "", clave: d.clave || "", t: Date.now() }).then(() => Avisos.poda()).catch(() => {}),
    avisa({ aviso: true }),
  ]));
});

// Al tocar el aviso se abre lo que dice (normalmente el panel, en su sitio); sin enlace, la app.
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const d = e.notification.data || {};
  if (e.action === "sobra" && d.clave) {
    // Va por el mismo buzón que las notas: el vigilante del Mac lo recoge y deja de mandar ese aviso.
    e.waitUntil(Cola.pon(notaSobra(d.clave)).then(() => envia()).catch(() => {}));
    return;
  }
  const abre = self.clients.openWindow(e.action === "abrir" && d.boton ? d.boton : d.url || "./");
  e.waitUntil(Promise.all([abre.catch(() => {}), cerrada(d)]));
});

// Marc quita una notificación sin tocarla (deslizándola o con «Borrar todo»).
self.addEventListener("notificationclose", e => e.waitUntil(cerrada(e.notification.data || {})));

// ----- Quitar del móvil los avisos ya resueltos (desde la versión 10, 26/11/2026) -----
// Marc, 26/11/2026: «le di a "ya escribí" a andres en clientes, pero no se escondió ni nada la notificacion del segundo
// cerebro». Al resolverse un aviso que sonó, el Mac manda {retirar: <clave>} y aquí se quita la notificación con ese tag.
// Chrome en Android pide que cada push deje a la vista al menos una notificación de la app: si no, gasta un margen y,
// cuando se acaba, enseña «Este sitio se ha actualizado en segundo plano» (push_messaging_notification_manager.cc).
// Por eso, si la que se quita era la única, queda en su sitio una muda «✓ Ya está», sin sonido, que se va con el
// siguiente aviso o al abrir la app. Y para no mandar «retirar» de una que ya no está, la app le dice al Mac cuándo
// Marc ha tocado o quitado una («AVISOS-CERRADA»).
const SUELTAS = new Set(["noche", "varios", "alta"]);   // resúmenes y avisos del sistema: el Mac no los retira
const esHecha = n => !!(n.data && n.data.hecho);
const cierraHechas = async reg => { for (const n of await reg.getNotifications()) if (esHecha(n)) n.close() };
function cerrada(d) {
  if (!d.clave || d.hecho || SUELTAS.has(d.clave)) return Promise.resolve();
  return Cola.pon(notaCerrada(d.clave)).then(() => envia()).catch(() => {});
}
async function retira(reg, d) {
  const suyas = await reg.getNotifications({ tag: d.retirar });
  suyas.forEach(n => n.close());
  const otras = (await reg.getNotifications()).filter(n => n.tag !== d.retirar);
  const deVerdad = otras.filter(n => !esHecha(n)), hechas = otras.filter(esHecha);
  let muda = false;
  if (deVerdad.length) hechas.forEach(n => n.close());          // queda otro aviso a la vista: basta con quitarla
  else if (suyas.length) {                                       // era la única: queda la muda en su sitio
    hechas.forEach(n => n.close());
    await reg.showNotification("✓ " + (d.titulo || "Ya está"), { body: d.cuerpo || "Ya está resuelto. No tienes que hacer nada.",
      tag: d.retirar, silent: true, renotify: false, icon: "icon-192-oro.png", badge: "badge-96.png",
      data: { url: d.url || "", clave: d.retirar, hecho: true } });
    muda = true;
  }
  // Si no estaba (Marc ya la había tocado o quitado), no hay nada que enseñar.
  // Le cuenta al Mac qué ha pasado: así se comprueba que en el móvil funciona sin preguntárselo a Marc.
  await Cola.pon(notaRetirada(d.retirar, "cerradas " + suyas.length + " · quedan " + deVerdad.length + " · muda " + (muda ? "sí" : "no")))
    .then(() => envia()).catch(() => {});
}

// Si el navegador cambia la suscripción, se da de alta otra vez solo.
self.addEventListener("pushsubscriptionchange", e => {
  e.waitUntil((async () => {
    const s = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytesClave(VAPID) });
    await Cola.pon(notaAlta(s.toJSON()));
    await envia();
  })().catch(() => {}));
});
