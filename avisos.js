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
// El alta va por el mismo buzón que las notas, con su clave: solo esta app puede darse de alta para recibir avisos.
const notaAlta = s => ({ f: ahoraAv(), t: "AVISOS-ALTA " + JSON.stringify(s), id: "alta-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) });
