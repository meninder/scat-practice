import {CONFIG} from "./config.js";
import {assembleStrand, assembleQuant, updateLevel, updateReviewQueue, lowTiers} from "./calibration.js";

const $ = s => document.querySelector(s);
const QUANT_CHOICES = [
  "Quantity A is greater", "Quantity B is greater",
  "The two quantities are equal", "Cannot be determined from the information given"];
const QI = {A: 0, B: 1, C: 2, D: 3};
const cap = s => s[0].toUpperCase() + s.slice(1);

let KID = null, BANK = null, S = null;
let SET = null, idx = 0, answers = [], t0 = 0, timerId = null, qTime = [], qStart = 0;

// ---------- per-kid persistent state ----------
const storeKey = id => `scat_${id}_v1`;
function loadState(kid){
  try{
    const raw = localStorage.getItem(storeKey(kid.id));
    if(raw) return JSON.parse(raw);
  }catch(e){}
  return {history: [], sittingNo: 0, levels: {...kid.start}, seen: {},
          reviewQueue: {v: [], q: []}, beaten: 0, skills: {}, pending: []};
}
function saveState(){ localStorage.setItem(storeKey(KID.id), JSON.stringify(S)); }

// ---------- PIN gate ----------
async function sha256hex(s){
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
}
async function tryPin(){
  const pin = $("#pinInput").value.trim();
  if(await sha256hex(CONFIG.pinSalt + pin) === CONFIG.pinHash){
    localStorage.setItem("scat_unlocked", CONFIG.pinHash);
    const tok = await sha256hex(CONFIG.pinSalt + pin + ":webhook");
    localStorage.setItem("scat_token", tok);
    renderPick(); show("pick");
  }else{
    $("#pinErr").textContent = "That's not it — try again.";
    $("#pinInput").value = "";
  }
}

function show(id){
  ["gate", "pick", "home", "test", "results"].forEach(s =>
    $("#" + s).classList.toggle("hidden", s !== id));
  window.scrollTo(0, 0);
}

// ---------- profile picker ----------
const weekCount = st => st.history.filter(h => Date.now() - h.ts < 7 * 864e5).length;
function renderPick(){
  const host = $("#kidGrid"); host.innerHTML = "";
  CONFIG.kids.forEach(k => {
    const st = loadState(k);
    const sub = st.history.length
      ? `${st.history.length} sittings · ${weekCount(st)} this week`
      : "Ready for the first one";
    const b = document.createElement("button");
    b.className = "exam";
    b.innerHTML = `<span class="no">${k.name}</span><span class="lbl">${cap(k.level)} level</span><span class="done">${sub}</span>`;
    b.onclick = () => selectKid(k);
    host.appendChild(b);
  });
}

async function selectKid(k){
  KID = k; S = loadState(k);
  if(!BANK || BANK.level !== k.level){
    const res = await fetch(`data/${k.level}.json`, {cache: "no-cache"});
    BANK = await res.json();
  }
  flushPending();
  renderHome(); show("home");
}

// ---------- home ----------
function renderHome(){
  $("#homeEyebrow").textContent = `${cap(KID.level)} level · SCAT practice`;
  $("#homeTitle").textContent = `Hi, ${KID.name}`;
  const wk = weekCount(S);
  $("#homeSub").textContent = wk >= 4
    ? `${wk} sittings this week — target hit. Anything more is bonus.`
    : `${wk} of 4 sittings this week. Short and steady wins.`;
  $("#levelRow").innerHTML =
    `<span class="chip">Verbal challenge <b>level ${S.levels.v}</b>/3</span>` +
    `<span class="chip">Quant challenge <b>level ${S.levels.q}</b>/3</span>` +
    (S.beaten ? `<span class="chip">🏆 <b>${S.beaten}</b> comeback${S.beaten === 1 ? "" : "s"}</span>` : "");
  renderHistory(); renderMastery();
}
function renderHistory(){
  const box = $("#histBox");
  if(!S.history.length){
    box.innerHTML = `<div class="empty">No sittings yet. Finish one and it'll show up here so you can watch the trend.</div>`;
    return;
  }
  const rows = S.history.slice().reverse().slice(0, 12).map(h => {
    const d = new Date(h.ts);
    const mm = Math.floor(h.sec / 60), ss = String(h.sec % 60).padStart(2, "0");
    return `<tr><td>${d.getMonth() + 1}/${d.getDate()}</td><td class="score">${h.v}/8</td><td class="score">${h.q}/8</td><td class="score">${h.v + h.q}/16</td><td>${mm}:${ss}</td></tr>`;
  }).join("");
  box.innerHTML = `<table><thead><tr><th>Date</th><th>Verbal</th><th>Quant</th><th>Total</th><th>Time</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function renderMastery(){
  const box = $("#masteryBox");
  const entries = Object.entries(S.skills).filter(([, s]) => s.r + s.w >= 3)
    .map(([k, s]) => [k, s.r / (s.r + s.w), s.r + s.w])
    .sort((a, b) => b[1] - a[1]);
  if(!entries.length){
    box.innerHTML = `<div class="empty">After a few sittings you'll see which skills are strongest here.</div>`;
    return;
  }
  box.innerHTML = entries.slice(0, 8).map(([k, p, n]) =>
    `<div class="mrow"><span>${k.replace(/-/g, " ")}</span><span class="mbar">${"●".repeat(Math.round(p * 5)).padEnd(5, "○")} ${n} seen</span></div>`).join("");
}

