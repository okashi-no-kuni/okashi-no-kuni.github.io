/* ==========================================================================
   GLOWZ の画面検査
   目視では通ってしまうものを拾う。報告する前にかならず走らせること。
   実際、目で見て「直った」と思ったあとにこれをかけて、
   隠れた画面の Canvas が幅0で例外を投げているのが見つかった。

     node tools/check-glowz.mjs      # 終了コード 0 で合格

   | 見るもの   | 見つかるもの                       |
   |------------|------------------------------------|
   | JSエラー   | 描画中の例外                       |
   | 横はみ出し | 画面より広い要素                   |
   | Canvasが空 | 幅0のまま描けていないグラフ        |
   | タブ       | 画面が1まいずつ入れかわっているか  |

   Googleフォントは取りに行けない環境があるので、その失敗だけ対象外。
   ========================================================================== */
/* playwright はこの環境の共通の場所に入っている（check-chars.mjs と同じ） */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT  = process.env.OUT || '/tmp/glowz-shots';
execSync(`mkdir -p ${OUT}`);

const PAGES = [
  { id:'portal',    url:'glowz/index.html' },
  { id:'business',  url:'glowz/business/index.html' },
  { id:'therapist', url:'glowz/therapist/index.html' },
  { id:'customer',  url:'glowz/customer/index.html' },
];
const SIZES = [
  { n:'w', w:1440, h:940 },
  { n:'m', w:390,  h:844 },
];

/* ブラウザの置き場所は環境で変わる。CHROME で上書きできるようにしておく */
const exe = process.env.CHROME ||
  (execSync("ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1", {encoding:'utf8'}).trim() || undefined);
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
let bad = 0;

for (const p of PAGES){
  for (const s of SIZES){
    const ctx = await browser.newContext({ viewport:{ width:s.w, height:s.h }, deviceScaleFactor:2 });
    const pg  = await ctx.newPage();
    const errs = [];
    pg.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
    pg.on('console',  m => {
      if (m.type()!=='error') return;
      const t = m.text();
      if (/fonts\.g|ERR_CONNECTION_RESET|ERR_NAME_NOT_RESOLVED/.test(t)) return;  // 外部フォントは対象外
      errs.push('CONSOLE: ' + t);
    });
    pg.on('requestfailed', r => {
      // Google Fonts はネットワーク次第なので失敗しても致命ではない
      if (!r.url().includes('fonts.g')) errs.push('REQFAIL: ' + r.url());
    });

    await pg.goto('file://' + ROOT + '/' + p.url, { waitUntil:'load' });
    await pg.waitForTimeout(900);

    // customer は年齢確認を通してから中身を見る
    if (p.id === 'customer'){
      await pg.click('#yes');
      await pg.waitForTimeout(300);
    }

    // 横スクロールが出ていないか（出ていたらどこかが画面より広い）
    const over = await pg.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);

    // Canvas が全部ちゃんと描けているか（幅0のまま＝真っ白を拾う）
    const canv = await pg.evaluate(() =>
      [...document.querySelectorAll('canvas')].filter(c => c.offsetParent !== null).map(c => ({
        id:c.id, w:c.width, h:c.height,
        blank: (() => {
          const x = c.getContext('2d');
          if (!c.width || !c.height) return true;
          const d = x.getImageData(0,0,c.width,c.height).data;
          for (let i=3;i<d.length;i+=4) if (d[i]) return false;
          return true;
        })(),
      })));

    await pg.screenshot({ path:`${OUT}/${p.id}-${s.n}.png`, fullPage:s.n==='w' });

    const blanks = canv.filter(c => c.blank && c.w);
    const issues = [
      ...errs,
      over > 1 ? `横に ${over}px はみ出し` : null,
      blanks.length ? `Canvas が空: ${blanks.map(b=>b.id||'(no id)').join(', ')}` : null,
    ].filter(Boolean);

    if (issues.length) bad++;
    console.log(`${issues.length? '✗':'✓'} ${p.id.padEnd(10)} ${s.w}x${s.h}  canvas:${canv.length}` +
      (issues.length ? '\n    ' + issues.join('\n    ') : ''));

    await ctx.close();
  }
}

// therapist はタブを全部たたいて、どの画面でも壊れないか見る
{
  const ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('file://' + ROOT + '/glowz/therapist/index.html');
  await pg.waitForTimeout(600);
  for (const v of ['sched','pay','msg','menu','home']){
    await pg.click(`.tab[data-go="${v}"]`);
    await pg.waitForTimeout(450);
    const on = await pg.$eval('.view.on', e => e.dataset.v);
    const shown = await pg.$$eval('.view.on', a => a.length);
    const okv = on===v && shown===1;
    console.log(`${okv ? '✓':'✗'} therapist tab → ${v} (表示中 ${shown}枚)` + (okv?'':`  ← .on が ${on}`));
    if (!okv) bad++;
    await pg.screenshot({ path:`${OUT}/therapist-${v}.png` });
  }
  if (errs.length){ bad++; console.log('  ✗ JSエラー: ' + errs.join('\n  ')); }
  await ctx.close();
}

await browser.close();
console.log(bad ? `\n${bad} 件の問題` : '\nすべて合格');
console.log(`スクリーンショット: ${OUT}`);
process.exit(bad ? 1 : 0);
