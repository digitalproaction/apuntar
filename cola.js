"use strict";
// La cola de notas y su envío. La usan la página y el servicio de fondo.
// Va en IndexedDB porque el servicio de fondo no puede leer localStorage.
const Cola = (() => {
  const abre = () => new Promise((ok, mal) => {
    const r = indexedDB.open("apuntar", 1);
    r.onupgradeneeded = () => { r.result.createObjectStore("notas", { keyPath: "id" }); r.result.createObjectStore("conf") };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  });
  const hace = async (almacen, modo, fn) => {
    const d = await abre();
    return new Promise((ok, mal) => {
      const t = d.transaction(almacen, modo), q = fn(t.objectStore(almacen));
      t.oncomplete = () => { d.close(); ok(q.result) };
      t.onabort = t.onerror = () => { d.close(); mal(t.error) };
    });
  };
  return {
    pon: n => hace("notas", "readwrite", s => s.put(n)),
    quita: id => hace("notas", "readwrite", s => s.delete(id)),
    todas: () => hace("notas", "readonly", s => s.getAll()),
    conf: () => hace("conf", "readonly", s => s.get("c")),
    ponConf: c => hace("conf", "readwrite", s => s.put(c, "c")),
  };
})();

// Envía las notas de una en una y dice cuántas han salido.
// Si algo falla lanza un error: así el navegador sabe que tiene que reintentarlo.
async function enviaCola() {
  const c = await Cola.conf();
  if (!c) return 0;
  let hechas = 0;
  for (;;) {
    const q = await Cola.todas();
    if (!q.length) return hechas;
    const n = q[0], ab = new AbortController(), reloj = setTimeout(() => ab.abort(), 25000);
    try {
      const r = await fetch(c.d, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ k: c.k, f: n.f, t: n.t, id: n.id }), signal: ab.signal });
      const j = await r.json();
      if (!j.ok) throw Object.assign(new Error("clave"), { clave: true });
    } finally { clearTimeout(reloj) }
    await Cola.quita(n.id);
    hechas++;
  }
}
