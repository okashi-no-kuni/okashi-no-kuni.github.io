/* 敵が 道の 上を あるいているかを 見はる。
 *
 * 「敵が じめんの 上を あるいている」と 言われて 作りました。
 * 道の いち（pathPts）は CELL を つかった ピクセルなので、
 * CELL が 変わったのに はかりなおしを わすれると、
 * 敵だけ 古い ますの 大きさで えがかれて 道から はずれます。
 *
 * つかいかた:
 *   node tools/check-path.mjs        # 終了コード 0 で合格
 *
 * 焼いた じめんを 1マスずつ よんで、その国の 道の色（p1/p2）と
 * じめんの色（g1/g2）の どちらに 近いかで しらべます。
 * 色を きめうちに すると 国ごとに ちがうので まちがえます
 * （こおりのくには 道が 水色で、じめんより 青い）。
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--allow-file-access-from-files'] });
const pg = await b.newPage({ viewport:{ width:393, height:852 }, deviceScaleFactor:3 });
const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
await pg.goto('file://' + process.cwd() + '/index.html?dbg=1');
await pg.waitForTimeout(1600);
for (let i=0;i<4;i++){ const btn=await pg.$('#ovBtn'); if (btn && await btn.isVisible()){ await btn.click(); await pg.waitForTimeout(250);} else break; }
await pg.evaluate(() => __dbg.setStars(99999999));
console.log('はじめ:', JSON.stringify(await pg.evaluate(() => { const a=__dbg.groundAudit(); return { ずれ:a.ng.length, cell:a.CELL, 国:a.theme }; })));
let bad = null, n = 0;
for (let i=0;i<700 && !bad;i++){
  const r = await pg.evaluate(() => {
    const ov = document.getElementById('ov');
    if (ov && ov.classList.contains('on')){ document.getElementById('ovBtn').click(); return null; }
    const w = document.getElementById('btnWave'); if (w) w.click();
    const a = __dbg.groundAudit();
    return a.ng && a.ng.length ? { ずれ数:a.ng.length, 例:a.ng.slice(0,3), cell:a.CELL, 国:a.theme, way:a.way, wave:__dbg.way().pathLen } : null;
  });
  if (r) { bad = r; break; }
  n++;
  await pg.waitForTimeout(50);
  if (i % 31 === 0) await pg.setViewportSize({ width:393, height: (i/31)%2 ? 660 : 852 });
}
console.log(bad ? ('✗ ずれ発見\n' + JSON.stringify(bad, null, 1)) : ('✅ ' + n + '回 しらべて ずれなし'));

/* canvas の 大きさが ずれても 消しのこりが 出ないか。
   ずれたまま だと clearRect が 左上しか 消さず、古い絵が のこったまま
   新しい絵だけ 小さく 左上に えがかれる（実機で これが おきた）。
   わざと 2倍に して 赤で ぬり、つぎの フレームで 消えるかを 見る */
await pg.evaluate(() => { const c = document.querySelector('#cv canvas');
  c.width *= 2; c.height *= 2;
  const g = c.getContext('2d'); g.setTransform(1,0,0,1,0,0);
  g.fillStyle = '#ff0000'; g.fillRect(0, 0, c.width, c.height); });
await pg.waitForTimeout(500);
const red = await pg.evaluate(() => { const c = document.querySelector('#cv canvas'), g = c.getContext('2d');
  const d = g.getImageData(0,0,c.width,c.height).data; let k = 0;
  for (let i=0;i<d.length;i+=4) if (d[i]>200 && d[i+1]<60 && d[i+2]<60) k++;
  return { red:k, size:c.width+'x'+c.height }; });
console.log(red.red ? ('✗ 消しのこり ' + red.red + 'px（canvas ' + red.size + '）') : '✅ 消しのこりなし');
if (red.red) bad = bad || { 消しのこり: red };
console.log('errors', errs.slice(0,3));
await b.close();
process.exit(bad || errs.length ? 1 : 0);
