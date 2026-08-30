/* 表紙マスターの **上の 余白だけ** に かざりを 足す。
 *
 *   雲     … ならしで 消えきらない 帯の 名ごりを おおう（実機の 提案）。
 *             左の 角・中央左・右の 角。元絵の 角の 雲から つづいて 見える いち
 *   泡     … 左の 空に 3つ。元絵の シャボン玉と 同じ 作り
 *   キラキラ… 左を 中心に 星と 粉
 *
 * **元絵（155,420〜1095,2091）には 1pxも さわらない。**
 * evenodd の クリップで まん中を くりぬいた うえ、かざりは 別レイヤに
 * 描いて y=372→414 で アルファを 0 に 落とす（境めに 硬い ふちを 出さない）。
 *
 *   node tools/title-sky-decor.mjs <入力png> <出力png>
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync } from 'fs';
import { resolve } from 'path';
const SRC = resolve(process.argv[2]), OUT = resolve(process.argv[3]);
const MW=1250, MH=2100, ML=155, MT=420, IW=941, IH=1672;

const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--allow-file-access-from-files'] });
const p = await b.newPage(); await p.goto('file:///home/user/okashi-no-kuni.github.io/');
const png = await p.evaluate(async (K) => {
  const im = new Image(); im.src = 'file://' + K.SRC; await im.decode();
  const c = document.createElement('canvas'); c.width = K.MW; c.height = K.MH;
  const g = c.getContext('2d', { willReadFrequently:true });
  g.imageSmoothingEnabled = false; g.drawImage(im, 0, 0);

  /* --- かざりは 別レイヤに --- */
  const L = document.createElement('canvas'); L.width = K.MW; L.height = K.MT + 8;
  const q = L.getContext('2d');

  /* 雲。ふんわりした 玉を かさねる（このシリーズの 雲の 作りかた） */
  const puff = (x, y, r, a) => {
    const gr = q.createRadialGradient(x, y - r*0.18, r*0.12, x, y, r);
    gr.addColorStop(0.00, 'rgba(255,246,240,' + (a*0.85).toFixed(3) + ')');
    gr.addColorStop(0.45, 'rgba(255,224,238,' + (a*0.55).toFixed(3) + ')');
    gr.addColorStop(1.00, 'rgba(255,214,234,0)');
    q.fillStyle = gr; q.beginPath(); q.arc(x, y, r, 0, 6.2832); q.fill();
  };
  const CLOUDS = [
    /* 左の 角（ピンクの むらを おおう。元絵の 左角の 雲の つづき） */
    [120,404,40,.62],[170,392,50,.66],[220,382,58,.68],[272,392,50,.64],[318,402,38,.56],
    /* 中央左（たてすじの すそを おおう） */
    [378,400,34,.42],[412,392,42,.46],[448,401,32,.40],
    /* 右の 角（白い むらを おおう。元絵の 右角の 雲の つづき） */
    [905,404,36,.55],[945,390,46,.62],[992,378,56,.66],[1040,390,48,.62],[1082,402,40,.55],
  ];
  for (const [x,y,r,a] of CLOUDS) puff(x, y, r, a);

  /* 泡。元絵の シャボン玉と 同じ 作り（うすい 玉＋白い ふち＋
     もも・水色の にじり＋ハイライト） */
  const bubble = (x, y, r) => {
    let gr = q.createRadialGradient(x, y, r*0.2, x, y, r);
    gr.addColorStop(0.00, 'rgba(255,255,255,0.05)');
    gr.addColorStop(0.80, 'rgba(255,255,255,0.06)');
    gr.addColorStop(0.92, 'rgba(255,255,255,0.34)');
    gr.addColorStop(1.00, 'rgba(255,255,255,0)');
    q.fillStyle = gr; q.beginPath(); q.arc(x, y, r, 0, 6.2832); q.fill();
    q.lineWidth = Math.max(1, r*0.05); q.lineCap = 'round';
    q.strokeStyle = 'rgba(255,190,226,0.5)';
    q.beginPath(); q.arc(x, y, r*0.94, 0.4, 1.6); q.stroke();     // 右下に もも
    q.strokeStyle = 'rgba(178,218,255,0.5)';
    q.beginPath(); q.arc(x, y, r*0.94, 2.6, 3.7); q.stroke();     // 左に 水色
    gr = q.createRadialGradient(x - r*0.38, y - r*0.42, 0, x - r*0.38, y - r*0.42, r*0.34);
    gr.addColorStop(0, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    q.fillStyle = gr; q.beginPath(); q.arc(x - r*0.38, y - r*0.42, r*0.34, 0, 6.2832); q.fill();
  };
  bubble(148, 152, 26); bubble(258, 96, 15); bubble(96, 268, 18);

  /* キラキラ。4方向の 星＋ぼんやりした 光＋粉 */
  const star = (x, y, r, a) => {
    const gr = q.createRadialGradient(x, y, 0, x, y, r*2.4);
    gr.addColorStop(0, 'rgba(255,255,255,' + (a*0.30).toFixed(3) + ')');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    q.fillStyle = gr; q.beginPath(); q.arc(x, y, r*2.4, 0, 6.2832); q.fill();
    q.save(); q.translate(x, y); q.globalAlpha = a; q.fillStyle = '#ffffff';
    q.beginPath();
    q.moveTo(0, -r); q.quadraticCurveTo(r*0.16, -r*0.16, r, 0);
    q.quadraticCurveTo(r*0.16, r*0.16, 0, r);
    q.quadraticCurveTo(-r*0.16, r*0.16, -r, 0);
    q.quadraticCurveTo(-r*0.16, -r*0.16, 0, -r);
    q.fill(); q.restore();
  };
  star(212, 208, 10, .78); star(332, 128, 7, .62); star(118, 328, 8, .66);
  star(432, 238, 6, .5);   star(88, 118, 6, .5);
  star(1092, 178, 6, .5);  star(1178, 296, 7, .56);
  /* 粉は 決めうちの ならび（乱数だと 出すたび 変わる） */
  let sd = 7;
  const rnd = () => (sd = (sd*16807) % 2147483647) / 2147483647;
  q.fillStyle = '#ffffff';
  for (let i = 0; i < 30; i++){
    const x = rnd()*620 + 20, y = rnd()*360 + 20, d = 1 + rnd()*2;
    q.globalAlpha = 0.25 + rnd()*0.4;
    q.fillRect(x - d/2, y - d/2, d, d);
  }
  q.globalAlpha = 1;

  /* 下へ いくほど すきとおらせる。境めに 硬い ふちを 出さない */
  const mk = q.createLinearGradient(0, 0, 0, K.MT + 8);
  const u0 = 372/(K.MT+8), u1 = 414/(K.MT+8);
  mk.addColorStop(0, 'rgba(0,0,0,1)'); mk.addColorStop(u0, 'rgba(0,0,0,1)');
  mk.addColorStop(u1, 'rgba(0,0,0,0)'); mk.addColorStop(1, 'rgba(0,0,0,0)');
  q.globalCompositeOperation = 'destination-in';
  q.fillStyle = mk; q.fillRect(0, 0, K.MW, K.MT + 8);
  q.globalCompositeOperation = 'source-over';

  /* まん中を くりぬいた クリップの 中で 貼る（保険。元絵には 届かない） */
  g.save();
  g.beginPath();
  g.rect(0, 0, K.MW, K.MH);
  g.rect(K.ML, K.MT, K.IW, K.IH);
  g.clip('evenodd');
  g.drawImage(L, 0, 0);
  g.restore();
  return c.toDataURL('image/png');
}, { SRC, MW, MH, ML, MT, IW, IH });
writeFileSync(OUT, Buffer.from(png.split(',')[1], 'base64'));
console.log('かざりを 足した:', OUT);
await b.close();
