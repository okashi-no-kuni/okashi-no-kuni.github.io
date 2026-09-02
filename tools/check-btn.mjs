/* ウェーブのボタンが「押せる形」で のこっているかを しらべる。
 *
 * ボーナスウェーブの あと、文字だけ「次のウェーブ」に もどして
 * disabled を 戻しわすれていた。うすいまま 押せず、カウントダウンが
 * 0の ときは **そこで ゲームが 進められなくなる**（実機の 報告）。
 *
 * 目では 見つけられない ——「次のウェーブ」と 書いてあるので、
 * ぱっと見は 正しい 画面に 見える。だから 機械で しらべる。
 *
 *   node tools/check-btn.mjs      # 終了コード 0 で 合格
 *
 * ものさしは 1つ。**「つぎに 進める」と 見せて いるのに 押せない、を 作らない。**
 * さがすのは **文言では なく `btnWave.dataset.next`**（`nextWaveBtn()` が つける）。
 * 文字と disabled は かならず 対で 動かすこと。
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
await p.waitForTimeout(1200);

const st = () => p.evaluate(() => {
  const w = document.getElementById('btnWave');
  return { text: w.textContent.trim(), off: w.disabled, next: w.dataset.next === '1' };
});
/* 「つぎに 進める」と 見せて いるのに 押せない のが だめな 形。
   **文言では なく しるし（`data-next`）で 見ること。**
   むかしは 「次のウェーブ」の 文字で さがして いましたが、
   ボタンの 文言を「次は W60」に 変えた とたん 検査が 空ぶりしました
   （2か所に 書くと ずれる、の 一例）*/
const bad = s => s.off && s.next;

const ng = [];
const look = async label => {
  const s = await st();
  if (bad(s)) ng.push(`${label}: 「${s.text}」なのに 押せない`);
  return s;
};

// 今日のプレゼントを 受け取って 盤面へ
for (let i = 0; i < 3; i++){
  if (await p.evaluate(() => ov.classList.contains('on'))){
    await p.evaluate(() => document.getElementById('ovBtn').click());
    await p.waitForTimeout(500);
  }
}
await look('はじめの 画面');

// さつえいスタジオを ひらいて ボーナスウェーブを よぶ
await p.evaluate(() => document.getElementById('btnPw').click());
await p.waitForTimeout(400);
await p.evaluate(() => { document.getElementById('pwIn').value = 'さつえいすたじお';
                         document.getElementById('pwBtn').click(); });
await p.waitForTimeout(600);
const started = await p.evaluate(() => {
  const el = document.querySelector('[data-st="bonus"]');
  if (!el) return false; el.click(); return true;
});
if (!started) ng.push('ボーナスウェーブを よび出せませんでした（スタジオの ボタンが ない）');

// おかしを 1こも とらずに 待つ → ざんねん〜 → ステージへ もどる
let back = false;
for (let i = 0; i < 14 && !back; i++){
  await p.waitForTimeout(1000);
  const s = await st();
  if (s.next){ back = true; await look('ボーナスの あと'); }
}
if (!back) ng.push('ボーナスウェーブが 終わりませんでした');

await b.close();
if (errs.length) ng.push('JSエラー: ' + errs[0]);
console.log('ウェーブのボタン');
console.log(ng.length ? '  ✗ ' + ng.join('\n  ✗ ') : '  「つぎに 進める」で 止まる ところ なし ✅');
console.log(ng.length ? '\n検査 NG（' + ng.length + '件）' : '\n検査 OK ✅');
process.exit(ng.length ? 1 : 0);
