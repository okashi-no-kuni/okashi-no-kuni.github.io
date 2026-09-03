/* このファイルは 手で 直さないこと。
   node tools/build-sw.mjs が 作りなおします（中みは tools/_files.mjs）*/
const V = '71f370fe47';
const CACHE = 'okashi-' + V;
const CORE = ["index.html","manifest.webmanifest","apple-touch-icon.png","icon-192.png","icon-512.png","icon-maskable-512.png","vendor/phaser.min.js","vendor/phaser-LICENSE.txt","art/title/title_main.webp","art/title/title_v2.webp","art/ui/bonus_ame.webp","art/ui/bonus_ichigo.webp","art/ui/cur_gem.webp","art/ui/cur_heart.webp","art/ui/cur_shard.webp","art/ui/cur_star.webp","art/ui/it_elixir3.webp","art/ui/item_ball.webp","art/ui/item_bolt.webp","art/ui/item_elixir.webp","art/ui/item_freeze.webp","art/ui/item_hammer.webp","art/ui/item_rain.webp","art/ui/nav_avatar.webp","art/ui/nav_close.webp","art/ui/nav_code.webp","art/ui/nav_dex.webp","art/ui/nav_egg.webp","art/ui/nav_guard.webp","art/ui/nav_guide.webp","art/ui/nav_pick.webp","art/ui/nav_pin.webp","art/ui/nav_share.webp","art/ui/nav_shop.webp","art/ui/nav_week.webp","art/ui/shop_help.webp","art/ui/shop_pass.webp","art/ui/shop_rainbow_set.webp","art/ui/shop_start.webp","art/ui/snd_off.webp","art/ui/snd_on.webp","art/ui/theme_dream.webp","art/ui/theme_lemon.webp","art/ui/theme_mermaid.webp"];
const REST = ["invite.html","privacy.html","support.html","art/sprites/angel.png","art/sprites/anmitsu.png","art/sprites/armadillo.png","art/sprites/bat.png","art/sprites/baum.png","art/sprites/bear.png","art/sprites/bee.png","art/sprites/beetle.png","art/sprites/berryqueen.png","art/sprites/bigparfait.png","art/sprites/butterfly.png","art/sprites/cactus.png","art/sprites/cake.png","art/sprites/camel.png","art/sprites/candy.png","art/sprites/candytree.png","art/sprites/castella.png","art/sprites/choco.png","art/sprites/chocoknight.png","art/sprites/churro.png","art/sprites/cleopatra.png","art/sprites/clownfish.png","art/sprites/cobra.png","art/sprites/cookie.png","art/sprites/crab.png","art/sprites/cream.png","art/sprites/cupcake.png","art/sprites/daifuku.png","art/sprites/dango.png","art/sprites/deer.png","art/sprites/devil.png","art/sprites/dolphin.png","art/sprites/donut.png","art/sprites/eagle.png","art/sprites/eclair.png","art/sprites/elephant.png","art/sprites/fairy.png","art/sprites/fennec.png","art/sprites/firebird.png","art/sprites/futaba.png","art/sprites/ghost.png","art/sprites/giraffe.png","art/sprites/golem.png","art/sprites/gull.png","art/sprites/gummy.png","art/sprites/hanabi.png","art/sprites/hedgehog.png","art/sprites/hermit.png","art/sprites/hikari.png","art/sprites/hinotama.png","art/sprites/horse.png","art/sprites/icecream.png","art/sprites/it_ball.png","art/sprites/it_bolt.png","art/sprites/it_elixir.png","art/sprites/it_freeze.png","art/sprites/it_hammer.png","art/sprites/it_rain.png","art/sprites/jelly.png","art/sprites/jelly2.png","art/sprites/kagero.png","art/sprites/kakigori.png","art/sprites/kaminari.png","art/sprites/kangaroo.png","art/sprites/king.png","art/sprites/koala.png","art/sprites/konpeito.png","art/sprites/koori.png","art/sprites/kraken.png","art/sprites/kujaku.png","art/sprites/kyubi.png","art/sprites/ladybug.png","art/sprites/lavagolem.png","art/sprites/lavasnail.png","art/sprites/lion.png","art/sprites/lizard.png","art/sprites/macaron.png","art/sprites/mammoth.png","art/sprites/manju.png","art/sprites/manta.png","art/sprites/marshmallow.png","art/sprites/meerkat.png","art/sprites/mermaid.png","art/sprites/mille.png","art/sprites/monaka.png","art/sprites/monkey.png","art/sprites/mont.png","art/sprites/moonrabbit.png","art/sprites/mouse.png","art/sprites/mummy.png","art/sprites/nagareboshi.png","art/sprites/octopus.png","art/sprites/ohagi.png","art/sprites/oni.png","art/sprites/onibi.png","art/sprites/orca.png","art/sprites/ostrich.png","art/sprites/owl.png","art/sprites/pancake.png","art/sprites/panda.png","art/sprites/parfait.png","art/sprites/pegasus.png","art/sprites/penguin.png","art/sprites/pharaoh.png","art/sprites/pig.png","art/sprites/popcorn.png","art/sprites/pretzel.png","art/sprites/prince.png","art/sprites/princess.png","art/sprites/purin.png","art/sprites/purinala.png","art/sprites/purinpafe.png","art/sprites/queen.png","art/sprites/rabbit.png","art/sprites/redpanda.png","art/sprites/roll.png","art/sprites/ryu.png","art/sprites/sakuramochi.png","art/sprites/salamander.png","art/sprites/sandcat.png","art/sprites/scorpion.png","art/sprites/seahorse.png","art/sprites/seal.png","art/sprites/senbei.png","art/sprites/shark.png","art/sprites/sheep.png","art/sprites/shizuku.png","art/sprites/slime.png","art/sprites/sloth.png","art/sprites/snowqueen.png","art/sprites/soft.png","art/sprites/sphinx.png","art/sprites/squirrel.png","art/sprites/star.png","art/sprites/starfish.png","art/sprites/sunadokei.png","art/sprites/swan.png","art/sprites/taffy.png","art/sprites/taiyou.png","art/sprites/tart.png","art/sprites/tiger.png","art/sprites/tower.png","art/sprites/tsumuji.png","art/sprites/turtle.png","art/sprites/tutankhamun.png","art/sprites/unicorn.png","art/sprites/waffle.png","art/sprites/warabi.png","art/sprites/watagumo.png","art/sprites/watame.png","art/sprites/wedding.png","art/sprites/whale.png","art/sprites/witch.png","art/sprites/witch_fly.png","art/sprites/wizard.png","art/sprites/wolf.png","art/sprites/yotsuba.png","art/sprites/youkan.png","art/sprites/yukionna.png","art/sprites/zebra.png","art/screens/duel_berry.webp","art/screens/duel_caramel.webp","art/screens/duel_choco.webp","art/screens/duel_egypt.webp","art/screens/duel_fire.webp","art/screens/duel_forest.webp","art/screens/duel_ice.webp","art/screens/duel_night.webp","art/screens/duel_rainbow.webp","art/screens/duel_sea.webp","art/screens/duel_snow.webp","art/screens/duel_sugar.webp","art/screens/ogp.jpg","art/screens/welcome.webp","art/screens/welcome_castle.webp"];

