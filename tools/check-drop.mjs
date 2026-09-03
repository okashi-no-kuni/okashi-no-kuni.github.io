/* アイテムの ドロップに `late` が ちゃんと 効いているかを しらべる。
 *
 *   node tools/check-drop.mjs        # 終了コード 0 で 合格
 *
 * むかしは **ステージクリアだけ** `late` を 見て いて、
 * 戦いの ドロップ（`spawnGift`）は 見て いませんでした。
 * だから `late:200` の こだいの秘薬が **ウェーブ1から 敵から 落ちて**いました。
 * 絵にも 文にも 出ないので、目でも 実機でも 気づけません。
 *
 * ものさしは 2つ。
 *   ① ステージクリアと 戦いで **同じ pool**（中みも ならびも）
 *   ② `late` の さかいめが **その ウェーブ ちょうど から**（>= であって > では ない）
 *
 * ②の さかいめは、検査の 中でだけ `late:123` の 架空アイテムを さしこんで
 * W122 で 入らない・W123 で 入る ことで 見ます（本物の index.html は
 * 1文字も 変えません）。
 */
import { launch } from './_pw.mjs';
import { resolve, dirname, join } from 'path';
import { readFileSync, writeFileSync, unlinkSync } from 'fs';

const target = resolve(process.argv[2] || 'index.html');
const src = readFileSync(target, 'utf8');

/* 架空アイテムは **さかいめ用の 1件だけ**。`late` 以外は ふつうの アイテムに
   して おかないと、落ちた ときに 何が 原因か 分からなく なります */
const FAKE = `
  { id:'__cn_late', name:'さかいめ', sn:'さかい', ic:'🧭', col:'#cccccc', need:false, late:123,
    desc:'W123から', note:'canary' },
`;
const anchor = 'const ITEMS = [\n';
if (!src.includes(anchor)){ console.error('✗ ITEMS の 目じるしが 見つからない'); process.exit(1); }
/* **写しは リポジトリの 中に 置くこと。**よそに 置くと vendor/phaser.min.js
   などの 相対パスが 解けず、ページごと 動きません */
const tmp = join(dirname(target), '.__dropchk.tmp.html');
writeFileSync(tmp, src.replace(anchor, anchor + FAKE));
process.on('exit', () => { try{ unlinkSync(tmp); }catch(e){} });

const WAVES = [1, 122, 123, 199, 200, 201, 250];
const b = await launch({ args: ['--allow-file-access-from-files'] });
const errs = [], bad = [];

async function look(path){
  const pg = await b.newPage();
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.goto('file://' + path + '?dbg=1');
  await pg.waitForTimeout(1200);
  const r = await pg.evaluate(ws => {
    const d = window.__dbg, k = window.__chk;
    const o = { items: k.itemsRaw().map(i => i.id), lates: {}, at: {} };
    for (const i of k.itemsRaw()) o.lates[i.id] = i.late || 0;
    for (const w of ws) o.at[w] = { stage: d.stageDropPool(w), battle: d.battleDropPool(w) };
    return o;
  }, WAVES);
  await pg.close();
  return r;
}

const base = await look(target);
const cn   = await look(tmp);
await b.close();

const eq = (a, c) => a.length === c.length && a.every((v, i) => v === c[i]);

for (const [tag, r] of [['本物', base], ['さかいめ', cn]]){
  for (const w of WAVES){
    const { stage, battle } = r.at[w];
    /* ① 2か所が 同じ ——中みだけで なく ならびも */
    if (!eq(stage, battle))
      bad.push(tag + ' W' + w + ': ステージと 戦いで pool が ちがう\n      stage : ' +
               stage.join(',') + '\n      battle: ' + battle.join(','));
    /* ② `late` の しきりが その ウェーブ ちょうどから（>=）*/
    const want = r.items.filter(id => !r.lates[id] || w >= r.lates[id]);
    for (const src2 of [['stage', stage], ['battle', battle]])
      if (!eq(src2[1], want))
        bad.push(tag + ' W' + w + ' の ' + src2[0] + ' が ちがう\n      出た : ' +
                 src2[1].join(',') + '\n      はず : ' + want.join(','));
  }
}

/* こだいの秘薬（late:200）の さかいめ。**ここが この bugfix の 本体** */
for (const [w, want] of [[1, false], [199, false], [200, true], [201, true], [250, true]]){
  const has = base.at[w].battle.includes('elixir3');
  if (has !== want) bad.push('W' + w + ' の 戦い drop に elixir3 が ' +
                             (has ? 'いる' : 'いない') + '（' + (want ? 'いる' : 'いない') + ' はず）');
}
/* 架空の late:123 の さかいめ */
for (const [w, want] of [[122, false], [123, true]])
  for (const key of ['stage', 'battle']){
    const has = cn.at[w][key].includes('__cn_late');
    if (has !== want) bad.push('W' + w + ' の ' + key + ' に late:123 が ' +
                               (has ? 'いる' : 'いない') + '（' + (want ? 'いる' : 'いない') + ' はず）');
  }
/* ほかの アイテムの 顔ぶれと ならびが 変わって いない こと */
{
  const noLate = base.items.filter(id => !base.lates[id]);
  for (const w of WAVES){
    const got = base.at[w].battle.filter(id => !base.lates[id]);
    if (!eq(got, noLate))
      bad.push('W' + w + ': late を もたない アイテムの 顔ぶれ／ならびが 変わった：' + got.join(','));
  }
}

const out = (t, a) => console.log('  ' + t.padEnd(16, ' ') + (a.length ? '✗\n    ' + a.join('\n    ') : 'なし ✅'));
console.log('ドロップの late');
for (const w of WAVES) console.log('  W' + String(w).padEnd(4) + base.at[w].battle.join(','));
out('JSエラー', errs);
out('canary', bad);
const ng = errs.length + bad.length;
console.log(ng ? '\n検査 NG（' + ng + '件）' : '\n検査 OK ✅');
process.exit(ng ? 1 : 0);
