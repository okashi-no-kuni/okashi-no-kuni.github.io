/* 導入の 画面（#weOv）を 8つの 画面幅で しらべる。
 *
 *   node tools/check-welcome.mjs        # 終了コード 0 で 合格
 *
 * 見るのは この6つ。**目では 見つけられない もの だけ** を 機械にやらせる。
 *
 *   よこスクロール   ページが 画面より 広い＝どこかが はみ出している
 *   はみ出し         カードが 画面の 外（上・下・左・右）に 出ている
 *   文字の おりかえし 題・説明・📕・ボタンが 想定より 多い 行に なっている
 *   絵の たてよこ比   もとの 比から ずれている＝つぶれている
 *   ボタンの 大きさ   44px（Apple の 目やす）より 小さい タップ領域
 *   ホームバー        ボタンの 下ばしと 画面の 下の すき間
 *
 * **`?dbg=1` では 画面が 出ません**（openWelcome が false を かえす）。
 * だから セーブを 空に して、ふつうに 起動 → 表紙の「はじめる」を 押します。
 */
import { launch } from './_pw.mjs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shot = process.argv.includes('--shot');

const SIZES = [
  [320, 568], [320, 690], [375, 667], [393, 852],
  [402, 874], [430, 932], [360, 800], [412, 915],
];

/* **Linux で 測った 幅は 当てに なりません。**iPhone の 丸ゴシックは
   ここで 代わりに つかわれる フォントより 広いので、393px で 収まって
   見えても 実機では おりかえします（図鑑の 札で じっさいに そうなった）。
   だから 2周 まわして、2周目は `letter-spacing` を 足して
   **わざと 広い フォントを まねます**。+6% でも 行が ふえなければ 実機でも 安心 */
const PASSES = [
  { name: 'ふつう',       ls: 0    },
  { name: '広いフォント', ls: 0.06 },
];

const b = await launch();
let bad = 0;

console.log('画面        よこ  カード      題 説明 📕 ボタン  わくの比   ボタン  下すき間');
console.log('─'.repeat(78));