// ---------- sitting ----------
function shuffleChoices(q){
  const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
  return {...q, ch: order.map(i => q.ch[i]), ans: order.indexOf(q.ans)};
}
function startSitting(){
  const sittingNo = S.sittingNo + 1;
  const vs = assembleStrand(BANK.items.filter(i => i.t === "v"),
    {level: S.levels.v, seen: S.seen, reviewQueue: S.reviewQueue.v, sittingNo}).map(shuffleChoices);
  const qs = assembleQuant(BANK.items.filter(i => i.t === "q"),
    {level: S.levels.q, seen: S.seen, reviewQueue: S.reviewQueue.q, sittingNo});
  SET = {questions: [...vs, ...qs], sittingNo};
  idx = 0; answers = new Array(SET.questions.length).fill(null);
  qTime = new Array(SET.questions.length).fill(0); qStart = 0;
  t0 = Date.now();
  if(timerId) clearInterval(timerId);
  timerId = setInterval(updateTimer, 1000); updateTimer();
  show("test"); renderQuestion();
}
function updateTimer(){
  const s = Math.floor((Date.now() - t0) / 1000);
  $("#timer").textContent = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}
function commitTime(){ if(qStart){ qTime[idx] = (qTime[idx] || 0) + (Date.now() - qStart) / 1000; qStart = 0; } }

function renderQuestion(){
  const q = SET.questions[idx];
  const isV = q.t === "v";
  $("#secTag").textContent = isV ? "Verbal · Analogy" : "Quantitative · Comparison";
  $("#secTag").className = "sectiontag" + (isV ? "" : " q");
  $("#counter").textContent = `Question ${idx + 1} of ${SET.questions.length}`;
  $("#progFill").style.width = (100 * idx / SET.questions.length) + "%";
  const host = $("#qhost");
  host.innerHTML = isV
    ? `<div class="qcard fade">
        <div class="analogy"><span class="w">${q.a}</span><span class="sep">:</span><span class="w">${q.b}</span>
        <span class="sep">::</span><span class="w">${q.c}</span><span class="sep">:</span><span class="blank">?</span></div>
        <div class="qhint">Which word completes the analogy in the same way?</div>
        <div class="choices">${q.ch.map((c, i) => choiceHTML(i, c)).join("")}</div></div>`
    : `<div class="qcard fade">
        ${q.ctx ? `<div class="qcontext">${q.ctx}</div>` : ""}
        <div class="compare"><div class="col"><div class="lab">Quantity A</div><div class="val">${q.A}</div></div>
        <div class="vs">vs</div><div class="col"><div class="lab">Quantity B</div><div class="val">${q.B}</div></div></div>
        <div class="choices">${QUANT_CHOICES.map((c, i) => choiceHTML(i, c)).join("")}</div></div>`;
  host.querySelectorAll(".choice").forEach(el => {
    el.onclick = () => { answers[idx] = parseInt(el.dataset.i); markSelected(); };
  });
  markSelected();
  $("#prevBtn").disabled = idx === 0;
  const last = idx === SET.questions.length - 1;
  $("#nextBtn").textContent = last ? "Finish & score" : "Next";
  $("#nextBtn").className = "btn" + (last ? " finish" : "");
  qStart = Date.now();
}
function choiceHTML(i, label){
  return `<button class="choice" data-i="${i}"><span class="key">${i + 1}</span><span>${label}</span></button>`;
}
function markSelected(){
  document.querySelectorAll("#qhost .choice").forEach(el =>
    el.classList.toggle("sel", parseInt(el.dataset.i) === answers[idx]));
}
function goPrev(){ if(idx > 0){ commitTime(); idx--; renderQuestion(); } }
function goNext(){ commitTime(); if(idx < SET.questions.length - 1){ idx++; renderQuestion(); } else finish(); }

