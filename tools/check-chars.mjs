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
import { launch } from './_pw.mjs';
import { resolve } from 'path';
import { readdirSync, existsSync, readFileSync } from 'fs';

const MIN_BIG = 0.55;   // わくに たいして これより 小さいと ぽつんと 見える
const MAX_OFF = 0.10;   // まん中からの ずれの ゆるせる はば

const target = resolve(process.argv[2] || 'index.html');
/* file:// で ひらくと、file:// の 画像を canvas に のせた とたん
   canvas が よごれて getImageData が SecurityError に なる。
   キャラを 画像に さしかえた 子が いるので この 旗が いる。
   本番（GitHub Pages）は http なので おきない。ここだけの 話 */
const b = await launch({ args: ['--allow-file-access-from-files'] });
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
  const duelBg = api.duelBg ? api.duelBg() : null;
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
  return { artLost, enGhost, chGhost, artKeys, duelBg, n: R.length, nav: AV.length, over, small, off, dupName, dupId, eggBad };
}, { MIN_BIG, MAX_OFF });
await b.close();

if (rep.err) { console.error('✗', rep.err); process.exit(1); }

/* art/sprites/ に 絵が あるのに ART_KEYS に 書きわすれると、
   だまって コードの絵の ままに なる。目では 気づけないので ここで しらべる */

/* ただし **キャラでは ない 絵**も art/sprites/ に 入る。
   画面の かざりに つかう ぶんで、CREATURES にも 図鑑にも いない。
   ここに 書いておかないと「ART_KEYS に 無い」と 毎回 おこられる。
   絵を 足したら、キャラなら ART_KEYS に、画面用なら こちらに 足すこと */
const SCREEN_ART = new Set([
  'witch_fly',   // 「おかえりなさい」の 画面で ほうきに のって いる まじょ
]);

const spriteDir = resolve(target, '..', 'art/sprites');
let keyMiss = [];
if (rep.artKeys && existsSync(spriteDir)){
  const have = new Set(rep.artKeys);
  keyMiss = readdirSync(spriteDir)
    .filter(n => /\.png$/i.test(n)).map(n => n.replace(/\.png$/i, ''))
    .filter(k => !have.has(k) && !SCREEN_ART.has(k));
}

/* たいけつの 背景が 12国ぜんぶ そろっているか。
   1つ 抜けると **その国だけ よその国の 絵**が 出る ——
   絵は ちゃんと 出るので 目では 気づけない */
let bgMiss = [];
if (rep.duelBg){
  const dir = resolve(target, '..', 'art/screens');
  bgMiss = rep.duelBg
    .filter(r => !r.絵 || !existsSync(resolve(dir, r.絵 + '.webp')))
    .map(r => r.国 + (r.絵 ? '(' + r.絵 + '.webp が ない)' : '(DUEL_BG に 無い)'));
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
line('たいけつの背景', bgMiss);

/* ---------- Phase 6-6 ——unlock() に origin を わたし忘れて いないか ----------
   `unlock(id)` と 2つめを 書かずに 呼ぶと、その子は だまって
   `unknown` に なります。**目でも 実行しても 見つかりません**
   ——図鑑には ふつうに 入るので、画面は 何も おかしく ならない。
   だから ソースを そのまま 読んで 数えます。

   `giveItem` / `eggDraw` も 中で unlock を 呼ぶ ヘルパなので、
   おなじく 引数で origin を 受けとって いるか 見ます */
const src = readFileSync(target, 'utf8');
let strip;
const originMiss = [];
{
  const known = new Set((src.match(/^const ORIGIN = Object\.freeze\(\{[\s\S]*?^\}\);/m) || [''])[0]
                  .match(/^\s{2}(\w+):/gm)?.map(x => x.trim().replace(':','')) || []);
  /* **コメントを 先に 消すこと。**「行あたまが * か //」で よけると、
     ブロックコメントの 途中の 行（`\`unlock()\` の 中で…`）が すりぬけて
     「origin無し」と 出ます（じっさい 出た）。行数は 変えたくないので、
     消したところは 改行だけ のこす */
  strip = t => t.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
                      .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length));
  const lines = strip(src).split('\n');
  lines.forEach((ln, i) => {
    /* **Phase 7-4**：入手経路は `gainSpecies()` を とおるように なったので、
       そちらも 見る。ここを 足しわすれると、入手経路で origin を
       書きわすれても だまって `unknown` に なります */
    for (const m of ln.matchAll(/\b(?:unlock|gainSpecies)\(([^)]*)\)/g)){
      const args = m[1];
      if (/^\s*(id|sp)\s*,\s*origin\s*$/.test(args)) continue;   // 定義そのもの・そのまま 通すだけ
      const parts = args.split(',');
      if (parts.length < 2){ originMiss.push('L' + (i+1) + ':origin無し'); continue; }
      const o = parts[parts.length - 1].trim();
      if (o === 'origin') continue;                                // ヘルパが 通す
      const mm = o.match(/^ORIGIN\.(\w+)$/);
      if (!mm) originMiss.push('L' + (i+1) + ':' + o);
      else if (!known.has(mm[1])) originMiss.push('L' + (i+1) + ':ORIGIN.' + mm[1] + 'は無い');
    }
  });
  // 中で unlock を 呼ぶ ヘルパは、origin を 引数で 受けとる こと
  for (const fn of ['eggDraw', 'giveItem'])
    if (!new RegExp('function ' + fn + '\\([^)]*\\borigin\\b').test(src))
      originMiss.push(fn + 'が originを 受けとって いない');
}
line('unlockの origin', originMiss);

