// SCAT practice webhook. Script Properties required:
//   SCAT_TOKEN  — must match site/config.js token
//   SHEET_ID    — Google Sheet for the attempt log
//   GH_PAT      — fine-grained PAT, Contents R/W on the scat-practice repo (for regeneration)
//   GH_REPO     — e.g. "meninder/scat-practice"
const PARENT_EMAIL = "meninder.purewal@gmail.com";
const TOPUP_TO = 26;   // regeneration tops each low strand-tier up to this many items

function prop(k){ return PropertiesService.getScriptProperties().getProperty(k); }

function doPost(e){
  let data;
  try{ data = JSON.parse(e.postData.contents); }
  catch(err){ return out({ok: false, error: "bad json"}); }
  if(!data || data.token !== prop("SCAT_TOKEN")) return out({ok: false, error: "bad token"});

  logToSheet(data);
  sendEmail(data);
  let dispatched = false;
  if((data.lowTiers || []).length && prop("GH_PAT")) dispatched = triggerGeneration(data);
  return out({ok: true, dispatched: dispatched});
}

function out(obj){
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function logToSheet(d){
  const sh = SpreadsheetApp.openById(prop("SHEET_ID")).getSheets()[0];
  if(sh.getLastRow() === 0)
    sh.appendRow(["When","Kid","Level","Verbal","Quant","Total","Seconds","V tier","Q tier","Comebacks","Low tiers"]);
  sh.appendRow([new Date(d.ts), d.kid, d.level, d.v, d.q, d.v + d.q, d.sec,
    d.levels.v, d.levels.q, d.beaten || 0, JSON.stringify(d.lowTiers || [])]);
}

function sendEmail(d){
  const mins = Math.floor(d.sec / 60), secs = ("0" + (d.sec % 60)).slice(-2);
  const frame = d.v + d.q >= 12 ? "a strong sitting" : d.v + d.q >= 9 ? "solid — above the bar for this stretch test" : "a tough one; the test is pitched above grade level on purpose";
  let body = d.kid + " finished sitting on " + new Date(d.ts).toLocaleString() + " — " + frame + ".\n\n" +
    "Verbal " + d.v + "/8 · Quant " + d.q + "/8 · Total " + (d.v + d.q) + "/16 · " + mins + ":" + secs + "\n" +
    "Challenge tiers now: Verbal " + d.levels.v + "/3, Quant " + d.levels.q + "/3" +
    (d.leveledUp && d.leveledUp.length ? "  (moved up: " + d.leveledUp.join(", ") + " 🔥)" : "") + "\n" +
    (d.beaten ? d.kid + " beat " + d.beaten + " question(s) that beat them before.\n" : "") +
    (d.personalBest ? "New personal best.\n" : "");
  if((d.misses || []).length){
    body += "\nTo review together:\n";
    d.misses.forEach(function(m, i){
      body += "\n" + (i + 1) + ". [" + m.type + "] " + m.text + "\n   answered: " + m.your +
              " · correct: " + m.correct + "\n   " + m.why.replace(/<[^>]+>/g, "") + "\n";
    });
  }
  if((d.lowTiers || []).length) body += "\n(Question bank running low for " + d.kid + " — new questions are being generated automatically.)\n";
  MailApp.sendEmail(PARENT_EMAIL, "SCAT: " + d.kid + " " + (d.v + d.q) + "/16" +
    (d.leveledUp && d.leveledUp.length ? " · leveled up 🔥" : ""), body);
}

function triggerGeneration(d){
  const needs = (d.lowTiers || []).map(function(t){
    return {strand: t.strand, tier: t.tier, count: Math.max(8, TOPUP_TO - t.unseen)};
  });
  const resp = UrlFetchApp.fetch("https://api.github.com/repos/" + prop("GH_REPO") + "/dispatches", {
    method: "post",
    contentType: "application/json",
    headers: {Authorization: "Bearer " + prop("GH_PAT"), Accept: "application/vnd.github+json"},
    payload: JSON.stringify({event_type: "bank_low", client_payload: {level: d.level, needs: needs}}),
    muteHttpExceptions: true
  });
  return resp.getResponseCode() === 204;
}
