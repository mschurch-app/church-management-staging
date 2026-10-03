import { Resvg, initWasm } from 'https://esm.sh/@resvg/resvg-wasm@2.6.2';

const WASM_URL = 'https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm';
const FONT_URL = 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosanstc/NotoSansTC%5Bwght%5D.ttf';
const BUCKET = 'line-message-images';
let rendererReady;
let fontBuffer;

function escapeXml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
}

function lines(value, length = 14) {
  const text = String(value ?? '').trim();
  if (text.length <= length) return [text];
  return [text.slice(0, length), text.slice(length, length * 2 - 1) + (text.length > length * 2 - 1 ? '…' : '')];
}

async function ready() {
  rendererReady ||= initWasm(fetch(WASM_URL));
  fontBuffer ||= fetch(FONT_URL).then(async response => {
    if (!response.ok) throw new Error(`font_download_failed_${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  });
  await rendererReady;
  return await fontBuffer;
}

export async function createServiceSchedulePng({churchName, mark, dateText, eventText, entries, accent = '#E86545'}) {
  const rows = Math.ceil(entries.length / 2);
  const height = 310 + rows * 126 + 104;
  const cards = entries.map(([label, value], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = 54 + column * 506;
    const y = 310 + row * 126;
    const valueLines = lines(value);
    const valueSvg = valueLines.map((line, lineIndex) => `<tspan x="${x + 28}" dy="${lineIndex ? 28 : 0}">${escapeXml(line)}</tspan>`).join('');
    return `<g filter="url(#cardShadow)"><rect x="${x}" y="${y}" width="478" height="106" rx="18" fill="#FFFFFF" stroke="#E8DAD1" stroke-width="2"/><rect x="${x}" y="${y + 18}" width="5" height="70" rx="3" fill="${accent}"/><text x="${x + 28}" y="${y + 33}" font-size="22" font-weight="700" fill="#B24634" style="font-variation-settings:'wght' 700">${escapeXml(label)}</text><text x="${x + 28}" y="${y + 70}" font-size="29" font-weight="780" fill="#292321" style="font-variation-settings:'wght' 780">${valueSvg}</text></g>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${height}" viewBox="0 0 1080 ${height}"><defs><filter id="cardShadow" x="-10%" y="-20%" width="120%" height="150%"><feDropShadow dx="0" dy="5" stdDeviation="8" flood-color="#5C3529" flood-opacity=".08"/></filter></defs><rect width="1080" height="${height}" fill="#FAF6F0"/><rect width="1080" height="262" fill="${accent}"/><rect x="54" y="42" width="76" height="48" rx="14" fill="#FFFFFF"/><text x="92" y="76" text-anchor="middle" font-size="25" font-weight="850" fill="${accent}" style="font-variation-settings:'wght' 850">${escapeXml(mark)}</text><text x="150" y="76" font-size="28" font-weight="720" fill="#FFFFFF" style="font-variation-settings:'wght' 720">${escapeXml(churchName)}</text><text x="54" y="158" font-size="60" font-weight="900" fill="#FFFFFF" style="font-variation-settings:'wght' 900">主日服事表</text><line x1="54" y1="184" x2="1026" y2="184" stroke="#FFFFFF" stroke-opacity=".35" stroke-width="2"/><text x="54" y="226" font-size="28" font-weight="720" fill="#FFFFFF" style="font-variation-settings:'wght' 720">${escapeXml(dateText)}</text><text x="1026" y="226" text-anchor="end" font-size="26" font-weight="700" fill="#FFFFFF" style="font-variation-settings:'wght' 700">${escapeXml(eventText || '主日崇拜')}</text>${cards}<line x1="54" y1="${height - 73}" x2="1026" y2="${height - 73}" stroke="#DCCBC1" stroke-width="2"/><text x="54" y="${height - 34}" font-size="22" font-weight="700" fill="#6F5A51" style="font-variation-settings:'wght' 700">每一份服事，都是愛的同行</text><text x="1026" y="${height - 34}" text-anchor="end" font-size="20" font-weight="650" fill="#8F786D">M+ Church OS</text></svg>`;
  const font = await ready();
  const renderer = new Resvg(svg, {fitTo:{mode:'width',value:1080},font:{fontBuffers:[font],defaultFontFamily:'Noto Sans TC'}});
  const image = renderer.render();
  const png = image.asPng();
  image.free();
  renderer.free();
  return png;
}

export async function uploadServiceSchedulePng(db, path, png) {
  const {data:buckets,error:listError}=await db.storage.listBuckets();
  if(listError)throw new Error(`bucket_check_failed: ${listError.message}`);
  if(!(buckets||[]).some(bucket=>bucket.name===BUCKET)){
    const {error:createError}=await db.storage.createBucket(BUCKET,{public:false,fileSizeLimit:5242880,allowedMimeTypes:['image/png']});
    if(createError && !/already exists/i.test(createError.message))throw new Error(`bucket_create_failed: ${createError.message}`);
  }
  const {error} = await db.storage.from(BUCKET).upload(path, png, {contentType:'image/png',cacheControl:'3600',upsert:true});
  if (error) throw new Error(`image_upload_failed: ${error.message}`);
  const {data,error:signedError} = await db.storage.from(BUCKET).createSignedUrl(path,3600);
  if(signedError||!data?.signedUrl)throw new Error(`image_signed_url_failed: ${signedError?.message||'missing URL'}`);
  return data.signedUrl;
}
