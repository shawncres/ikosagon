// PR 103: a lesson's questions sit in their own pane after the reading (Continue), and the card is earned only once a
// whole round is right. passCheck(page) taps Continue and answers every question right, reading the answers from the
// lesson store on the device (any learner's lessons key). PR 109: the pass itself earns the card (no "I've got it"), so a
// suite goes straight on to the confirmation and Where next. o.noWait: return right after the last answer.
export async function passCheck(p, o = {}) {
  if (await p.isVisible("#l-cont")) { await p.click("#l-cont"); await p.waitForTimeout(150); }
  const ans = await p.evaluate((wrong) => {
    const legends = [...document.querySelectorAll("#l-quiz legend")].map((l) => l.textContent);
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!/lessons/.test(k)) continue;
      let all = {}; try { all = JSON.parse(localStorage.getItem(k) || "{}") || {}; } catch { all = {}; }
      for (const id of Object.keys(all)) {
        const qs = (all[id] && (all[id].cur || all[id].qs)) || [];
        if (qs.length && qs.length === legends.length && qs.every((q, j) => q && q.q === legends[j])) return qs.map((q) => (wrong ? (q.answer + 1) % q.options.length : q.answer));
      }
    }
    return null;
  }, Boolean(o.wrong));
  if (!ans) return false;
  for (let i = 0; i < ans.length; i++) {
    const q = p.locator("#l-quiz .q").nth(i);
    if (await q.locator("input:checked").count()) continue;
    await q.locator("input").nth(ans[i]).check();
    await p.waitForTimeout(80);
  }
  if (!o.noWait) await p.waitForTimeout(200);
  return true;
}