/* ---------- Phase 7-1 ——`dex[` の 直読みが 新しく ふえて いないか ----------
   所持判定は `hasDex()` / レコードは `dexRec()` に 寄せて あります。
   直読みが また ふえると、7-2 以降で 個体テーブルを 足した ときに
   **そこだけ 取りのこされます**。しかも `dex[id] = [...]` の ような
   形に した とき `!![]` は true なので、「0体 持って いる」が
   「持って いる」と 読まれて **だまって こわれます**。

   のこして よいのは 4つ だけ ——accessor じしん／書きこみ／
   引っこし（migration）／検査どうぐ。それ以外は 落とします */
const dexRaw = [];
{
  const KEEP = new Set([
    // accessor じしん
    'function hasDex(id){ return !!dex[id]; }',
    'function dexRec(id){ return dex[id] || null; }',
    // 引っこし・補正（目的が ちがうので 寄せない）
    "for (const id of old) if (CHARS.some(c => c.id === id) && !dex['ch_'+id]) dex['ch_'+id] = {};",
    'if (!dex[real]) dex[real] = dex[k];',
    'delete dex[k]; dirty = true;',
    "const e = dex['lg_' + L.id];",
  ]);
  const isWrite = ln => /\bdex\[[^\]]+\](\.\w+)?\s*=[^=]/.test(ln) || /\bdelete\s+dex\[/.test(ln);
  const inDbg = i => i > dbgFrom;
  const lines = strip(src).split('\n');
  const dbgAt = lines.findIndex(l => l.includes('window.__dbg = {'));
  var dbgFrom = dbgAt < 0 ? Infinity : dbgAt;
  lines.forEach((ln, i) => {
    if (!ln.includes('dex[')) return;
    const t = ln.trim();
    if (KEEP.has(t) || isWrite(ln) || inDbg(i)) return;
    dexRaw.push('L' + (i+1) + ':' + t.slice(0, 46));
  });
}
line('dexの 直読み', dexRaw);

/* ---------- Phase 7-2 ——`inst` を ゲームの ロジックから 見て いないか ----------
   7-2 で 作ったのは **からの 箱だけ**です。ふつうに あそんで 1件も
   できない ことが いちばん 大事な 条件なので、**参照そのものを
   見はります**。のこして よいのは 箱の 定義と 検査どうぐ だけ。

   `inst` は みじかい 名前なので、`instance` や `instagram` を
   ひろわない ように 語の 切れめで さがします */
