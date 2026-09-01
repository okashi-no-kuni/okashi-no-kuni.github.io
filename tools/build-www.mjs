/* アプリに つつむ ぶんだけを www/ に あつめる。
 *
 *   node tools/build-www.mjs        # www/ を 作りなおす
 *
 * **リポジトリを まるごと つつんでは いけません。**
 * art/ の 直下には 生成したときの 原画（1まい 700〜900KB）が
 * 160まい・あわせて **114MB** 入っていますが、ゲームが 読むのは
 * art/sprites/ と art/screens/ と title_main.webp だけです。
 * まるごと 入れると アプリが 130MB を こえて、
 * モバイル回線で ダウンロードできない 大きさに なります。
 *
 *   入れる もの   約20MB  … これだけで ゲームは ぜんぶ 動く
 *   入れない もの 114MB   … 原画・道具・CLAUDE.md・.git
 *
 * **新しい 絵や ページを 足したら、ここの KEEP にも 足すこと。**
 * 足しわすれると、web では 動くのに **アプリだけ 絵が 出ません**。
 * さいごに「index.html が 読む ファイルが ぜんぶ あるか」を
 * 機械で たしかめて いるので、足しわすれれば ここで 落ちます。
 */
import { readFileSync, rmSync, mkdirSync, cpSync, existsSync, statSync, readdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WWW  = resolve(root, 'www');

/* アプリに 入れる もの。ディレクトリでも ファイルでも よい */
const KEEP = [
  'index.html',
  'invite.html',
  'privacy.html',
  'support.html',
  'manifest.webmanifest',
  'apple-touch-icon.png',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'vendor/phaser.min.js',
  'vendor/phaser-LICENSE.txt',   // MIT は 著作権の 一文を くばる 義務が ある
  'art/sprites',
  'art/screens',
  'art/title/title_main.webp',
];

rmSync(WWW, { recursive: true, force: true });
mkdirSync(WWW, { recursive: true });

let bytes = 0;
const walk = p => statSync(p).isDirectory()
  ? readdirSync(p).reduce((n, f) => n + walk(join(p, f)), 0)
  : statSync(p).size;

for (const rel of KEEP){
  const src = resolve(root, rel);
  if (!existsSync(src)){ console.error('✗ ありません: ' + rel); process.exit(1); }
  const dst = resolve(WWW, rel);
  mkdirSync(dirname(dst), { recursive: true });
  cpSync(src, dst, { recursive: true });
  bytes += walk(src);
}

/* ---- 足しわすれの 検査 ----
   index.html が 名ざしで 読む ファイルが www/ に あるか。
   絵の キーは コードで 組み立てる ので（'art/sprites/' + k + '.png'）、
   ART_KEYS を 読んで 1つずつ たしかめる */
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const miss = [];

// ① 文字列で 名ざししている もの（art/screens/xxx.webp など）
for (const m of html.matchAll(/['"](art\/[A-Za-z0-9_\-\/]+\.(?:png|webp|jpg))['"]/g))
  if (!existsSync(resolve(WWW, m[1]))) miss.push(m[1]);

// ② スプライトの キー（ART_KEYS の ならび）
const keys = html.match(/const ART_KEYS\s*=\s*\[([\s\S]*?)\]/);
if (keys)
  for (const m of keys[1].matchAll(/'([a-z0-9_]+)'/g))
    if (!existsSync(resolve(WWW, 'art/sprites/' + m[1] + '.png')))
      miss.push('art/sprites/' + m[1] + '.png');

// ③ たいけつの 背景（DUEL_BG の 12国）
for (const m of html.matchAll(/'(duel_[a-z]+)'/g))
  if (!existsSync(resolve(WWW, 'art/screens/' + m[1] + '.webp')))
    miss.push('art/screens/' + m[1] + '.webp');

const uniq = [...new Set(miss)];
const mb = n => (n / 1024 / 1024).toFixed(1) + 'MB';
console.log('www/ … ' + mb(bytes));
if (uniq.length){
  console.error('\n✗ アプリに 入っていない 絵が ' + uniq.length + '件\n  ' + uniq.join('\n  '));
  console.error('\n  tools/build-www.mjs の KEEP に 足してください');
  process.exit(1);
}
console.log('読みおとし なし ✅');
