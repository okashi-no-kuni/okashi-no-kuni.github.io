/* おかしのブロックパズル（puzzle.html）を 機械で しらべる。
 *
 *   node tools/check-puzzle.mjs      # 終了コード 0 で 合格
 *
 * 目では 見つけられない ものを 6つ 見る。
 *
 *   ① JSエラー          … えがいている とちゅうの 例外
 *   ② はみ出し          … 4つの 画面はばで、ボタンが 画面の 外に 出ていないか
 *   ③ きまりごと        … 3つ そろえば 消える／1れつ そろえば 消える／
 *                          大きく はじけると とくべつな おかしが うまれる／連さする
 *   ④ **終わりが 来るか** … これが いちばん だいじ。はじけさせて 場所を
 *                          作れる ゲームなので、作りかたを まちがえると
 *                          **一生 終わらない**（＝手ごたえが 消える）。
 *                          じっさいに 最後まで あそんで たしかめる
 *   ⑤ 指の 入力          … トレイから 盤面へ ドラッグして 置けるか。
 *                          Phaser の 座標は ずれることが あるので 実際に さわる
 *   ⑥ fps               … こま落ちしていないか
 */
import { launch } from './_pw.mjs';
import { resolve } from 'path';
import { mkdirSync } from 'fs';

const FILE = 'file://' + resolve(process.argv[2] || 'puzzle.html') + '?dbg=1';
const ng = [], note = [];
const b = await launch();

/* ---------- ① ② 4つの 画面はばで ひらく ---------- */
const SIZES = [[320,568],[375,667],[393,852],[430,932]];
for (const [w,h] of SIZES){
  const c = await b.newContext({ viewport:{ width:w, height:h }, deviceScaleFactor:2, isMobile:true, hasTouch:true });
  const p = await c.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto(FILE);
  await p.waitForTimeout(900);
  if (errs.length) ng.push(`${w}x${h}: JSエラー ${errs.length}件 — ${errs[0]}`);

  const m = await p.evaluate(() => {
    const ctrl = document.getElementById('ctrl').getBoundingClientRect();
    const cv   = document.querySelector('#cv canvas');
    return {
      over: Math.round(document.documentElement.scrollHeight - window.innerHeight),
      wide: Math.round(document.documentElement.scrollWidth - window.innerWidth),
      gap:  Math.round(window.innerHeight - ctrl.bottom),
      cw:   cv ? cv.getBoundingClientRect().width : 0,
      ch:   cv ? cv.getBoundingClientRect().height : 0,
      st:   !!(window.__pz),
    };
  });
  if (!m.st) ng.push(`${w}x${h}: __pz が 出ていない（?dbg=1 が きいていない）`);
  if (m.over > 2)  ng.push(`${w}x${h}: たてに ${m.over}px はみ出している`);
  if (m.wide > 2)  ng.push(`${w}x${h}: よこに ${m.wide}px はみ出している`);
  if (m.gap < 18)  ng.push(`${w}x${h}: ボタンの 下が ${m.gap}px しか ない（ホームバーに かかる）`);
  if (m.cw < 200)  ng.push(`${w}x${h}: 盤面が ${Math.round(m.cw)}px しか ない`);
  note.push(`  ${w}x${h}: 盤面 ${Math.round(m.cw)}x${Math.round(m.ch)} / 下のすき間 ${m.gap}px`);
  await c.close();
}

/* ---------- ここから 先は 1つの 画面で ---------- */
const c = await b.newContext({ viewport:{ width:393, height:852 }, deviceScaleFactor:2, isMobile:true, hasTouch:true });
const p = await c.newPage();
const errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.goto(FILE);
await p.waitForTimeout(700);

/* ---------- ③ きまりごと ---------- */
// 3つ そろったら 消える
let r3 = await p.evaluate(() => {
  __pz.reset();
  __pz.setBoard(['000.....']);
  const before = __pz.state().cells.filter(v => v >= 0).length;
  __pz.blastAt(0);
  return { before, after: __pz.state().cells.filter(v => v >= 0).length, score: __pz.state().score };
});
if (r3.before !== 3 || r3.after !== 0) ng.push(`3こ そろえても 消えない（${r3.before}→${r3.after}）`);
if (r3.score <= 0) ng.push('はじけたのに 点が 入らない');

// 2つでは 消えない
const r2 = await p.evaluate(() => {
  __pz.reset(); __pz.setBoard(['00......']);
  __pz.blastAt(0);
  return __pz.state().cells.filter(v => v >= 0).length;
});
if (r2 !== 2) ng.push(`2こしか ないのに 消えた（のこり ${r2}）`);