const instRef = [];
{
  /* 7-3 で `ensureInst` / `instOfSpecies` が ふえました。
     ゆるすのは 基盤・ensure・検査どうぐ の 3つ だけ */
  const NAMES = ['inst', 'instPfx', 'instSeq', 'saveInst', 'instDevice', 'newInstId', 'INST_V',
                 'ensureInst', 'instOfSpecies', 'mintInst', 'instOriginOf', 'instEvoOf'];
  const re = new RegExp('\\b(' + NAMES.join('|') + ')\\b');
  const lines = strip(src).split('\n');
  const defFrom = lines.findIndex(l => l.includes('const INST_V = 1;'));
  /* 基盤（7-2）・ensure（7-3）・mint（7-4）は ひとつづきの ブロック。
     `return { id, sp };` は ensure と mint の **2か所**に 出るので、
     **さいごの ほう**で 見ること（先頭で 見ると mint の 中みが 落ちます）*/
  const defTo   = lines.reduce((a, l, i) => l.includes('return { id, sp') ? i : a, -1);
  /* `gainSpecies`（7-4 の 入口）は `unlock` の となりに 置いて あるので
     べつの ゆるし ぶんとして 見る */
  const gsFrom  = lines.findIndex(l => l.includes('function gainSpecies(sp, origin){'));
  const gsTo    = gsFrom < 0 ? -1 : gsFrom + lines.slice(gsFrom).findIndex(l => l.includes('return isNew;'));
  const chkAt   = lines.findIndex(l => l.includes('window.__chk = {'));
  lines.forEach((ln, i) => {
    if (!re.test(ln)) return;
    if (defFrom >= 0 && i >= defFrom && i <= defTo + 1) return;   // 箱の 定義そのもの
    if (gsFrom >= 0 && i >= gsFrom && i <= gsTo) return;          // gainSpecies の 中み
    if (chkAt >= 0 && i > chkAt) return;                          // __chk / __dbg（検査どうぐ）
    instRef.push('L' + (i+1) + ':' + ln.trim().slice(0, 46));
  });
  if (defFrom < 0 || defTo < 0) instRef.push('個体の 箱の 定義が 見つからない');
  if (gsFrom < 0 || gsTo < gsFrom) instRef.push('gainSpecies の 定義が 見つからない');
}
line('instの 参照', instRef);

/* ---------- Phase 7-5 ——`MINT_MULTI` に いまの 経路が 入って いないか ----------
   複数所持を ゆるす ところは ここ 1か所 だけ です。**いまの 12経路を
   入れると 個体が 大量に ふえます**（W250 までで 敵は 8,889体）。
   足して よいのは、個体を くばる ことが 目的の 新しい 経路
   （event / birthday / trade など）だけ */
const multiBad = [];
{
  const NOW = ['starter','egg','stage','duel','legend','battle',
               'drop','place','shard','login','shop','debug'];
  const m = strip(src).match(/const MINT_MULTI = new Set\(\[([\s\S]*?)\]\)/);
  if (!m) multiBad.push('MINT_MULTI の 定義が 見つからない');
  else for (const x of m[1].matchAll(/(?:ORIGIN\.(\w+)|'([^']*)'|"([^"]*)")/g)){
    const v = x[1] || x[2] || x[3];
    if (NOW.includes(v)) multiBad.push(v + 'は いまの 経路（入れては いけない）');
  }
}
line('MINT_MULTI', multiBad);

/* ---------- Phase 7-7-2 ——絵の resolver が 個体を のぞいて いないか ----------
   `artKeyFor(rc, evo)` は **純関数**です。えがく 関数が こっそり 個体を
   さがしに 行くと、複数所持が 開いた ときに「どちらの 個体の 絵か」を
   決める ところが えがく 関数の 中に できて しまいます。

   それと、**ゲームの ほうから evo を わたして いない**ことも 見ます
   ——7-7-2 では 本番プレイは 全員 base art の ままです */
const artEvo = [];
{
  const lines = strip(src).split('\n');
  const chkAt = lines.findIndex(l => l.includes('window.__chk = {'));
  const from  = lines.findIndex(l => l.includes('function artKeyFor(rc, evo){'));
  const to    = from < 0 ? -1 : from + lines.slice(from).findIndex(l => l.includes('return ART_SPRITE[k] ? k : base;'));
  if (from < 0 || to < from) artEvo.push('artKeyFor の 定義が 見つからない');
  else for (let i = from; i <= to; i++)
    if (/\b(inst|instEvoOf|instOfSpecies|dex|dexRec)\b/.test(lines[i]))
      artEvo.push('L' + (i+1) + ':resolver が 個体/dex を のぞいて いる');
  /* ゲームの ほうから evo を わたして いないか（検査どうぐは のぞく）*/
  lines.forEach((ln, i) => {
    if (chkAt >= 0 && i > chkAt) return;
    for (const [fn, n] of [['drawGen', 3], ['genSprite', 2], ['rbSprite', 3]]){
      const re = new RegExp('(?<![\\w.])' + fn + '\\(([^()]*)\\)', 'g');
      for (const m of ln.matchAll(re)){
        const a = m[1].trim();
        if (!a) continue;
        const args = a.split(',').map(x => x.trim());
        if (args.length <= n) continue;                       // evo を わたして いない
        /* **さいごが ただの `evo` なら 通す。**それは 定義そのものか、
           resolver どうしの 受けわたし（`genSprite` → `drawGen`）です。
           ゲームが ほんとうに わたす ときは 値か 呼び出しに なるので 落ちます。
           `instEvoOf(...)` を 書いた 場合は「instの 参照」の ほうが 落とします */
        if (args[args.length - 1] === 'evo') continue;
        artEvo.push('L' + (i+1) + ':' + fn + ' に evo を わたして いる（' + args[args.length-1] + '）');
      }
    }
  });
}
line('絵の resolver', artEvo);

