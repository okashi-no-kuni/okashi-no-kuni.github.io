/* 予告の「黒い影」が いつ とぶかを しらべる。
 *
 * ゲームを 始めた とたん、右から 黒い影が よこぎる——という 報告が
 * 3回 あった（実機）。正体は 伝説の 予告の シルエットで、条件が
 * 「wave >= つぎの伝説.wave - 15」だった。1体目が ウェーブ60の ころは
 * W45からで よかったが、12国に そろえて **1体目が W15に なった とたん
 * W0 から** 条件が 立ち、ウェーブ0から 22〜40秒ごとに とんでいた。
 *
 *   node tools/check-flyer.mjs      # 終了コード 0 で 合格
 *
 * ものさしは 3つ。
 *   ① ウェーブ6より前で 影を とばさない（始めた とたんに 出さない）
 *   ② その伝説が 来る 直前には ちゃんと 出す（期待を さそう ため）
 *   ③ 通りすぎた あとは 出さない（3回 まけて つかい切ったら
 *      その周では もう 出てこないのに、影だけ とびつづける）
 *
 * 目では 見つけられない ——影は「そういう 演出」に 見えるので、
 * 早すぎるのか どうかが 分からない。だから 機械で しらべる。
 */
import { launch } from './_pw.mjs';
import { resolve } from 'path';

const FILE = resolve(process.argv[2] || 'index.html');
const b = await launch();
const c = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 });
const p = await c.newPage();
const errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.goto('file://' + FILE + '?dbg=1');
await p.waitForTimeout(1400);

const W1 = await p.evaluate(() => window.__dbg.legendWaves
  ? window.__dbg.legendWaves()[0] : 15);

/* まっさら（伝説を 1体も 持っていない）の ときの 各ウェーブ */
const sil = await p.evaluate(max => {
  const out = [];
  for (let w = 0; w <= max; w++){
    window.__dbg.setWave(w);
    out.push(window.__dbg.flyerTest() !== 'なし');
  }
  return out;
}, W1 + 20);

const ng = [];
// ① 早すぎ
const early = sil.slice(0, 6).map((v, i) => v ? i : -1).filter(i => i >= 0);
if (early.length) ng.push('ウェーブ ' + early.join(',') + ' で 影が とぶ（6より前）');
// ② 直前には 出る
if (!sil[W1 - 1] || !sil[W1]) ng.push('ウェーブ' + W1 + 'の 直前に 影が とばない');
// ③ 通りすぎたら 出ない
const late = sil.slice(W1 + 1).map((v, i) => v ? W1 + 1 + i : -1).filter(i => i >= 0);
if (late.length) ng.push('ウェーブ ' + late.slice(0, 5).join(',') + ' … 通りすぎても 影が とぶ');

const on = sil.map((v, i) => v ? i : -1).filter(i => i >= 0);
console.log('1体目の 伝説: ウェーブ' + W1);
console.log('影が とぶ ウェーブ: ' + (on.length ? on.join(', ') : 'なし'));
if (errs.length) ng.push('JSエラー: ' + errs.slice(0, 3).join(' / '));
console.log(ng.length ? '\n検査 NG\n  ' + ng.join('\n  ') : '\n検査 OK ✅');
await b.close();
process.exit(ng.length ? 1 : 0);