// 1れつ そろったら 消える
const rl = await p.evaluate(() => {
  __pz.reset();
  __pz.setBoard(['','','','','','','','0123401.']);   // 右はしの 1ますだけ あける
  __pz.giveShape(0, 2);                                 // 1x1
  const ok = __pz.put(0, 7, 7);
  return { ok, left: __pz.state().cells.filter(v => v >= 0).length };
});
if (!rl.ok)      ng.push('1ますの ブロックが 置けない');
if (rl.left > 0) ng.push(`1れつ そろったのに 消えない（のこり ${rl.left}）`);

// 大きく はじけさせると とくべつな おかしが うまれる
const rs = await p.evaluate(() => {
  const out = {};
  for (const [n, want] of [[5,'ロケット'],[7,'ばくだん'],[9,'にじのアメ']]){
    __pz.reset();
    /* 左うえから じゅんに n こ ならべる（8こを こえたら 次の行へ）*/
    const rows = [];
    for (let i=0;i<n;i++){
      const r = i >> 3, c = i & 7;
      rows[r] = (rows[r] || '') + '0';
      if (c === 7) rows[r] = rows[r];
    }
    __pz.setBoard(rows);
    __pz.blastAt(0);
    const st = __pz.state();
    out[n] = { sp: st.spec[0], cells: st.cells.filter(v => v >= 0).length };
  }
  return out;
});
if (rs[5].sp !== 1 && rs[5].sp !== 2) ng.push('5こ はじけさせても ロケットが うまれない');
if (rs[7].sp !== 3) ng.push('7こ はじけさせても ばくだんが うまれない');
if (rs[9] && rs[9].sp !== 4) ng.push('9こ はじけさせても にじのアメが うまれない');

// とくべつな おかしは タップで はたらき、つながって はじける（連さ）
const rc = await p.evaluate(() => {
  __pz.reset();
  __pz.setBoard(['00000000','11111111','22222222']);   // 3れつ ぶん
  __pz.blastAt(0);                                     // 8こ → ばくだん が 0 に できる
  const sp = __pz.state().spec[0];
  __pz.blastAt(0);                                     // つかう
  return { sp, left: __pz.state().cells.filter(v => v >= 0).length };
});
if (rc.sp === 0) ng.push('8こ はじけさせても とくべつな おかしが うまれない');
if (rc.left >= 16) ng.push(`とくべつな おかしを つかっても 消えていない（のこり ${rc.left}）`);

/* ---------- ④ 終わりが 来るか（いちばん だいじ）---------- */
async function playOut(blastWhenStuckOnly){
  return p.evaluate(async only => {
    __pz.reset();
    let acts = 0, blasts = 0, puts = 0;
    for (; acts < 4000; acts++){
      if (__pz.state().over) break;
      let did = false;
      if (!only && __pz.anyBlast() && Math.random() < .5){ did = __pz.autoBlast(); if (did) blasts++; }
      if (!did) for (let n=0;n<3;n++) if (__pz.autoPut(n)){ did = true; puts++; break; }
      if (!did && __pz.anyBlast()){ did = __pz.autoBlast(); blasts++; }
      if (!did) break;
    }
    const s = __pz.state();
    return { acts, puts, blasts, over:s.over, score:s.score };
  }, blastWhenStuckOnly);
}
/* おしまいに なった とき、**ほんとうに 手が 無いか**を たしかめる。
   「おけない」だけで 終わらせると、はじけば まだ 場所を 作れるのに
   取り上げる ことに なる（画面を 見ても それは わからない）*/
async function checkEndIsReal(){
  return p.evaluate(() => {
    const s = __pz.state();
    if (!s.over) return null;
    return { canMove: __pz.canMove(), canBlast: __pz.anyBlast() };
  });
}
const g1 = await playOut(true);    // つまったら はじく（ふつうの あそびかた）
{
  const e = await checkEndIsReal();
  if (e && (e.canMove || e.canBlast))
    ng.push(`おしまいに なったのに まだ 手が ある（おける ${e.canMove} / はじける ${e.canBlast}）`);
}
const g2 = await playOut(false);   // 見つけしだい はじく（いちばん ねばる）
for (const [nm, g] of [['つまったら はじく', g1], ['見つけしだい はじく', g2]]){
  if (!g.over) ng.push(`${nm}：${g.acts}手 うっても 終わらない（＝一生 終わらない）`);
  note.push(`  ${nm}: ${g.acts}手（おく ${g.puts} / はじく ${g.blasts}）でおしまい・${g.score}点`);
}
if (g1.over && g1.acts < 12) ng.push(`すぐ 終わりすぎ（${g1.acts}手）`);

