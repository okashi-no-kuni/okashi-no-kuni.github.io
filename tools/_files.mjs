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
  'art/title/title_main.webp',
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
