/* 個体の 進化を 書きこむ ゆいいつの 口（`evolveInst`）を しらべる。
 *
 *   node tools/check-inst-evo.mjs      # 終了コード 0 で 合格
 *
 * ものさしは 3つ。
 *   ① `null → e1` だけ 通す（ゆるされた 進化IDの あつまり・不可逆）
 *   ② **`dex` を 見ない**（種の 状態と 個体の 状態を また 混ぜて いない）
 *   ③ **本番から 呼ぶ ところが 0か所**（UI も 消費も まだ つないで いない）
 *
 * ②は ふつうの 場面では 見わけが つきません ——1種1個体の あいだは
 * どちらも 同じ こたえに 見えるので、**`dex` には 進化らしい 値が あって
 * 個体には 無い**形を わざと 作って ためします（7-6・7-7-1 と 同じ手）。
 */
import { launch } from './_pw.mjs';
import { resolve } from 'path';
import { readFileSync } from 'fs';

const target = resolve(process.argv[2] || 'index.html');
const src = readFileSync(target, 'utf8');
const bad = [], errs = [];

/* ---------- ソース ——writer が よその 軸に 手を のばして いないか ---------- */
{
  /* コメントを 先に 消す。ブロックコメントの 中の 語を ひろって
     しまうと、ずっと 落ちつづけます（check-chars で 一度 やった 失敗）*/
  const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
                      .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + ' ');
  const body = strip(src);
  const fn = (body.match(/function evolveInst\([\s\S]*?\n\}/) || [''])[0];
  if (!fn) bad.push('evolveInst が ない');
  else for (const [re, why] of [[/\bgear\b/, 'gear（在庫）'],
                                [/ITEM_BY_ID/, "ITEM_BY_ID（'evolve' を 持って いるか）"],
                                [/instOfSpecies/, 'instOfSpecies（種さがし）'],
                                [/\brbx?\b/, 'rb / rbx（run-local の 秘薬）'],
                                [/\bdex\b|hasDex|dexRec/, 'dex（種の 状態）'],
                                [/\btowers\b/, 'towers（盤面）'],
                                [/buildSkillBar|syncHUD|buildColGrid/, '画面の 更新']])
    if (re.test(fn)) bad.push('evolveInst が ' + why + ' に 手を のばして いる');
  const set = (body.match(/const EVO_IDS = [^;]*/) || [''])[0];
  if (!set) bad.push('EVO_IDS（ゆるされた 進化ID）が ない');
  else {
    if (!/'e1'/.test(set)) bad.push("EVO_IDS に 'e1' が ない：" + set.slice(0, 70));
    for (const w of ['halloween', 'bday', 'birthday', 'event', 'limited'])
      if (set.includes(w)) bad.push('EVO_IDS に 限定の 言葉（' + w + '）が まざって いる');
  }
  if (fn && !/EVO_IDS\.has/.test(fn)) bad.push('evolveInst が EVO_IDS を 通って いない');
  /* **本番から 呼ぶ ところは 0か所。**ゆるすのは 定義じしんと 検査どうぐだけ */
  const callers = [];
  for (const [i, l] of body.split('\n').entries()){
    if (!/\bevolveInst\b/.test(l)) continue;
    if (/function evolveInst|evolve: evolveInst/.test(l)) continue;
    callers.push('L' + (i + 1) + ': ' + l.trim().slice(0, 80));
  }
  if (callers.length) bad.push('本番から evolveInst を 呼んで いる：' + callers.join(' / '));
}

/* ---------- 実行 ---------- */
const A = 'zzzzzz.1';          // { sp, origin } … ふつうの 個体
const B = 'zzzzzz.2';          // { sp } だけ  … いちばん 古い 形
const b = await launch({ args: ['--allow-file-access-from-files'] });
const pg = await b.newPage();
pg.on('pageerror', e => errs.push(e.message));
pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

/* **`addInitScript` は 読みなおしでも 走る**ので、旗を 1つ 置いて 1回だけ 仕こむ
   （7-6 で ここに だまされた）*/
await pg.addInitScript(({ A, B }) => {
  if (localStorage.getItem('__seeded')) return;
  localStorage.setItem('__seeded', '1');
  localStorage.setItem('sweetTD.starter', '2026-09-03');
  /* **独立性の canary**：`dex` の がわには 進化らしい 値を 入れて おく。
     個体に evo が 無い かぎり、writer も reader も これを 見ては いけない */
  localStorage.setItem('sweetTD.dex', JSON.stringify({
    c_bear:   { w:1, d:'2026-09-03', origin:'egg', evo:'e1' },
    c_rabbit: { w:1, d:'2026-09-03', origin:'egg' } }));
  localStorage.setItem('sweetTD.inst', JSON.stringify({
    v:1, pfx:'zzzzzz', seq:2,
    items: { [A]: { sp:'c_bear', origin:'egg' }, [B]: { sp:'c_rabbit' } } }));
}, { A, B });

