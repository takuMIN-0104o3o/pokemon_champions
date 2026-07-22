// PWA用 Service Worker（オフラインでもアプリの骨格＋データが開けるようにする）
const CACHE_NAME = "poke-champ-cache-v9";

const APP_SHELL = [
  "./",
  "./index.html",
  "./master.html",
  "./style.css?v9",
  "./main.js?v9",
  "./master.js?v9",
  "./icons.svg",
  "./form-icon.svg",
  "./favicon.svg",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/types/normal.svg",
  "./icons/types/fire.svg",
  "./icons/types/water.svg",
  "./icons/types/electric.svg",
  "./icons/types/grass.svg",
  "./icons/types/ice.svg",
  "./icons/types/fighting.svg",
  "./icons/types/poison.svg",
  "./icons/types/ground.svg",
  "./icons/types/flying.svg",
  "./icons/types/psychic.svg",
  "./icons/types/bug.svg",
  "./icons/types/rock.svg",
  "./icons/types/ghost.svg",
  "./icons/types/dragon.svg",
  "./icons/types/dark.svg",
  "./icons/types/steel.svg",
  "./icons/types/fairy.svg",
  "./data/abilities_by_pokemon.json",
  "./data/bulba_mega_icons_raw.json",
  "./data/bulba_pokemon_icons.json",
  "./data/form_change_map.json",
  "./data/item_icon_map.json",
  "./data/learnset.json",
  "./data/lists.json",
  "./data/masterdata.json",
  "./data/masterdata_items.json",
  "./data/mega_bulba_icon_map.json",
  "./data/mega_map.json",
  "./data/pokemon_db.json",
  "./data/pokemon_names.json",
  "./data/pz_pokemon_icons.json",
  "./data/ranking.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// 同一オリジンのファイル: キャッシュ優先＋バックグラウンド更新
// クロスオリジン（フォント・ポケモン画像等）: ネットワーク優先、失敗時のみキャッシュ
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetchPromise = fetch(req)
          .then((res) => {
            const resClone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
            return res;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
  } else {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          return res;
        })
        .catch(() => caches.match(req))
    );
  }
});