for (const pass of PASSES){
if (pass.ls) console.log('\n── ' + pass.name + '（letter-spacing +' + (pass.ls*100) + '%）' + '─'.repeat(40));
for (const [w, h] of SIZES){
  const ctx = await b.newContext({ viewport:{ width:w, height:h }, deviceScaleFactor:2, isMobile:true, hasTouch:true });
  const pg  = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('file://' + root + '/index.html');
  await pg.waitForTimeout(700);
  /* はじめての人 あつかいに してから 表紙を とじる */
  await pg.evaluate(() => { try{ localStorage.clear(); }catch(e){} });
  if (pass.ls) await pg.addStyleTag({ content:
    '#weT,#weB,#weG,#weGo{letter-spacing:' + pass.ls + 'em !important}' });
  await pg.click('#titleGo');
  await pg.waitForTimeout(900);

  const r = await pg.evaluate(() => {
    const q = s => document.querySelector(s);
    const box = s => { const e = q(s); if (!e) return null; const b = e.getBoundingClientRect();
      return { x:b.x, y:b.y, w:b.width, h:b.height, top:b.top, bottom:b.bottom, left:b.left, right:b.right }; };
    /* 行数は **Range の 行ボックスの 数**で かぞえる。
       高さ ÷ line-height だと、line-height が `normal` の ときに NaN に なる
       （ボタンで じっさいに なった）*/
    const lines = s => { const e = q(s); if (!e) return 0;
      const r = document.createRange(); r.selectNodeContents(e);
      /* **まん中の たかさで まとめる**こと。上ばしで かぞえると、
         📕 のように 大きさや ベースラインが ちがう 字が おなじ行でも
         別の 行に 見えます（じっさい 2行と 出ました）*/
      const rows = [];
      for (const b of r.getClientRects()){
        if (b.height <= 1 || b.width <= 0) continue;
        const mid = b.top + b.height / 2;
        const hit = rows.find(g => mid > g.top && mid < g.bottom);
        if (hit){ hit.top = Math.min(hit.top, b.top); hit.bottom = Math.max(hit.bottom, b.bottom); }
        else rows.push({ top: b.top, bottom: b.bottom });
      }
      return rows.length; };
    const im = q('#weArt');
    return {
      on: q('#weOv').classList.contains('on'),
      /* よこの はみ出しは **この画面（#weOv）の 中**で 見る。
         ページ全体の scrollWidth は 320px だと 2px はみ出すが、それは
         うしろの ワザバー（横スクロールする）で、前から そうなっている */
      docW: q('#weOv').scrollWidth,
      winW: window.innerWidth, winH: window.innerHeight,
      card: box('#weCard'), art: box('#weArtWrap'), btn: box('#weGo'),
      lT: lines('#weT'), lB: lines('#weB'), lG: lines('#weG'), lBtn: lines('#weGo'),
      natural: im ? im.naturalWidth / im.naturalHeight : 0,
      shown: im ? im.getBoundingClientRect().width / im.getBoundingClientRect().height : 0,
      fit: im ? getComputedStyle(im).objectFit : '',
      ovScrollH: q('#weOv').scrollHeight, ovH: q('#weOv').clientHeight,
    };
  });

  const problems = [];
  if (errs.length)              problems.push('JSエラー: ' + errs[0]);
  if (!r.on)                    problems.push('画面が 出ていない');
  if (r.docW > r.winW + 0.5)    problems.push('よこスクロール ' + (r.docW - r.winW).toFixed(1) + 'px');
  if (r.lT < 1 || r.lB < 1)     problems.push('文字が 出ていない');
  if (r.card.left < -0.5 || r.card.right > r.winW + 0.5) problems.push('カードが よこに はみ出す');
  if (r.card.top < -0.5)        problems.push('カードの 上が 切れている ' + r.card.top.toFixed(1));
  if (r.ovScrollH > r.ovH + 1)  problems.push('たてスクロール ' + (r.ovScrollH - r.ovH).toFixed(0) + 'px');
  if (r.lT !== 2)               problems.push('題が ' + r.lT + '行（2行のはず）');
  if (r.lB !== 2)               problems.push('説明が ' + r.lB + '行（2行のはず）');
  if (r.lG !== 1)               problems.push('📕の行が ' + r.lG + '行（1行のはず）');
  if (r.lBtn !== 1)             problems.push('ボタンが ' + r.lBtn + '行（1行のはず）');
  if (r.btn.h < 44)             problems.push('ボタンが ひくい ' + r.btn.h.toFixed(0) + 'px');
  if (r.btn.w < 120)            problems.push('ボタンが せまい ' + r.btn.w.toFixed(0) + 'px');
  /* 絵は 切ってよいが **ゆがめては いけない**。object-fit:cover なら 比は 保たれる */
  if (r.fit !== 'cover')        problems.push('object-fit が ' + r.fit);
  const gapB = r.winH - r.btn.bottom;
  if (gapB < 12)                problems.push('ボタンの 下が ' + gapB.toFixed(0) + 'px しかない');

  const crop = (1 - (r.art.h / (r.art.w / r.natural))) * 100;
  console.log(
      String(w + 'x' + h).padEnd(11) +
    String(r.docW).padStart(4) + '  ' +
    (r.card.w.toFixed(0) + 'x' + r.card.h.toFixed(0)).padEnd(11) +
    String(r.lT).padStart(2) + String(r.lB).padStart(4) + String(r.lG).padStart(4) +
    String(r.lBtn).padStart(5) + '   ' +
    (r.shown.toFixed(3)).padStart(6) + '  ' +
    (r.btn.w.toFixed(0) + 'x' + r.btn.h.toFixed(0)).padEnd(8) +
    gapB.toFixed(0).padStart(5) +
    (crop > 1 ? '   （絵を ' + crop.toFixed(0) + '% 切った）' : '')
  );
  if (problems.length){ bad++; problems.forEach(p => console.log('    ✗ ' + p)); }

  /* ---- タップ判定と 遷移 ----
     かざりが ボタンに かぶって いないか（pointer-events）と、
     押したら ちゃんと 画面が とじて つぎへ 進むか。
     **見た目だけ 直して 押せなく なる**のが いちばん こわい */
  if (!pass.ls){
    const hit = await pg.evaluate(() => {
      const b = document.getElementById('weGo').getBoundingClientRect();
      const at = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return at ? (at.id || at.tagName) + (at.closest('#weGo') ? ' (ボタンの中)' : ' ← ボタンの 上に 何かある') : 'なし';
    });
    if (!hit.includes('ボタンの中')) problems.push('まん中を 押すと ' + hit);
    await pg.click('#weGo');
    await pg.waitForTimeout(500);
    const after = await pg.evaluate(() => ({
      on: document.getElementById('weOv').classList.contains('on'),
      flag: !!localStorage.getItem('sweetTD.welcomed'),
      title: document.getElementById('titleOv').classList.contains('on'),
    }));
    if (after.on)    problems.push('押しても 画面が とじない');
    if (!after.flag) problems.push('2回目に また 出てしまう（旗が 立っていない）');
    if (after.title) problems.push('表紙に もどってしまった');
    if (errs.length) problems.push('とじた あとに JSエラー: ' + errs[errs.length - 1]);
  }

  if (shot && !pass.ls)
    await pg.screenshot({ path: resolve(root, 'shots/we_' + w + 'x' + h + '.png') }).catch(()=>{});
  await ctx.close();
}
}

await b.close();
console.log('─'.repeat(78));
if (bad){ console.error('✗ ' + bad + '画面で 問題が ありました'); process.exit(1); }
console.log('8画面 ぜんぶ 合格 ✅');