// ---------- finish ----------
function correctIndex(q){ return q.t === "v" ? q.ans : QI[q.ans]; }
function finish(){
  if(timerId) clearInterval(timerId);
  const sec = Math.floor((Date.now() - t0) / 1000);
  let v = 0, qn = 0;
  const results = {v: [], q: []}, misses = [];
  SET.questions.forEach((q, i) => {
    const ok = answers[i] === correctIndex(q);
    results[q.t].push({id: q.id, correct: ok});
    const sk = S.skills[q.skill] || {r: 0, w: 0};
    ok ? sk.r++ : sk.w++;
    S.skills[q.skill] = sk;
    if(ok){ q.t === "v" ? v++ : qn++; }
    else misses.push({
      type: q.t === "v" ? "Verbal" : "Quantitative",
      text: q.t === "v" ? `${q.a} : ${q.b} :: ${q.c} : ?` : `${q.ctx ? "(" + q.ctx + ") " : ""}${q.A}  vs  ${q.B}`,
      your: answers[i] === null ? "left blank" : (q.t === "v" ? q.ch[answers[i]] : QUANT_CHOICES[answers[i]]),
      correct: q.t === "v" ? q.ch[q.ans] : QUANT_CHOICES[QI[q.ans]],
      why: q.why});
  });

  const rv = updateReviewQueue(S.reviewQueue.v, results.v, SET.sittingNo);
  const rq = updateReviewQueue(S.reviewQueue.q, results.q, SET.sittingNo);
  S.reviewQueue = {v: rv.queue, q: rq.queue};
  const beatenNow = rv.beaten.length + rq.beaten.length;
  S.beaten += beatenNow;

  const leveledUp = [];
  const newV = updateLevel(S.levels.v, v), newQ = updateLevel(S.levels.q, qn);
  if(newV > S.levels.v) leveledUp.push("Verbal");
  if(newQ > S.levels.q) leveledUp.push("Quantitative");
  const atTop = (v >= 7 && S.levels.v === 3) || (qn >= 7 && S.levels.q === 3);
  S.levels = {v: newV, q: newQ};

  SET.questions.forEach(q => { S.seen[q.id] = SET.sittingNo; });
  S.sittingNo = SET.sittingNo;
  const personalBest = S.history.length > 0 && v + qn > Math.max(...S.history.map(h => h.v + h.q));
  S.history.push({ts: Date.now(), v, q: qn, sec, levels: {...S.levels}});
  saveState();

  renderResults({v, qn, sec, leveledUp, beatenNow, personalBest, atTop});
  postResult({token: localStorage.getItem("scat_token") || "", kid: KID.name, kidId: KID.id, level: KID.level,
    ts: Date.now(), v, q: qn, sec, levels: S.levels, leveledUp, beaten: beatenNow,
    personalBest, misses, lowTiers: lowTiers(BANK.items, {levels: S.levels, seen: S.seen})});
}