/* ---------- ⑤ 指の 入力（トレイ → 盤面）---------- */
const drag = await p.evaluate(() => { __pz.reset(); return __pz.state(); });
const box = await p.evaluate(() => {
  const r = document.querySelector('#cv canvas').getBoundingClientRect();
  return { x:r.left, y:r.top, w:r.width, h:r.height };
});
const k = box.w / drag.W;                    // 見た目と 中みの ひりつ
const from = { x: box.x + (drag.W/6) * k, y: box.y + (drag.TRAY_Y + drag.TRAY_H/2) * k };
const to   = { x: box.x + (drag.CELL*2.5) * k, y: box.y + (drag.CELL*4.2) * k };
await p.mouse.move(from.x, from.y);
await p.mouse.down();
await p.mouse.move(to.x, to.y, { steps: 12 });
await p.mouse.up();
await p.waitForTimeout(200);
const put = await p.evaluate(() => __pz.state().cells.filter(v => v >= 0).length);
if (put === 0) ng.push('ドラッグしても 盤面に 置けない（さわった ところが ずれている）');

/* ---------- ⑥ fps ---------- */
const fps = await p.evaluate(() => new Promise(res => {
  let n = 0; const t0 = performance.now();
  const tick = () => { n++; if (performance.now() - t0 < 1500) requestAnimationFrame(tick);
                       else res(Math.round(n / ((performance.now()-t0)/1000))); };
  requestAnimationFrame(tick);
}));
note.push(`  fps: ${fps}`);
if (fps < 40) ng.push(`こま落ち（${fps}fps）`);

if (errs.length) ng.push(`JSエラー ${errs.length}件 — ${errs[0]}`);

/* ---------- ⑦ ちいさい 画面で カードの 上が 切れないか ----------
   margin:auto を align-items:center に すると、カードが 画面より 高い とき
   **上が 切れて スクロールしても 出てこない**。目では 気づきにくい */
{
  const c2 = await b.newContext({ viewport:{ width:320, height:568 }, deviceScaleFactor:2, isMobile:true, hasTouch:true });
  const p2 = await c2.newPage();
  await p2.goto(FILE);
  await p2.waitForTimeout(700);
  for (const [btn, ovId, nm] of [['btnHelp','helpOv','あそびかた']]){
    await p2.evaluate(id => document.getElementById(id).click(), btn);
    await p2.waitForTimeout(250);
    const m = await p2.evaluate(id => {
      const ov = document.getElementById(id), cd = ov.querySelector('.cd');
      ov.scrollTop = 0;
      const r = cd.getBoundingClientRect();
      return { top:Math.round(r.top), bottom:Math.round(r.bottom), h:Math.round(r.height),
               scroll: ov.scrollHeight > ov.clientHeight, vh:window.innerHeight };
    }, ovId);
    if (m.top < -1) ng.push(`320x568 の ${nm}：カードの 上が ${-m.top}px 切れている`);
    if (m.bottom > m.vh + 1 && !m.scroll)
      ng.push(`320x568 の ${nm}：下が ${m.bottom - m.vh}px はみ出したまま スクロールできない`);
    note.push(`  320x568 の ${nm}: たかさ ${m.h}px（画面 ${m.vh}px・スクロール ${m.scroll ? 'あり' : 'なし'}）`);
  }
  await c2.close();
}

/* ---------- しゃしん ---------- */
await p.evaluate(() => {
  __pz.reset();
  __pz.setBoard(['..000...','.0110...','.1122...','..2334..','...344..','........','........','........']);
  __pz.blastAt(2 + 8*1);
});
await p.waitForTimeout(120);
/* しゃしんは tools/out/（.gitignore に 入っている）へ。
   リポジトリに 画像を ためない */
mkdirSync('tools/out', { recursive: true });
await p.screenshot({ path: 'tools/out/puzzle.png' });

await b.close();
console.log(note.join('\n'));
if (ng.length){
  console.error('\n✗ ' + ng.length + '件\n' + ng.map(s => '  - ' + s).join('\n'));
  process.exit(1);
}
console.log('\n✓ ぜんぶ 合格');
