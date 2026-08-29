/* キャラクターの 見た目を 機械で しらべる。
 *
 * 目で 200体を ぜんぶ 見ると かならず 見おとす。
 * じっさい「カンガルーの みみが 切れている」のは 目視では 通してしまい、
 * この検査を 作ってはじめて ほかに 9体 切れているのが わかった。
 * だから キャラを 足したり 形を いじったら、かならず これを かける。
 *
 * つかいかた:
 *   node tools/check-chars.mjs [しらべる HTML のパス]      （なければ index.html）
 *
 * しらべる HTML には つぎが いる:
 *   buildRoster() … キャラの 配列を かえす
 *   drawGen(g,S,rc) … 1体を えがく
 *
 * しらべること:
 *   ① JSエラーが 0件か
 *   ② わくから はみ出していないか（つの・みみ・あし・しっぽの 切れ）
 *   ③ わくに 小さすぎないか（ぽつんと して 見える）
 *   ④ まん中から ずれすぎていないか（ならべたとき 目立つ）
 *   ⑤ 名前と ID が かぶっていないか
 *   ⑥ 絵に さしかえた子が、その絵を ほんとうに つかっているか
 *
 * 直しかた: からだの 形を いじると おなじ型を つかう別の子まで くずれる。
 *           1体ごとの ずらし（dx/dy）と 大きさ（sc）で 合わせること。
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { resolve } from 'path';
import { readdirSync, existsSync } from 'fs';

const MIN_BIG = 0.55;   // わくに たいして これより 小さいと ぽつんと 見える
const MAX_OFF = 0.10;   // まん中からの ずれの ゆるせる はば

const target = resolve(process.argv[2] || 'index.html');
/* file:// で ひらくと、file:// の 画像を canvas に のせた とたん
   canvas が よごれて getImageData が SecurityError に なる。
   キャラを 画像に さしかえた 子が いるので この 旗が いる。
   本番（GitHub Pages）は http なので おきない。ここだけの 話 */
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--allow-file-access-from-files'] });
const pg = await b.newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await pg.goto('file://' + target);
await pg.waitForTimeout(1200);   // 画像に さしかえた子の よみこみを 待つ

