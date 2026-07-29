import test from "node:test";
import assert from "node:assert/strict";
import {updateLevel, dueReviews, updateReviewQueue, assembleStrand, assembleQuant,
        quantSpreadOk, lowTiers, STRAND_N, LOW_THRESHOLD} from "../site/calibration.js";

// deterministic rng
const seeded = (seed=42) => () => (seed = (seed * 1103515245 + 12345) % 2**31) / 2**31;

const mkV = (n, d) => Array.from({length:n}, (_,i)=>({id:`v-${d}-${i}`, t:"v", d}));
const mkQ = (n, d, ans="A") => Array.from({length:n}, (_,i)=>({id:`q-${d}-${i}-${ans}`, t:"q", d, ans}));
const freshState = (level=2) => ({level, seen:{}, reviewQueue:[], sittingNo:1});

test("ladder: >=7 moves up, capped at 3", () => {
  assert.equal(updateLevel(2,7), 3);
  assert.equal(updateLevel(3,8), 3);
});
test("ladder: <=4 moves down silently, floored at 1", () => {
  assert.equal(updateLevel(2,4), 1);
  assert.equal(updateLevel(1,0), 1);
});
test("ladder: 5-6 holds", () => {
  assert.equal(updateLevel(2,5), 2);
  assert.equal(updateLevel(2,6), 2);
});
test("review queue: wrong answers due 2 sittings later; correct clears and reports beaten", () => {
  let {queue} = updateReviewQueue([], [{id:"a",correct:false},{id:"b",correct:true}], 3);
  assert.deepEqual(queue, [{id:"a", dueAt:5}]);
  assert.deepEqual(dueReviews(queue, 4), []);
  assert.deepEqual(dueReviews(queue, 5), ["a"]);
  const r2 = updateReviewQueue(queue, [{id:"a",correct:true}], 5);
  assert.deepEqual(r2.queue, []);
  assert.deepEqual(r2.beaten, ["a"]);
});
test("review queue: repeat miss re-schedules instead of duplicating", () => {
  let q = updateReviewQueue([{id:"a",dueAt:5}], [{id:"a",correct:false}], 5).queue;
  assert.deepEqual(q, [{id:"a", dueAt:7}]);
});
test("ladder: correct-but-flagged doesn't tier up a strand a clean 7/8 would", () => {
  assert.equal(updateLevel(2, 7, 7), 3);   // clean 7 → up
  assert.equal(updateLevel(2, 7, 6), 2);   // 7 correct but one shaky → holds
  assert.equal(updateLevel(2, 8, 2), 2);   // all correct, mostly shaky → holds, no up
});
test("ladder: flags never tier a strand down (tier-down keyed on wrong answers only)", () => {
  assert.equal(updateLevel(2, 8, 0), 2);   // every correct flagged → no up, no down
  assert.equal(updateLevel(2, 5, 0), 2);   // holds; flags can't push below the 5-6 band
  assert.equal(updateLevel(2, 4, 0), 1);   // genuine <=4 correct still tiers down
});
test("review queue: flagged items come back; correct-but-flagged is not 'beaten'", () => {
  // correct + flagged → scheduled, not beaten
  let r = updateReviewQueue([], [{id:"a",correct:true,flagged:true}], 3);
  assert.deepEqual(r.queue, [{id:"a", dueAt:5}]);
  assert.deepEqual(r.beaten, []);
  // wrong + flagged → scheduled
  r = updateReviewQueue([], [{id:"b",correct:false,flagged:true}], 3);
  assert.deepEqual(r.queue, [{id:"b", dueAt:5}]);
  // an in-queue item answered correct-but-flagged stays (rescheduled), not cleared
  r = updateReviewQueue([{id:"c",dueAt:5}], [{id:"c",correct:true,flagged:true}], 5);
  assert.deepEqual(r.queue, [{id:"c", dueAt:7}]);
  assert.deepEqual(r.beaten, []);
  // correct + not flagged still clears and reports beaten
  r = updateReviewQueue([{id:"d",dueAt:5}], [{id:"d",correct:true,flagged:false}], 5);
  assert.deepEqual(r.queue, []);
  assert.deepEqual(r.beaten, ["d"]);
});
test("assembly: 8 items, mostly current tier, 2 probes one tier up, no repeats", () => {
  const pool = [...mkV(20,1), ...mkV(20,2), ...mkV(20,3)];
  const out = assembleStrand(pool, freshState(2), seeded());
  assert.equal(out.length, STRAND_N);
  assert.equal(new Set(out.map(i=>i.id)).size, STRAND_N);
  assert.equal(out.filter(i=>i.d===3).length, 2);   // probes
  assert.equal(out.filter(i=>i.d===2).length, 6);
});
test("assembly: due review items are included (max 2)", () => {
  const pool = [...mkV(20,2), ...mkV(20,3)];
  const st = {...freshState(2), sittingNo:5,
    seen:{"v-2-0":1,"v-2-1":1,"v-2-2":1},
    reviewQueue:[{id:"v-2-0",dueAt:5},{id:"v-2-1",dueAt:5},{id:"v-2-2",dueAt:5}]};
  const out = assembleStrand(pool, st, seeded());
  const revIn = out.filter(i=>["v-2-0","v-2-1","v-2-2"].includes(i.id));
  assert.equal(revIn.length, 2);
});
test("assembly: tier-3 kids probe within tier 3 and still get 8", () => {
  const pool = [...mkV(20,2), ...mkV(20,3)];
  const out = assembleStrand(pool, freshState(3), seeded());
  assert.equal(out.length, 8);
  assert.equal(out.filter(i=>i.d===3).length, 8);
});
test("assembly: exhausted tier falls back to other tiers then least-recently-seen", () => {
  const pool = [...mkV(4,2), ...mkV(3,3), ...mkV(3,1)];
  const st = freshState(2);
  const out = assembleStrand(pool, st, seeded());
  assert.equal(out.length, 8);                       // 10 unseen available, takes 8
  const seenAll = Object.fromEntries(pool.map((p,i)=>[p.id, i+1]));
  const out2 = assembleStrand(pool, {...freshState(2), seen:seenAll, sittingNo:11}, seeded());
  assert.equal(out2.length, 8);                      // reuses least-recently-seen
});
test("quant spread: <=2 D and >=2 distinct A/B/C keys", () => {
  assert.equal(quantSpreadOk(mkQ(8,2,"A")), false);
  assert.equal(quantSpreadOk([...mkQ(3,2,"A"),...mkQ(3,2,"B"),...mkQ(1,2,"C"),...mkQ(1,2,"D")]), true);
  assert.equal(quantSpreadOk([...mkQ(5,2,"A"),...mkQ(3,2,"D")]), false);
});
test("assembleQuant satisfies spread when the pool allows it", () => {
  const pool = [...mkQ(10,2,"A"), ...mkQ(10,2,"B"), ...mkQ(6,2,"C"), ...mkQ(4,2,"D"),
                ...mkQ(5,3,"A"), ...mkQ(5,3,"B")];
  const out = assembleQuant(pool, freshState(2), seeded());
  assert.equal(out.length, 8);
  assert.ok(quantSpreadOk(out));
});
test("lowTiers flags a strand whose current-tier unseen pool dips below threshold", () => {
  const bank = [...mkV(LOW_THRESHOLD-1, 2), ...mkQ(LOW_THRESHOLD+5, 2, "A")];
  const low = lowTiers(bank, {levels:{v:2,q:2}, seen:{}});
  assert.deepEqual(low, [{strand:"v", tier:2, unseen:LOW_THRESHOLD-1}]);
});