/* ---------- Phase 7-7-3-1 ——戦闘用の 集合を つかうべき ところ ----------
   `ITEMS` は 9つの 入口を かねて います。「戦闘で つかえるか」を
   意味する ところに 生の `ITEMS` が のこって いると、戦闘で つかえない
   アイテムを 足した とたん **ワザバーに 出て、💎の 商品の 中みも
   変わります**（有料商品の 事故）。

   **ぜんぶ 禁止には しません。**`gear` の 保存・`ITEM_BY_ID`・図鑑・
   ガイド・ドロップの pool は `ITEMS` の ままが 正しい ——
   「戦闘で つかえるか」と「ドロップして よいか」は 別の 仕様です */
const battleRaw = [];
{
  const lines = strip(src).split('\n');
  /* 「ここは 戦闘用の 集合で なければ いけない」ところを、
     行の 目じるしで さがす。目じるしが 見つからない ときも 落とす
     （書きかえた のに 検査だけ 素通り、を 作らない）*/
  const SITES = [
    ['ワザバー',        'if (gear[it.id] < 1) continue;', -1],
    ['ショップ おたすけ', "giveItem(it.id, 1, ORIGIN.shop)", 0],
    ['ショップ にじいろ', "giveItem(it.id, 3, ORIGIN.shop)", 0],
    ['セットの 説明1',   "6しゅるい ×1こずつ", 0],
    ['セットの 説明3',   "6しゅるい ×3こずつ", 0],
  ];
  for (const [name, mark, off] of SITES){
    const i = lines.findIndex(l => l.includes(mark));
    if (i < 0){ battleRaw.push(name + 'の 目じるしが 見つからない'); continue; }
    const ln = lines[i + off];
    if (!/\bBATTLE_ITEMS\b/.test(ln))
      battleRaw.push(name + ' L' + (i + off + 1) + ':生の ITEMS が のこって いる');
  }
  /* `useItem` の 入口にも しきりが いる */
  if (!/function useItem\(it\)\{[\s\S]{0,400}?isBattleItem\(it\)/.test(strip(src).replace(/\s*\n\s*/g, m => m.includes('\n') ? '\n' : m)))
    if (!/if \(!isBattleItem\(it\)\) return;/.test(strip(src)))
      battleRaw.push('useItem に しきりが ない');
  /* **しきりの 決めかた**も 見る。`evo` は「進化の アイテム」、
     `battle` は「戦闘で つかえるか」で **意味が ちがいます**。
     `!it.evo` に すると、進化では ないけれど 戦闘で つかえない ものを
     足した ときに 表せなく なります */
  const def = (strip(src).match(/const BATTLE_ITEMS = [^;]*/) || [''])[0];
  if (!/isBattleItem/.test(def)) battleRaw.push('BATTLE_ITEMS が isBattleItem で 決まって いない：' + def.slice(0,60));
  const pred = (strip(src).match(/const isBattleItem = [^;]*/) || [''])[0];
  if (!/battle\s*!==\s*false/.test(pred)) battleRaw.push('isBattleItem が「未指定＝戦闘用」に なって いない：' + pred.slice(0,60));
  if (/\bevo\b/.test(def) || /\bevo\b/.test(pred)) battleRaw.push('しきりが evo で 決まって いる（意味が ちがう）');
  /* 未指定＝戦闘用。既存に battle:true を ばらまいて いないか */
  const t = (strip(src).match(/battle:\s*true/g) || []).length;
  if (t) battleRaw.push('battle:true が ' + t + '件（未指定＝戦闘用に すること）');
}
line('戦闘用の 集合', battleRaw);

// 中心ずれは 形によっては しかたないので、止めるのは 残りだけ
const ng = errs.length + rep.over.length + rep.small.length + rep.dupName.length
         + rep.dupId.length + (rep.artLost || []).length + (rep.enGhost || []).length
         + (rep.chGhost || []).length + keyMiss.length + (rep.eggBad || []).length
         + bgMiss.length + originMiss.length + dexRaw.length + instRef.length + multiBad.length + artEvo.length + battleRaw.length;
console.log(ng ? '\n検査 NG（' + ng + '件）' : '\n検査 OK ✅');
process.exit(ng ? 1 : 0);
