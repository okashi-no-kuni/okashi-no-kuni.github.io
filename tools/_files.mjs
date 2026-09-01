/* アプリと web版が つかう ファイルの ならび。**ここ 1か所**で 決めます。
 *
 * 2か所に 書くと かならず ずれます ——アプリには 入っているのに
 * オフラインでは 出ない、その逆、が 起きます。
 *
 *   tools/build-www.mjs  アプリに つつむ ぶんを www/ に あつめる
 *   tools/build-sw.mjs   web版を オフラインでも あそべるように する
 *
 * **絵や ページを 足したら ここに 足すこと。**足しわすれると
 * web では 動くのに アプリだけ 絵が 出ません（build-www が 機械で
 * しらべるので、そこで 落ちます）。
 */
import { readdirSync, statSync } from 'fs';
import { resolve, dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* すぐ いる もの。**これだけで 表紙と 盤面が 出ます。**
   web版の オフラインは まず ここだけ 先に ためて、
   のこりは あとから ゆっくり ためます（1.5MB と 19MB の ちがい）*/
export const CORE = [
  'index.html',
  'manifest.webmanifest',
  'apple-touch-icon.png',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'vendor/phaser.min.js',
  'vendor/phaser-LICENSE.txt',   // MIT は 著作権の 一文を くばる 義務が ある
  /* 表紙は **2つ とも 入れる**こと。`TITLE_V2` を false に すれば
     いつでも v1 に もどせる、が この 段どりの ねらいなので、
     v1 を 外すと もどした とたん アプリと オフラインだけ 絵が 出なく なります。
     v2 が 正式採用に なったら、v1 を 片づけるのは 別の 作業で */
  'art/title/title_main.webp',   // v1（いままでの 完成版）
  'art/title/title_v2.webp',     // v2（いまの 候補）
  /* UIアイコン。**REST では なく ここ**に 入れること ——図鑑・ガイド・音の
     ボタンは 起動した しゅんかん 画面に あるので、あとから ためる 形に すると
     初回だけ 予備の SVG が 出て、あとから ぱっと 変わって 見えます。
     4まいで 38KB なので CORE が ふくらむ 心配は ありません。
     `_source` の つく 原画は expand() の SKIP が はじくので、
     art/ui/_reference/ は アプリにも キャッシュにも 入りません */
  'art/ui',
];

/* あとから いる もの。キャラの 絵と 画面の 絵、ほかの ページ */
export const REST = [
  'invite.html',
  'privacy.html',
  'support.html',
  'art/sprites',
  'art/screens',
];

/* 出しなおす ため だけに のこして ある 原画。**ゲームは 1回も 読みません。**
   `art/screens` を まるごと 入れると これも ついてきて、
   **6.7MB**（13まい）が アプリにも オフラインの キャッシュにも
   入って いました。ディレクトリで 書く かぎり、こういう 取りこぼしは
   また 起きるので、ここで まとめて はじきます */
const SKIP = /(^|\/)[^/]*_source\.[a-z]+$/;

/* ディレクトリを ファイルに ひらく */
export function expand(list){
  const out = [];
  const walk = rel => {
    const abs = resolve(root, rel);
    if (statSync(abs).isDirectory())
      for (const f of readdirSync(abs).sort()) walk(join(rel, f));
    else {
      const p = relative(root, abs).split('\\').join('/');
      if (!SKIP.test(p)) out.push(p);
    }
  };
  for (const rel of list) walk(rel);
  return out;
};

/* アプリに つつむ ぶん＝ぜんぶ */
export const KEEP = [...CORE, ...REST];
