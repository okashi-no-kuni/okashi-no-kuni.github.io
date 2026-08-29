/* 表紙（タイトル画面）を 機械で しらべる。
 *
 * 表紙は 毎フレーム えがきつづける 画面なので、絵を 足すたびに
 * こっそり 重くなります。目では 気づけません
 * （じっさい、ボタンの ふわふわを getBoundingClientRect で 読んでいたせいで
 *   毎フレーム 焼きなおしが 走り、24fps まで 落ちていました）。
 *
 * つかいかた:
 *   node tools/check-title.mjs        # 終了コード 0 で合格
 *
 * しらべること:
 *   ① JSエラーが 0件か
 *   ② 5つの 画面幅で 表紙が 出るか
 *   ③ ボタンが 画面に 収まっていて、下に すき間が あるか
 *   ④ 60fps 近く 出ているか（平均 50fps 以上・わるい1フレーム 34ms 以下）
 *   ⑤ 「はじめる」で とじて 盤面に 入れるか
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { resolve } from 'path';

const FILE = resolve(process.argv[2] || 'index.html');
const SIZES = [[320,690],[375,667],[393,852],[402,874],[430,932]];
const ng = [];

const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium',
                                  args:['--allow-file-access-from-files'] });
for (const [w, h] of SIZES){
  const p = await b.newPage({ viewport:{ width:w, height:h }, deviceScaleFactor:3,
                              reducedMotion:'no-preference' });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + FILE);
  await p.waitForTimeout(2200);

  const on = await p.$eval('#titleOv', e => e.classList.contains('on'));
  if (!on) ng.push(`${w}x${h} 表紙が 出ない`);
  for (const e of errs) ng.push(`${w}x${h} JSエラー: ${e}`);

  const box = await p.evaluate(() => {
    const r = document.getElementById('titleGo').getBoundingClientRect();
    return { l:r.left, r:r.right, b:r.bottom, w:r.width, gap:innerHeight - r.bottom };
  });
  if (box.l < 4 || box.r > w - 4) ng.push(`${w}x${h} ボタンが はみ出す (${Math.round(box.l)}..${Math.round(box.r)})`);
  if (box.gap < 12)               ng.push(`${w}x${h} ボタンの 下が せますぎる (${Math.round(box.gap)}px)`);

  /* 90フレーム はかる。**焼きなおしが 毎フレーム 走ると ここで 落ちます** */
  const fps = await p.evaluate(() => new Promise(res => {
    const ts = []; let n = 0;
    const tick = () => { ts.push(performance.now());
      if (++n < 90) requestAnimationFrame(tick);
      else { const d = []; for (let i=1;i<ts.length;i++) d.push(ts[i]-ts[i-1]);
        d.sort((a,b) => a-b);
        res({ ave: 1000/(d.reduce((a,b)=>a+b,0)/d.length), worst: d[d.length-3] }); } };
    requestAnimationFrame(tick);
  }));
  if (fps.ave   < 50) ng.push(`${w}x${h} おそい: 平均 ${fps.ave.toFixed(1)}fps`);
  if (fps.worst > 34) ng.push(`${w}x${h} ひっかかる: わるい1フレーム ${fps.worst.toFixed(1)}ms`);

  await p.evaluate(() => document.getElementById('titleGo').click());
  await p.waitForTimeout(900);
  if (await p.$eval('#titleOv', e => e.classList.contains('on')))
    ng.push(`${w}x${h} 「はじめる」で とじない`);

  console.log(`${String(w).padStart(3)}x${h}  ${fps.ave.toFixed(1)}fps` +
              `（わるい1フレーム ${fps.worst.toFixed(1)}ms）` +
              ` ボタン ${Math.round(box.w)}px・下のすき間 ${Math.round(box.gap)}px`);
  await p.close();
}
await b.close();

console.log('');
if (ng.length){ for (const m of ng) console.log('  ✗ ' + m); console.log('\n検査 NG'); process.exit(1); }
console.log('検査 OK ✅');