/* 入れた しゅんかん：すぐ いる ものだけ ためる */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

/* 有効に なった しゅんかん：古い キャッシュを 捨てて、のこりを うしろで ためる */
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
    warm();                       // 待たない。ゲームを 止めない ため
  })());
});

/* のこりを 1つずつ。**まとめて addAll しない**こと ——1つ こけると
   ぜんぶ 失敗に なるので、17MB が まるごと むだに なります */
async function warm(){
  const c = await caches.open(CACHE);
  for (const u of REST){
    try{ if (!(await c.match(u))) await c.add(u); }catch(e){}
  }
}

/* 読むとき：キャッシュに あれば それ。無ければ ネットから とって ためる */
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const url = new URL(r.url);
  if (url.origin !== self.location.origin) return;   // よその ドメインは さわらない
  e.respondWith((async () => {
    const hit = await caches.match(r, { ignoreSearch: true });
    if (hit) return hit;
    try{
      const res = await fetch(r);
      if (res && res.ok && res.type === 'basic')
        (await caches.open(CACHE)).put(r, res.clone());
      return res;
    }catch(err){
      /* 電波が 無くて キャッシュにも 無い。ページの 行き先なら 表紙を かえす */
      if (r.mode === 'navigate') return caches.match('index.html');
      throw err;
    }
  })());
});

/* ガイドの 診断に 出す ため。版が 分かると「古い キャッシュ？」を 切りわけられる */
self.addEventListener('message', e => {
  if (e.data === 'version' && e.source) e.source.postMessage({ sw: V });
});
