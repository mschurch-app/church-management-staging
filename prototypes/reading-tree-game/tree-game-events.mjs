// Each event has one teaching purpose and one matching piece of armor.
export const GARDEN_EVENTS = Object.freeze([
  { id: 'truth', gear: 'belt', title: '耳邊的悄悄話', story: '草叢裡傳來聲音：「做錯事，只要說個謊就不會被發現。」你想站穩，選擇誠實。這時應該取出哪件軍裝？', hint: '想一想：哪件軍裝提醒我們把真理繫在心上？', art: 'whisper', result: '真理幫助你站穩，悄悄的謊言散去了。' },
  { id: 'justice', gear: 'breastplate', title: '心上的灰霧', story: '你被一句話傷到了，很想用更難聽的話反擊。灰霧慢慢罩住你的心。哪件軍裝能提醒你選擇公義，守護心中的良善？', hint: '想一想：哪件軍裝保護心，也提醒我們公平待人？', art: 'heart', result: '護心鏡重新發光，你選擇以公義與憐憫回應。' },
  { id: 'peace', gear: 'boots', title: '小徑旁孤單的朋友', story: '有位朋友獨自坐在小徑旁，好像需要一句關心。你想帶著平安與好消息走向他，應該取出哪件軍裝？', hint: '想一想：要走向朋友、帶去平安，腳上需要什麼？', art: 'friend', result: '祝福開成小花，朋友知道有人願意陪伴他。' },
  { id: 'faith', gear: 'shield', title: '飛來的試探火箭', story: '試探像火箭飛來：「不要相信神，放棄就好了！」你需要站穩，擋住這些攻擊。該取出哪件軍裝？', hint: '想一想：哪件軍裝能抵擋試探的火箭？', art: 'arrows', result: '火箭熄滅了，信心幫助你倚靠神站穩。' },
  { id: 'hope', gear: 'helmet', title: '快要熄滅的盼望', story: '你心裡出現一個念頭：「我沒有盼望，神會不會忘了我？」你需要記得神的拯救，保護自己的思想。該取出哪件軍裝？', hint: '想一想：哪件戴在頭上的軍裝，提醒我們神的救恩？', art: 'star', result: '盼望重新亮起，你記得神所賜的拯救。' },
  { id: 'word', gear: 'sword', title: '擋在前路的黑影', story: '黑影擋住花園小徑，你需要拿起神的話，讓經文之光照亮前路。該取出哪件軍裝？', hint: '想一想：全副軍裝中，哪件指的就是神的道？', art: 'shadow', result: '經文之光驅散黑影，小徑重新明亮。' },
]);
export const eventById = id => GARDEN_EVENTS.find(event => event.id === id);
export function shuffled(values) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    // Rejection sampling avoids modulo bias while keeping the daily deck local to this demo.
    const bound = Math.floor(4294967296 / (i + 1)) * (i + 1);
    let value;
    do { value = crypto.getRandomValues(new Uint32Array(1))[0]; } while (value >= bound);
    const j = value % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function eventDeck(boss) {
  return boss ? [...shuffled(['truth', 'justice', 'peace']), ...shuffled(['faith', 'hope', 'word'])] : shuffled(GARDEN_EVENTS.map(event => event.id));
}
