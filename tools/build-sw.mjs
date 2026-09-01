/* web版を **オフラインでも あそべるように** する（sw.js を 作る）。
 *
 *   node tools/build-sw.mjs        # sw.js を 作りなおす
 *
 * アプリ版は 絵も コードも 中に 入っているので はじめから オフラインですが、
 * ブラウザ版は 毎回 GitHub Pages から 読んでいます。
 * Service Worker を 置くと、**一度 あそんだら 電波が 無くても あそべます**
 * （ホーム画面に 追加した ときも おなじ）。
 *
 * ---- 2段がまえに する ----
 * ぜんぶ（19MB）を 最初に ためると、**はじめて 来た人の 待ち時間が
 * 一気に のびます。**だから 分けます。
 *
 *   CORE  1.5MB  入れた しゅんかんに ためる。これだけで 表紙と 盤面が 出る
 *   REST  17MB   ゲームが 動きだしてから、うしろで ゆっくり ためる
 *
 * ---- 古いままに ならない ように ----
 * いちばん こわいのは「直したのに 古い ままが 出る」です。
 * 中みが 1バイトでも 変わると **キャッシュの 名前が 変わる**ように
 * してあるので（中みの ハッシュ）、次に ひらいた ときには 新しく なります。
 * ガイド（📕）の いちばん下に いまの 版が 出るので、そこで 見わけられます。
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { createHash } from 'crypto';
import { CORE, REST, expand, root } from './_files.mjs';

const core = expand(CORE);
const rest = expand(REST);

/* 中みから 版を 作る。**日づけに しないこと** ——中みが 同じでも
   ビルドの たびに 全員の キャッシュが むだに 捨てられます */
const h = createHash('sha1');
for (const f of [...core, ...rest]) h.update(readFileSync(resolve(root, f)));
const VERSION = h.digest('hex').slice(0, 10);

const size = list => list.reduce((n, f) => n + readFileSync(resolve(root, f)).length, 0);
const mb = n => (n / 1024 / 1024).toFixed(1) + 'MB';

const sw = `/* このファイルは 手で 直さないこと。
   node tools/build-sw.mjs が 作りなおします（中みは tools/_files.mjs）*/
const V = '${VERSION}';
const CACHE = 'okashi-' + V;
const CORE = ${JSON.stringify(core, null, 0)};
const REST = ${JSON.stringify(rest, null, 0)};

/* 入れた しゅんかん：すぐ いる ものだけ ためる */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

/* 有効に なった しゅんかん：古い キャッシュを 捨てて、のこりを うしろで ためる */
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
    warm();                       // 待たない。ゲームを 止めない ため
  })());
});

/* のこりを 1つずつ。**まとめて addAll しない**こと ——1つ こけると
   ぜんぶ 失敗に なるので、17MB が まるごと むだに なります */
async function warm(){
  const c = await caches.open(CACHE);
  for (const u of REST){
    try{ if (!(await c.match(u))) await c.add(u); }catch(e){}
  }
}

/* 読むとき：キャッシュに あれば それ。無ければ ネットから とって ためる */
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const url = new URL(r.url);
  if (url.origin !== self.location.origin) return;   // よその ドメインは さわらない
  e.respondWith((async () => {
    const hit = await caches.match(r, { ignoreSearch: true });
    if (hit) return hit;
    try{
      const res = await fetch(r);
      if (res && res.ok && res.type === 'basic')
        (await caches.open(CACHE)).put(r, res.clone());
      return res;
    }catch(err){
      /* 電波が 無くて キャッシュにも 無い。ページの 行き先なら 表紙を かえす */
      if (r.mode === 'navigate') return caches.match('index.html');
      throw err;
    }
  })());
});

/* ガイドの 診断に 出す ため。版が 分かると「古い キャッシュ？」を 切りわけられる */
self.addEventListener('message', e => {
  if (e.data === 'version' && e.source) e.source.postMessage({ sw: V });
});
`;

/* --check … 中みが 変わったのに sw.js を 作りなおして いないと 落とす。
   **これが 無いと いちばん こわい 形で こわれます** ——絵や コードを
   直して 出したのに、遊ぶ人には いつまでも 古いままが 出る。
   しかも エラーも 出ないので、報告されるまで 気づけません */
if (process.argv.includes('--check')){
  let now = '';
  try{ now = readFileSync(resolve(root, 'sw.js'), 'utf8'); }catch(e){}
  if (now !== sw){
    console.error('✗ sw.js が 古いです（いまの 中みの 版は ' + VERSION + '）');
    console.error('  node tools/build-sw.mjs を 走らせて コミットしてください');
    process.exit(1);
  }
  console.log('sw.js は 最新 ✅（版 ' + VERSION + '）');
  process.exit(0);
}

writeFileSync(resolve(root, 'sw.js'), sw);
console.log('sw.js … 版 ' + VERSION);
console.log('  すぐ ためる  ' + String(core.length).padStart(3) + '件 ' + mb(size(core)));
console.log('  あとで ためる ' + String(rest.length).padStart(3) + '件 ' + mb(size(rest)));
