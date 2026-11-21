import { TEXT_KEY, THEME_KEY } from "./look-keys";

/**
 * Runs in <head> before anything is painted, so a remembered "Koyu" or "Çok büyük" never flashes the other look.
 * It is the same rule as `readLook` + `lookAttributes`, written out as plain script (it cannot import).
 */
export const LOOK_SCRIPT = `(function(){try{var d=document.documentElement,t=localStorage.getItem(${JSON.stringify(THEME_KEY)}),s=localStorage.getItem(${JSON.stringify(TEXT_KEY)});if(t==="light"||t==="dark")d.dataset.theme=t;if(s==="large"||s==="xlarge")d.dataset.text=s}catch(e){}})()`;
