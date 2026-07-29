// Pure calibration + sitting-assembly logic. No DOM, no storage — shared by app and tests.
export const STRAND_N = 8;
export const PROBES = 2;
export const LOW_THRESHOLD = 10;

// score      = clean correct count for the strand (drives tier-down)
// cleanScore = correct-and-not-flagged count (drives tier-up); a correct-but-flagged
//   ("shaky") item counts toward score but NOT cleanScore, so it can't tier a strand up.
//   Flags never tier a strand down — tier-down stays keyed on actual wrong answers.
export function updateLevel(level, score, cleanScore = score){
  if(cleanScore >= 7) return Math.min(3, level + 1);
  if(score <= 4) return Math.max(1, level - 1);
  return level;
}

export function dueReviews(queue, sittingNo){
  return queue.filter(r => r.dueAt <= sittingNo).map(r => r.id);
}

// results: [{id, correct, flagged}]. A flagged item (correct or not) is scheduled
// to come back, mirroring how misses are queued. Only a correct-AND-not-flagged item
// clears the queue and counts as "beaten".
export function updateReviewQueue(queue, results, sittingNo){
  const next = [...queue], beaten = [];
  for(const r of results){
    const i = next.findIndex(e => e.id === r.id);
    if(r.correct && !r.flagged){
      if(i >= 0){ next.splice(i, 1); beaten.push(r.id); }
    }else{
      const entry = {id: r.id, dueAt: sittingNo + 2};
      if(i >= 0) next[i] = entry; else next.push(entry);
    }
  }
  return {queue: next, beaten};
}

function shuffle(arr, rng){
  const c = [...arr];
  for(let i = c.length - 1; i > 0; i--){
    const j = Math.floor(rng() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c;
}

export function assembleStrand(pool, state, rng = Math.random){
  const {level, seen, reviewQueue, sittingNo} = state;
  const byId = new Map(pool.map(it => [it.id, it]));
  const picked = [], used = new Set();
  const take = it => { picked.push(it); used.add(it.id); };
  const unseenAt = d => shuffle(pool.filter(it => it.d === d && !(it.id in seen) && !used.has(it.id)), rng);

  for(const id of dueReviews(reviewQueue, sittingNo).slice(0, 2)){
    const it = byId.get(id);
    if(it) take(it);
  }
  const probeTier = Math.min(3, level + 1);
  for(const it of unseenAt(probeTier).slice(0, PROBES)) take(it);
  for(const it of unseenAt(level)){ if(picked.length >= STRAND_N) break; take(it); }
  if(picked.length < STRAND_N){
    const others = [probeTier, level - 1, level + 1, level - 2, level + 2]
      .filter((d, i, a) => d >= 1 && d <= 3 && d !== level && a.indexOf(d) === i);
    for(const d of others){
      for(const it of unseenAt(d)){ if(picked.length >= STRAND_N) break; take(it); }
      if(picked.length >= STRAND_N) break;
    }
  }
  if(picked.length < STRAND_N){
    const lru = pool.filter(it => !used.has(it.id)).sort((x, y) => (seen[x.id] || 0) - (seen[y.id] || 0));
    for(const it of lru){ if(picked.length >= STRAND_N) break; take(it); }
  }
  return shuffle(picked, rng).slice(0, STRAND_N);
}

export function quantSpreadOk(items){
  const keys = items.map(it => it.ans);
  const nD = keys.filter(k => k === "D").length;
  const abc = new Set(keys.filter(k => k !== "D"));
  return nD <= 2 && abc.size >= 2;
}

export function assembleQuant(pool, state, rng = Math.random){
  let last = [];
  for(let i = 0; i < 30; i++){
    last = assembleStrand(pool, state, rng);
    if(quantSpreadOk(last)) return last;
  }
  return last;
}

export function lowTiers(bank, state){
  const low = [];
  for(const strand of ["v", "q"]){
    const tier = state.levels[strand === "v" ? "v" : "q"];
    const unseen = bank.filter(it => it.t === strand && it.d === tier && !(it.id in state.seen)).length;
    if(unseen < LOW_THRESHOLD) low.push({strand, tier, unseen});
  }
  return low;
}
