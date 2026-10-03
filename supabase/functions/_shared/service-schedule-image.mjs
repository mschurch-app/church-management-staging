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
  const height = 330 + rows * 128 + 110;
  const cards = entries.map(([label, value], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = 54 + column * 506;
    const y = 330 + row * 128;
    const valueLines = lines(value);
    const valueSvg = valueLines.map((line, lineIndex) => `<tspan x="${x + 28}" dy="${lineIndex ? 37 : 0}">${escapeXml(line)}</tspan>`).join('');
    return `<g><rect x="${x}" y="${y}" width="478" height="108" rx="24" fill="#FFF9F4" stroke="#F3D8CC" stroke-width="2"/><text x="${x + 28}" y="${y + 35}" font-size="23" font-weight="650" fill="#B66550">${escapeXml(label)}</text><text x="${x + 28}" y="${y + 75}" font-size="30" font-weight="720" fill="#352824">${valueSvg}</text></g>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${height}" viewBox="0 0 1080 ${height}"><rect width="1080" height="${height}" fill="#FFFDF9"/><rect width="1080" height="278" fill="${accent}"/><circle cx="980" cy="22" r="190" fill="#FFFFFF" opacity=".09"/><circle cx="875" cy="250" r="110" fill="#FFFFFF" opacity=".07"/><text x="58" y="72" font-size="32" font-weight="700" fill="#FFF7F0">${escapeXml(mark)}　${escapeXml(churchName)}</text><text x="58" y="150" font-size="58" font-weight="820" fill="#FFFFFF">主日服事表</text><rect x="58" y="188" width="964" height="58" rx="18" fill="#FFFFFF" opacity=".18"/><text x="82" y="228" font-size="29" font-weight="700" fill="#FFFFFF">${escapeXml(dateText)}</text><text x="998" y="228" text-anchor="end" font-size="27" font-weight="650" fill="#FFF7F0">${escapeXml(eventText || '主日崇拜')}</text>${cards}<line x1="54" y1="${height - 78}" x2="1026" y2="${height - 78}" stroke="#F0DED6" stroke-width="2"/><text x="54" y="${height - 36}" font-size="23" font-weight="650" fill="#9B7468">每一份服事，都是愛的同行</text><text x="1026" y="${height - 36}" text-anchor="end" font-size="21" fill="#B78E82">M+ Church OS</text></svg>`;
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

