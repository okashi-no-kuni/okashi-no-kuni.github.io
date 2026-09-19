/* UIイメージ（モック）を 絵に する。ダークと ライトの 2周。
 *
 *   node mock/wordlink/shot.mjs      # shots/dark/ と shots/light/ に 7まいずつ
 *
 * 1まいずつ iPhone 実寸（393x852）で 撮ります。ならべた 絵だけだと
 * 文字が つぶれて 読めないためです。
 */
import { launch } from '../../tools/_pw.mjs';
import { mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const NAMES = ['title', 'levels', 'board', 'sound', 'result', 'progress', 'settings'];

const b = await launch();
const errs = [];

for (const theme of ['dark', 'light']){
  const OUT = resolve(here, 'shots', theme);
  mkdirSync(OUT, { recursive: true });
  const p = await b.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 });
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + resolve(here, 'ui.html'));
  await p.evaluate(t => document.documentElement.dataset.theme = t, theme);
  await p.waitForTimeout(900);

  console.log(theme);
  for (let i = 0; i < NAMES.length; i++){
    const id = '#f' + (i + 1);
    await (await p.$(id)).screenshot({ path: resolve(OUT, `${i + 1}-${NAMES[i]}.png`) });
    const over = await p.$eval(id, n => {
      const s = n.querySelector('.scr');
      return s ? Math.round(s.scrollHeight - n.clientHeight) : 0;
    });
    console.log(`  ${i + 1}-${NAMES[i]}.png` + (over > 0 ? `  ⚠ たてに ${over}px はみ出し` : ''));
  }
  /* ならべた 1まい。等倍で 撮る（2倍だと 開きにくい 大きさに なる）*/
  const p2 = await b.newPage({ viewport: { width: 3100, height: 1000 }, deviceScaleFactor: 1 });
  await p2.goto('file://' + resolve(here, 'ui.html'));
  await p2.evaluate(t => document.documentElement.dataset.theme = t, theme);
  await p2.waitForTimeout(900);
  await (await p2.$('.row')).screenshot({ path: resolve(OUT, '0-all.png') });
  console.log('  0-all.png');
  await p.close(); await p2.close();
}

console.log(errs.length ? '⚠ JSエラー: ' + errs.join(' / ') : 'JSエラー 0');
await b.close();