await pg.goto('file://' + target + '?dbg=1');
await pg.waitForTimeout(1200);

const r = await pg.evaluate(({ A, B }) => {
  const I = window.__chk.inst, k = window.__chk;
  const o = {};
  o.evoIds   = [...I.evoIds];
  o.seeded   = { A: !!I.all()[A], B: !!I.all()[B] };
  /* 古い 形は ぜんぶ base（＝null）で 読める。bulk migration を して いない */
  o.before   = { A: I.evoOf(A), B: I.evoOf(B) };
  o.dexEvo   = ((JSON.parse(localStorage.getItem('sweetTD.dex')) || {}).c_bear || {}).evo;
  /* ---- 失敗する はずの もの（先に ためす。値が 動かない ことも 見る）---- */
  o.noSuch   = I.evolve('zzzzzz.999', 'e1');
  o.empty    = I.evolve(A, '');
  o.e2       = I.evolve(A, 'e2');
  o.birthday = I.evolve(A, 'birthday');
  o.nullEvo  = I.evolve(A, null);
  o.undef    = I.evolve(A);
  o.afterNg  = I.evoOf(A);
  /* ---- 成功する はずの もの ---- */
  o.okA      = I.evolve(A, 'e1');
  o.afterA   = I.evoOf(A);
  o.againA   = I.evolve(A, 'e1');     // 不可逆＝2回目は ことわる
  o.afterA2  = I.evoOf(A);
  o.okB      = I.evolve(B, 'e1');     // { sp } だけの 古い 個体も 進化できる
  o.afterB   = I.evoOf(B);
  o.recA     = JSON.parse(JSON.stringify(I.all()[A]));
  o.raw      = I.raw();
  return o;
}, { A, B });

await pg.reload(); await pg.waitForTimeout(1200);
const after = await pg.evaluate(({ A, B }) => {
  const I = window.__chk.inst;
  return { A: I.evoOf(A), B: I.evoOf(B),
           recA: JSON.parse(JSON.stringify(I.all()[A] || {})),
           dexEvo: (JSON.parse(localStorage.getItem('sweetTD.dex')) || {}).c_bear.evo };
}, { A, B });
await b.close();

const is = (name, got, want) => { if (got !== want) bad.push(name + ' が ' + JSON.stringify(got) + '（' + JSON.stringify(want) + ' の はず）'); };

if (!r.seeded.A || !r.seeded.B) bad.push('検査用の 個体が 仕こめて いない');
if (r.evoIds.join(',') !== 'e1') bad.push('EVO_IDS が ' + r.evoIds.join(',') + '（e1 だけの はず）');
/* 古い 形は base */
is('仕こんだ 直後の A の evo', r.before.A, null);
is('{ sp } だけの B の evo',   r.before.B, null);
/* **独立性**：dex に evo が あっても 個体は base のまま */
is('dex 側の evo（仕こみ）', r.dexEvo, 'e1');
/* 失敗する もの */
is('存在しない iid',  r.noSuch,   false);
is('空文字',          r.empty,    false);
is('e2（まだ 無い）', r.e2,       false);
is('birthday（別の 軸）', r.birthday, false);
is('null',            r.nullEvo,  false);
is('引数なし',        r.undef,    false);
is('ことわった あとの evo', r.afterNg, null);
/* 成功する もの */
is('A を e1 へ',      r.okA,      true);
is('A の evo',        r.afterA,   'e1');
is('A へ もう一度 e1', r.againA,  false);
is('ことわった あとの A の evo', r.afterA2, 'e1');
is('{ sp } だけの B を e1 へ', r.okB, true);
is('B の evo',        r.afterB,   'e1');
/* 中みは のばすだけ ——origin を こわして いない */
if (r.recA.sp !== 'c_bear' || r.recA.origin !== 'egg' || r.recA.evo !== 'e1')
  bad.push('A の 中みが こわれた：' + JSON.stringify(r.recA));
/* 保存 → 読みなおし */
is('読みなおした A の evo', after.A, 'e1');
is('読みなおした B の evo', after.B, 'e1');
if (after.recA.origin !== 'egg') bad.push('読みなおしたら origin が 消えた');
/* `dex` は 1文字も 書きかえて いない */
is('読みなおした dex の evo', after.dexEvo, 'e1');

const out = (t, a) => console.log('  ' + t.padEnd(16, ' ') + (a.length ? '✗\n    ' + a.join('\n    ') : 'なし ✅'));
console.log('個体の 進化 writer（evolveInst）');
console.log('  EVO_IDS ' + r.evoIds.join(',') + ' ／ 本番の caller 0か所');
out('JSエラー', errs);
out('canary', bad);
const ng = errs.length + bad.length;
console.log(ng ? '\n検査 NG（' + ng + '件）' : '\n検査 OK ✅');
process.exit(ng ? 1 : 0);