function grade(total){
  if(total >= 15) return "Excellent";
  if(total >= 12) return "Strong";
  if(total >= 9)  return "Solid — above the bar";
  return "Good reps. This test is meant to be hard.";
}
function renderResults(r){
  const d = new Date();
  $("#resEyebrow").textContent = `${KID.name} · Sitting ${SET.sittingNo} · ` +
    d.toLocaleDateString(undefined, {month: "short", day: "numeric"});
  $("#resTitle").textContent = grade(r.v + r.qn);
  const parts = [];
  if(r.leveledUp.length) parts.push(`🔥 ${r.leveledUp.join(" and ")} moved up to challenge level ${r.leveledUp.includes("Verbal") ? S.levels.v : S.levels.q}!`);
  if(r.atTop) parts.push(`⭐ Holding the top of the ${cap(KID.level)} range.`);
  if(r.beatenNow) parts.push(`🏆 You just beat ${r.beatenNow} question${r.beatenNow === 1 ? "" : "s"} that beat you before — ${S.beaten} total.`);
  if(r.personalBest) parts.push(`📈 New personal best.`);
  $("#celebrate").innerHTML = parts.join("<br>");
  $("#celebrate").classList.toggle("hidden", !parts.length);
  $("#vScore").innerHTML = `${r.v}<small>/8</small>`;
  $("#qScore").innerHTML = `${r.qn}<small>/8</small>`;
  $("#vPct").textContent = r.v >= 7 ? "pushing the boundary" : r.v >= 5 ? "right in the stretch zone" : "building";
  $("#qPct").textContent = r.qn >= 7 ? "pushing the boundary" : r.qn >= 5 ? "right in the stretch zone" : "building";
  const mm = Math.floor(r.sec / 60), ss = String(r.sec % 60).padStart(2, "0");
  $("#resMeta").innerHTML = `<b>${r.v + r.qn}/16</b> · total ${mm}:${ss} (~${Math.round(r.sec / 16)}s/question; test pace ≈25s)`;
  renderReview();
  show("results");
}
function renderReview(){
  const host = $("#reviewHost"); host.innerHTML = "";
  SET.questions.forEach((q, i) => {
    const isV = q.t === "v";
    const correct = correctIndex(q);
    const noAns = answers[i] === null;
    const ok = !noAns && answers[i] === correct;
    const state = noAns ? "missed" : ok ? "ok" : "no";
    const yourTxt = noAns ? "—" : (isV ? q.ch[answers[i]] : QUANT_CHOICES[answers[i]]);
    const corTxt = isV ? q.ch[correct] : QUANT_CHOICES[correct];
    const head = isV
      ? `<span class="cap">${q.a}</span> <span class="sep">:</span> <span class="cap">${q.b}</span> <span class="sep">::</span> <span class="cap">${q.c}</span> <span class="sep">:</span> <b>${corTxt.toUpperCase()}</b>`
      : `${q.ctx ? `<span class="qctx">(${q.ctx})</span> &nbsp;` : ""}<span class="mono">${q.A}</span> &nbsp;vs&nbsp; <span class="mono">${q.B}</span>`;
    const el = document.createElement("div");
    el.className = "ritem " + state;
    el.innerHTML = `
      <div class="qline"><span class="num">${i + 1}.</span> ${head}<span class="tag ${state}">${noAns ? "missed" : ok ? "correct" : "wrong"}</span><span class="tchip">${Math.round(qTime[i] || 0)}s</span></div>
      ${ok ? "" : `<div class="ans">${noAns ? '<span class="cgrey">Left blank</span>' : 'Your answer: <span class="you">' + yourTxt + "</span>"}</div>`}
      <div class="ans">Correct: <span class="cor">${corTxt}</span></div>
      <div class="why">${q.why}</div>`;
    host.appendChild(el);
  });
}

// ---------- webhook with offline retry ----------
async function postResult(payload){
  S.pending.push(payload); saveState();
  await flushPending();
}
async function flushPending(){
  if(!CONFIG.webhookUrl.startsWith("http") || !S.pending.length) return;
  const remaining = [];
  for(const p of S.pending){
    try{
      const r = await fetch(CONFIG.webhookUrl, {method: "POST",
        headers: {"Content-Type": "text/plain;charset=utf-8"}, body: JSON.stringify(p)});
      if(!r.ok) remaining.push(p);
    }catch(e){ remaining.push(p); }
  }
  S.pending = remaining; saveState();
}

// ---------- wiring ----------
$("#pinBtn").onclick = tryPin;
$("#pinInput").addEventListener("keydown", e => { if(e.key === "Enter") tryPin(); });
$("#startBtn").onclick = startSitting;
$("#switchBtn").onclick = () => { renderPick(); show("pick"); };
$("#prevBtn").onclick = goPrev;
$("#nextBtn").onclick = goNext;
$("#homeBtn").onclick = () => { renderHome(); show("home"); };
$("#printBtn").onclick = () => window.print();
document.addEventListener("keydown", e => {
  if($("#test").classList.contains("hidden")) return;
  if(["1", "2", "3", "4"].includes(e.key)){ answers[idx] = parseInt(e.key) - 1; markSelected(); }
  else if(e.key === "ArrowLeft") goPrev();
  else if(e.key === "ArrowRight" || e.key === "Enter") goNext();
});

(function boot(){
  if(localStorage.getItem("scat_unlocked") === CONFIG.pinHash && CONFIG.pinHash){
    renderPick(); show("pick");
  }else show("gate");
})();
