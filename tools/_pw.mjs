/* Playwright（Chromium）を どこから 読むか、1か所で 決める。
 *
 * この開発環境では OS に 入っている ものを つかいますが、
 * GitHub Actions の ランナーには その パスが ありません。
 * 決めうちに していると、**手もとでは 通るのに CIだけ 落ちます**。
 *
 * モジュールの ありか
 *   ① 環境変数 PLAYWRIGHT_MODULE が あれば それ
 *   ② この環境の 決まった 場所に あれば それ
 *   ③ どちらも 無ければ ふつうに import（node_modules）
 *
 * ブラウザの ありか
 *   /opt/pw-browsers/chromium が あれば それ、無ければ Playwright に まかせる
 */
import { existsSync } from 'fs';

const LOCAL_MOD = '/opt/node22/lib/node_modules/playwright/index.mjs';
const LOCAL_BIN = '/opt/pw-browsers/chromium';

const mod = process.env.PLAYWRIGHT_MODULE
  || (existsSync(LOCAL_MOD) ? LOCAL_MOD : 'playwright');

export const { chromium } = await import(mod);

/* chromium.launch の かわりに これを つかうこと。
   executablePath を 決めうちに しない ためです */
export const launch = (opts = {}) =>
  chromium.launch(existsSync(LOCAL_BIN) && !opts.executablePath
    ? { ...opts, executablePath: LOCAL_BIN } : opts);
