/* UIイメージ（モック）を 絵に する。
 *
 *   node mock/english/shot.mjs      # mock/english/shots/ に 6まい ＋ ならべた1まい
 *
 * 1まいずつ iPhone 実寸（393x852）で 撮ります。画面ごとに 撮るのは、
 * ならべた 絵だけだと 文字が つぶれて 読めないためです。
 */
import { launch } from '../../tools/_pw.mjs';
import { mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT  = resolve(here, 'shots');
mkdirSync(OUT, { recursive: true });

const NAMES = ['title', 'course', 'board-basic', 'board-adv', 'sound-basic', 'sound-adv',
               'clear', 'waves', 'settings'];

const b = await launch();
const p = await b.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 });
const errs = [];
p.on('pageerror', e => errs.push(e.message));

await p.goto('file://' + resolve(here, 'ui.html'));
await p.waitForTimeout(1200);

/* 画面ごとに 1まい。中みが わくから はみ出していないかも ついでに 見る */
for (let i = 0; i < NAMES.length; i++){
  const id  = '#f' + (i + 1);
  const el  = await p.$(id);
  await el.screenshot({ path: resolve(OUT, `${i + 1}-${NAMES[i]}.png`) });
  const over = await p.$eval(id, n => {
    const s = n.querySelector('.scr');
    return s ? Math.round(s.scrollHeight - n.clientHeight) : 0;
  });
  console.log(`  ${i + 1}-${NAMES[i]}.png` + (over > 0 ? `  ⚠ たてに ${over}px はみ出し` : ''));
}

/* ぜんぶ ならべた 1まい（ぱっと 見るため）。
   ここだけ 等倍で 撮る ——2倍だと よこ 5000px・2.5MB に なって、
   ぱっと 見るための 絵なのに かえって 開きにくい */
const p2 = await b.newPage({ viewport: { width: 4000, height: 1000 }, deviceScaleFactor: 1 });
await p2.goto('file://' + resolve(here, 'ui.html'));
await p2.waitForTimeout(1200);
const row = await p2.$('.row');
await row.screenshot({ path: resolve(OUT, '0-all.png') });
console.log('  0-all.png');

console.log(errs.length ? '⚠ JSエラー: ' + errs.join(' / ') : 'JSエラー 0');
await b.close();
