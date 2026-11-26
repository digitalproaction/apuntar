"use strict";
// Los avisos que manda el Mac (el vigilante de avisos, _herramientas/avisos/ del repositorio privado).
// La clave de abajo es pública: solo le dice al móvil de quién acepta avisos y no abre nada.
// Los avisos llegan cifrados de punta a punta: el servicio de avisos del navegador no puede leerlos.
const VAPID = "BKqYFtjJXzr3aZKbZjUP4Tw9ePKGKOftbmShIcEBT2OHnmgmXtAIU1QY9ch6BCT23zkrZPXYY4Qeyo9IQ25O-7g";

// Los últimos avisos recibidos, en este aparato, para verlos dentro de la app.
const Avisos = (() => {
  const abre = () => new Promise((ok, mal) => {
    const r = indexedDB.open("avisos", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("avisos", { keyPath: "n", autoIncrement: true });
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  });
  const hace = async (modo, fn) => {
    const d = await abre();
    return new Promise((ok, mal) => {
      const t = d.transaction("avisos", modo), q = fn(t.objectStore("avisos"));
      t.oncomplete = () => { d.close(); ok(q && q.result) };
      t.onabort = t.onerror = () => { d.close(); mal(t.error) };
    });
  };
  return {
    guarda: a => hace("readwrite", s => s.add(a)),
    ultimos: async n => ((await hace("readonly", s => s.getAll())) || []).slice(-n).reverse(),
    marca: async n => { const a = await hace("readonly", s => s.get(n)); if (a) { a.sobra = true; await hace("readwrite", s => s.put(a)) } },
    // Se quedan los 50 últimos.
    poda: async () => {
      const k = (await hace("readonly", s => s.getAllKeys())) || [];
      for (const x of k.slice(0, Math.max(0, k.length - 50))) await hace("readwrite", s => s.delete(x));
    },
  };
})();

const bytesClave = b => {
  const s = atob((b + "=".repeat((4 - b.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, c => c.charCodeAt(0));
};
const dosAv = n => (n < 10 ? "0" : "") + n;
const ahoraAv = () => { const d = new Date(); return d.getFullYear() + "-" + dosAv(d.getMonth() + 1) + "-" + dosAv(d.getDate()) + " " + dosAv(d.getHours()) + ":" + dosAv(d.getMinutes()) };
const idAv = p => p + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
// Las notas «del sistema» (sistema: true) viajan por el buzón como las de Marc, pero no cuentan como notas suyas en la
// pantalla («1 nota sin enviar», «Enviado.»).
// El alta va por el mismo buzón que las notas, con su clave: solo esta app puede darse de alta para recibir avisos.
const notaAlta = s => ({ f: ahoraAv(), t: "AVISOS-ALTA " + JSON.stringify(s), id: idAv("alta"), sistema: true });
// «Sobra»: este aviso no le sirve a Marc. El vigilante deja de mandarlo y el repaso del lunes revisa la regla.
const notaSobra = clave => ({ f: ahoraAv(), t: "AVISOS-SOBRA " + clave, id: idAv("sobra"), sistema: true });
// Desde la versión 10 (26/11/2026), para quitar del móvil los avisos ya resueltos:
// - «CERRADA»: Marc tocó o quitó esa notificación; el Mac ya no tiene que retirarla.
// - «VERSION»: en qué versión está la app; el Mac solo manda «retirar» a una que lo entiende.
// - «RETIRADA»: qué pasó al retirar una (cuántas se quitaron y si quedó la muda «✓ Ya está»), para comprobarlo sin preguntar a Marc.
const notaCerrada = clave => ({ f: ahoraAv(), t: "AVISOS-CERRADA " + clave, id: idAv("cerr"), sistema: true });
const notaVersion = v => ({ f: ahoraAv(), t: "AVISOS-VERSION " + v, id: idAv("ver"), sistema: true });
const notaRetirada = (clave, x) => ({ f: ahoraAv(), t: "AVISOS-RETIRADA " + clave + " · " + x, id: idAv("ret"), sistema: true });
