/* App Store の スクリーンショットを 出す。
 *
 *   node tools/shots.mjs        # tools/out/shots/ に 6まい
 *
 * **サイズは 1320x2868（6.9インチ）ちょうどで なければ 通りません。**
 * いまの App Store Connect は iPhone は この 1サイズだけ 出せば、
 * 小さい 機種にも そのまま つかわれます。
 * Playwright の viewport は CSSピクセルなので 440x956 ＋ 3倍で 出します。
 *
 * **手で 撮らないこと。**画面を 直すたびに 撮りなおしが 出ますし、
 * 「どの状態を 撮ったか」が のこりません。ここに 書いておけば、
 * バランスを 変えても 同じ 場面が また 出せます。
 *
 * ならびは ストアで 見える順。**1まいめが いちばん だいじ**です
 * （検索結果に 出るのは 最初の 3まい）。
 */
import { launch } from './_pw.mjs';
import { mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT  = resolve(root, 'tools/out/shots');
mkdirSync(OUT, { recursive: true });

/* 6.9インチ（iPhone 16 Pro Max）= 440x956pt @3x = 1320x2868px */
const W = 440, H = 956, DPR = 3;

const b = await launch();
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
const errs = [];
p.on('pageerror', e => errs.push(e.message));

const wait = ms => p.waitForTimeout(ms);
const shot = async (n, name) => {
  await p.screenshot({ path: resolve(OUT, `${String(n).padStart(2, '0')}-${name}.png`) });
  console.log(`  ${String(n).padStart(2, '0')}-${name}.png`);
};

await p.goto('file://' + resolve(root, 'index.html'));
await wait(2500);

console.log('スクリーンショット（1320x2868）');

/* ① 表紙。ストアの 1まいめ。読みこみを 待ってから 撮る */
await shot(1, 'title');

/* 表紙を とじて、はじめの 画面を ぬける */
await p.evaluate(() => document.getElementById('titleGo')?.click());
await wait(1000);
for (const id of ['weGo', 'ovBtn', 'loginBtn']){
  const el = await p.$('#' + id);
  if (el && await el.isVisible()){ await el.click(); await wait(800); }
}
await wait(600);

/* 検査の 入口を つかうため、いちど dbg つきで 入れなおす。
   ここから先は 見た目を 作るので、セーブは そのまま つかう */
await p.goto('file://' + resolve(root, 'index.html') + '?dbg=1');
await wait(2200);
await p.evaluate(() => document.getElementById('titleGo')?.click());
await wait(900);
for (const id of ['weGo', 'ovBtn', 'loginBtn', 'backGo']){
  const el = await p.$('#' + id);
  if (el && await el.isVisible()){ await el.click(); await wait(700); }
}
await wait(500);

/* ② 盤面。なかまを ならべて、たたかっている ところ。
   **ワザバーを からっぽで 撮らない**こと ——「図鑑から貼る」が 6つ ならぶと
   作りかけに 見える。先に ずかんを うめて、ワザを はっておく */
await p.evaluate(() => {
  window.__dbg.setStars(60000);
  window.__dbg.setWave(24);
  window.__dbg.fillDex(0.62);
  ['purin','choco','taffy','donut','fairy','king'].forEach(ch => window.__dbg.pin(ch));
});
await p.evaluate(() => {
  /* 道の わきに なかまを ならべる。おけない マスは place が false をかえす */
  const spots = [[1,1],[3,2],[5,4],[7,3],[2,6],[6,7],[4,9],[8,8],[0,4],[5,10]];
  const kinds = ['candy','ice','choco','star'];
  let i = 0;
  for (const [c, r] of spots)
    if (window.__dbg.place(c, r, kinds[i % kinds.length], 3 + (i % 3))) i++;
});
await p.evaluate(() => document.getElementById('btnWave').click());
await wait(6000);
await shot(2, 'battle');

/* ③ 図鑑（コレクション）。あつめる ゲームだと ひとめで 分かる */
await p.evaluate(() => document.getElementById('btnCol').click());
await wait(1200);
await shot(3, 'dex');
await p.evaluate(() => document.getElementById('colClose').click());
await wait(500);

/* ④ 伝説との たいけつ */
await p.evaluate(() => window.__dbg.duel(4));   // ひょうがのマンモス
await wait(1800);
await shot(4, 'duel');
await p.evaluate(() => { const s = document.getElementById('duSub');
                         if (s && s.style.display !== 'none') s.click(); });
await wait(800);

/* ⑤ まもり神 */
await p.evaluate(() => {
  ['candytree','berryqueen','whale','chocoknight','mammoth','phoenix',
   'kraken','elephant','chronos','kyubi','moonrabbit','pegasus']
    .forEach(id => window.__dbg.guardGive(id));
  window.__dbg.guardGive('pegasus');
  [...document.getElementById('skillBar').children].find(x => x.dataset.gd).click();
});
await wait(900);
await shot(5, 'guardian');
await p.evaluate(() => document.getElementById('gdClose').click());
await wait(500);

/* ⑥ たまご。集める たのしさと かくりつ表示（3.1.1）が いっしょに 写る */
await p.evaluate(() => { window.__dbg.setStars(999999); window.__chk.openEgg(); });
await wait(1200);
await shot(6, 'eggs');

if (errs.length){ console.error('\nJSエラー:\n' + errs.join('\n')); }
await b.close();
console.log('\n' + OUT);
console.log(errs.length ? '\n⚠ JSエラー ' + errs.length + '件' : '\n検査 OK ✅');
process.exit(errs.length ? 1 : 0);