const rep = await pg.evaluate(({ MIN_BIG, MAX_OFF }) => {
  // ゲーム本体は IIFE の中なので、window.__chk から とりだす
  const api = window.__chk || (typeof buildRoster === 'function' ? { buildRoster, drawGen } : null);
  if (!api) return { err: 'window.__chk（buildRoster / drawGen）が 見つからない' };
  const { buildRoster: roster, drawGen: draw } = api;
  const S = 300;                      // 大きめに えがいて 1ピクセル単位で しらべる
  const over = [], small = [], off = [], dupName = [], dupId = [];
  const artLost = [];   // 絵が あるのに つかわれない子
  const names = new Set(), ids = new Set();
  const R = roster();
  /* 絵が あるのに つかわれない子を さがす。
     id を 作る 規則（opt.key、なければ body）と、drawGen が 絵を ひく 規則が
     ずれると、絵を もったまま コードで えがかれる。じっさい 66体が そうだった。
     はみ出し検査は どちらで えがいても とおるので、ここで 見るしか ない */
  const artKeys = api.artKeys ? api.artKeys() : null;
  if (api.artKeyOf && api.artHas)
    for (const o of R){
      if (o.rainbow) continue;
      const idKey = (o.opt && o.opt.key) ? o.opt.key : o.body;   // buildRoster の 規則
      if (api.artHas(idKey) && api.artKeyOf(o) !== idKey) artLost.push(o.name);
    }
  /* 出ない てき。てきの見た目は 国ごとに しぼっているので、
     どの国にも 入れ わすれた子は 一生 出てこない＝あつめられない。
     ずかんに いるのに 会えない子が いると、コレクションが 完成しなくなる。
     1周（200ウェーブ）ぜんぶを たどって、1回も 出ない子を さがす */
  const enGhost = [];
  if (api.enemyLook && api.enemyKinds){
    const seen = new Set();
    const kinds = api.enemyKinds();
    const LAP = api.LAP_WAVES || 200;      // 1周＝国ひとめぐり。ぜんぶの国を 1回ずつ 通る
    for (let n = 1; n <= LAP; n++)
      for (const k of kinds)
        for (let i = 0; i < 24; i++){
          const g = api.enemyLook(k, n, i);
          if (g) seen.add(g.id);
        }
    for (const o of R)
      if (o.side === 'en' && !o.rainbow && !seen.has(o.id)) enGhost.push(o.name);
  }
  /* 出ない なかま。たまごの子は EGGS の ★の 範囲からしか 出ない。
     どの たまごにも 入らない ★の子を 作ると、ずかんに いるのに
     一生 手に 入らない。てきの「出ない てき」と 同じ 話 */
  const chGhost = [];
  if (api.eggs){
    const eggLv = new Set();
    for (const e of api.eggs()) for (const l of e.lv) eggLv.add(l);
    for (const o of R)
      if (o.side === 'ch' && !o.rainbow && !eggLv.has(o.lv)) chGhost.push(o.name + '★' + o.lv);
  }
  // アバターも おなじ ものさしで しらべる（IDは ないので 名前だけ 見る）
  const AV = api.avatarSamples ? api.avatarSamples() : [];
  const drawAv = api.drawAvatar;
  for (const a of AV) {
    const t = document.createElement('canvas'); t.width = S; t.height = S;
    const g = t.getContext('2d');
    drawAv(g, S, a);
    const d = g.getImageData(0, 0, S, S).data;
    const on = (x, y) => d[(y * S + x) * 4 + 3] > 24;
    let edge = 0;
    for (let i = 0; i < S; i++) {
      if (on(i, 0)) edge++;
      if (on(i, S - 1)) edge++;
      if (on(0, i)) edge++;
      if (on(S - 1, i)) edge++;
    }
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (on(x, y)) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const label = 'アバター' + [a.h, a.w, a.a].join('-');
    if (edge > 0) over.push(label + '(' + edge + 'px)');
    if (x1 < 0) { small.push(label + '(まっしろ)'); continue; }
    const big = Math.max(x1 - x0, y1 - y0) / S;
    if (big < MIN_BIG) small.push(label + '(' + big.toFixed(2) + ')');
    const cx = (x0 + x1) / 2 / S - 0.5, cy = (y0 + y1) / 2 / S - 0.5;
    if (Math.abs(cx) > MAX_OFF || Math.abs(cy) > MAX_OFF)
      off.push(label + '(' + cx.toFixed(2) + ',' + cy.toFixed(2) + ')');
  }
  for (const o of R) {
    if (names.has(o.name)) dupName.push(o.name); names.add(o.name);
    if (ids.has(o.id))     dupId.push(o.id);     ids.add(o.id);

    const t = document.createElement('canvas'); t.width = S; t.height = S;
    const g = t.getContext('2d');
    draw(g, S, o);                 // キラキラは わくの外に 出てよいので えがかない
    const d = g.getImageData(0, 0, S, S).data;
    const on = (x, y) => d[(y * S + x) * 4 + 3] > 24;

    let edge = 0;
    for (let i = 0; i < S; i++) {
      if (on(i, 0)) edge++;
      if (on(i, S - 1)) edge++;
      if (on(0, i)) edge++;
      if (on(S - 1, i)) edge++;
    }
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (on(x, y)) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (edge > 0) over.push(o.name + '(' + edge + 'px)');
    if (x1 < 0) { small.push(o.name + '(まっしろ)'); continue; }
    const big = Math.max(x1 - x0, y1 - y0) / S;
    if (big < MIN_BIG) small.push(o.name + '(' + big.toFixed(2) + ')');
    const cx = (x0 + x1) / 2 / S - 0.5, cy = (y0 + y1) / 2 / S - 0.5;
    if (Math.abs(cx) > MAX_OFF || Math.abs(cy) > MAX_OFF)
      off.push(o.name + '(' + cx.toFixed(2) + ',' + cy.toFixed(2) + ')');
  }
  /* たまごの わくの ならび。ふつう > 金 > にじ の 順に めずらしく なって
     いないと、遊ぶ人には わくの色が うそに なる。金の 人数を ふやすと
     GOLD_RATE が 足りなくなって ひっくり返るので、毎回 たしかめる
     （実際に にじ2人・金6人の きらきら たまごで 起きた） */
  const eggBad = [];
  for (const e of api.eggs()){
    const od = api.eggOdds(api.eggPool(e));
    const per = (a, p) => a.length ? p / a.length : null;   // 1人あたり
    const pN = per(od.norm, od.pN), pG = per(od.gold, od.pG), pL = per(od.leg, od.pL);
    const pc = x => (x * 100).toFixed(2) + '%';
    if (pN !== null && pG !== null && pG >= pN)
      eggBad.push(e.name + '[金' + pc(pG) + '≧ふつう' + pc(pN) + ']');
    if (pG !== null && pL !== null && pL >= pG)
      eggBad.push(e.name + '[にじ' + pc(pL) + '≧金' + pc(pG) + ']');
    if (pN !== null && pL !== null && pL >= pN)
      eggBad.push(e.name + '[にじ' + pc(pL) + '≧ふつう' + pc(pN) + ']');
  }
  return { artLost, enGhost, chGhost, artKeys, n: R.length, nav: AV.length, over, small, off, dupName, dupId, eggBad };
}, { MIN_BIG, MAX_OFF });
await b.close();

if (rep.err) { console.error('✗', rep.err); process.exit(1); }

/* art/sprites/ に 絵が あるのに ART_KEYS に 書きわすれると、
   だまって コードの絵の ままに なる。目では 気づけないので ここで しらべる */
const spriteDir = resolve(target, '..', 'art/sprites');
let keyMiss = [];
if (rep.artKeys && existsSync(spriteDir)){
  const have = new Set(rep.artKeys);
  keyMiss = readdirSync(spriteDir)
    .filter(n => /\.png$/i.test(n)).map(n => n.replace(/\.png$/i, ''))
    .filter(k => !have.has(k));
}

const line = (label, arr) =>
  console.log(('  ' + label).padEnd(16),
    arr.length ? '✗ ' + arr.length + '件  ' + arr.join(' ') : 'なし ✅');

console.log('キャラ数:', rep.n, '＋ アバター見本', rep.nav);
line('JSエラー',   errs.slice(0, 5));
line('はみ出し',   rep.over);
line('小さすぎ',   rep.small);
line('中心ずれ',   rep.off);
line('名前かぶり', rep.dupName);
line('IDかぶり',   rep.dupId);
line('絵の とりこぼし', [...(rep.artLost || []), ...keyMiss.map(k => k + '(ART_KEYSに無い)')]);
line('出ない てき', rep.enGhost || []);
line('出ない なかま', rep.chGhost || []);
line('たまごの ならび', rep.eggBad || []);

// 中心ずれは 形によっては しかたないので、止めるのは 残りだけ
const ng = errs.length + rep.over.length + rep.small.length + rep.dupName.length
         + rep.dupId.length + (rep.artLost || []).length + (rep.enGhost || []).length
         + (rep.chGhost || []).length + keyMiss.length + (rep.eggBad || []).length;
console.log(ng ? '\n検査 NG（' + ng + '件）' : '\n検査 OK ✅');
process.exit(ng ? 1 : 0);
