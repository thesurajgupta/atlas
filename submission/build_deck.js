const pptxgen = require("pptxgenjs");

// ---------------------------------------------------------------- palette
// Institutional navy dominant; amber reserved for risk/alert, which is what the
// product is actually about. Semantic, not decorative.
const NAVY   = "1B2A4A";
const DEEP   = "0F1729";
const ICE    = "CFE0F5";
const AMBER  = "E8973A";
const WHITE  = "FFFFFF";
const OFF    = "F7F9FC";
const SLATE  = "5A6B85";
const GREEN  = "2E7D5B";

const HEAD = "Cambria";
const BODY = "Calibri";

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";           // 13.3 x 7.5
pres.author = "ATLAS Team";
pres.title  = "ATLAS — Team Kickoff";

const W = 13.3, H = 7.5, M = 0.75;

// ---------------------------------------------------------------- helpers
function titleSlide(s, kicker, title, sub) {
  s.background = { color: DEEP };
  s.addText(kicker, { x: M, y: 1.7, w: 8, h: 0.3, fontSize: 12, color: AMBER,
    fontFace: BODY, bold: true, charSpacing: 3, isTextBox: true, margin: 0 });
  s.addText(title, { x: M, y: 2.15, w: 11, h: 1.6, fontSize: 54, color: WHITE,
    fontFace: HEAD, bold: true, isTextBox: true, margin: 0 });
  s.addText(sub, { x: M, y: 3.9, w: 9.5, h: 1.1, fontSize: 17, color: ICE,
    fontFace: BODY, isTextBox: true, margin: 0, lineSpacingMultiple: 1.3 });
}

function sectionHeader(s, kicker, title) {
  s.background = { color: WHITE };
  s.addText(kicker, { x: M, y: 0.55, w: 8, h: 0.28, fontSize: 11, color: AMBER,
    fontFace: BODY, bold: true, charSpacing: 3, isTextBox: true, margin: 0 });
  s.addText(title, { x: M, y: 0.88, w: 11.8, h: 0.9, fontSize: 36, color: NAVY,
    fontFace: HEAD, bold: true, isTextBox: true, margin: 0 });
}

// Person card: circular initial badge + name + role + what they own.
function personCard(s, x, y, w, initials, name, role, owns, badgeColor) {
  s.addShape(pres.ShapeType.roundRect, { x, y, w, h: 2.5, rectRadius: 0.12,
    fill: { color: OFF }, line: { color: "E2E8F2", width: 1 } });
  s.addShape(pres.ShapeType.ellipse, { x: x + 0.3, y: y + 0.3, w: 0.72, h: 0.72,
    fill: { color: badgeColor } });
  s.addText(initials, { x: x + 0.3, y: y + 0.3, w: 0.72, h: 0.72, fontSize: 20,
    color: WHITE, fontFace: HEAD, bold: true, align: "center", valign: "middle",
    isTextBox: true, margin: 0 });
  s.addText(name, { x: x + 1.15, y: y + 0.32, w: w - 1.4, h: 0.34, fontSize: 19,
    color: NAVY, fontFace: HEAD, bold: true, isTextBox: true, margin: 0 });
  s.addText(role, { x: x + 1.15, y: y + 0.66, w: w - 1.4, h: 0.3, fontSize: 12,
    color: AMBER, fontFace: BODY, bold: true, charSpacing: 1.5, isTextBox: true, margin: 0 });
  s.addText(owns, { x: x + 0.32, y: y + 1.2, w: w - 0.62, h: 1.1, fontSize: 12.5,
    color: SLATE, fontFace: BODY, isTextBox: true, margin: 0, lineSpacingMultiple: 1.25 });
}

// ================================================================ 5. THE TEAM
{
  const s = pres.addSlide();
  sectionHeader(s, "THE TEAM", "Six people, five streams, one main branch");

  personCard(s, M,      1.85, 3.85, "S",  "Suraj",   "LEAD · FULL STACK",
    "Architecture, ML, security. Auth, audit, API, prediction engine.", NAVY);
  personCard(s, M+4.05, 1.85, 3.85, "SN", "Sneha",   "BACKEND",
    "Synthetic simulator: population, geography, cash-out endpoints.", "31507A");
  personCard(s, M+8.10, 1.85, 3.85, "VJ", "Vijay",   "BACKEND",
    "Fraud typology generators and data realism validation.", "31507A");
  personCard(s, M,      4.55, 3.85, "VD", "Vidushi", "FRONTEND · ML",
    "Case workspace, and the metrics we are judged by.", "6B3FA0");
  personCard(s, M+4.05, 4.55, 3.85, "L",  "Lucky",   "FRONTEND",
    "Risk map, H3 heat layer and jurisdiction views.", "1C6E7D");
  personCard(s, M+8.10, 4.55, 3.85, "RK", "Raj",     "FRONTEND · PRESENTATION",
    "Money-trail graph view, architecture diagrams, the deck.", "1C6E7D");
  s.addNotes("Nobody is locked to their column. CODEOWNERS requests a reviewer, it does not restrict who may change what.");
}

// ================================================================ 6. BACKEND
{
  const s = pres.addSlide();
  sectionHeader(s, "SNEHA  ·  VIJAY", "Backend — build the world the model learns from");

  s.addText("We have no real data, and we never will — it is citizen financial data. So we generate it. Every number this project ever reports rests on this work.",
    { x: M, y: 1.85, w: 11.5, h: 0.7, fontSize: 15, color: SLATE, fontFace: BODY,
      isTextBox: true, margin: 0, lineSpacingMultiple: 1.3 });

  const tasks = [
    ["1", "Geography and endpoints", "States, districts, ATMs — and AePS agents,\nwhich is where most cash-out now happens.", "Issue #4"],
    ["2", "Fraud typologies", "Digital arrest, UPI fraud, investment scam.\nEach moves money differently.", "Issue #5"],
    ["3", "Realism validation", "Prove the data is not giving away the answer.\nThe most important gate we have.", "Issue #6"],
  ];
  tasks.forEach(([n, t, d, iss], i) => {
    const y = 2.75 + i * 1.28;
    s.addShape(pres.ShapeType.ellipse, { x: M, y: y + 0.12, w: 0.6, h: 0.6, fill: { color: "31507A" } });
    s.addText(n, { x: M, y: y + 0.12, w: 0.6, h: 0.6, fontSize: 18, color: WHITE,
      fontFace: HEAD, bold: true, align: "center", valign: "middle", isTextBox: true, margin: 0 });
    s.addText(t, { x: M + 0.85, y, w: 5.2, h: 0.38, fontSize: 17, color: NAVY,
      fontFace: HEAD, bold: true, isTextBox: true, margin: 0 });
    s.addText(d, { x: M + 0.85, y: y + 0.4, w: 7.4, h: 0.7, fontSize: 12.5, color: SLATE,
      fontFace: BODY, isTextBox: true, margin: 0, lineSpacingMultiple: 1.15 });
    s.addText(iss, { x: 11.3, y: y + 0.05, w: 1.3, h: 0.35, fontSize: 12, color: AMBER,
      fontFace: BODY, bold: true, align: "right", isTextBox: true, margin: 0 });
  });
  s.addNotes("Start with #4. It has no dependency on anyone else's work, so they are never blocked waiting for me.");
}

// ================================================================ 7. FRONTEND
{
  const s = pres.addSlide();
  sectionHeader(s, "VIDUSHI  ·  LUCKY  ·  RAJ", "Make it look like a government system");

  s.addText("Start now against mock data. You do not need the backend. The visual language is the thing to get right early — polish never survives being left to the end.",
    { x: M, y: 1.85, w: 11.5, h: 0.7, fontSize: 15, color: SLATE, fontFace: BODY,
      isTextBox: true, margin: 0, lineSpacingMultiple: 1.3 });

  const tasks = [
    ["VD", "Design system and case workspace", "Dense, restrained, serious. Colour only for risk.\nAlso on ML metrics — issue #18.", "Issue #7"],
    ["L",  "Risk map and drill-down", "Hex risk layer over the map, plus a treemap.\nMap answers where, treemap answers how much.", "Issue #8"],
    ["RK", "Money-trail graph view", "Follow the money: victim to mule to ATM.\nTyped nodes, click to expand one step at a time.", "Issue #17"],
  ];
  tasks.forEach(([n, t, d, iss], i) => {
    const y = 2.62 + i * 1.12;
    s.addShape(pres.ShapeType.ellipse, { x: M, y: y + 0.12, w: 0.6, h: 0.6, fill: { color: "1C6E7D" } });
    s.addText(n, { x: M, y: y + 0.12, w: 0.6, h: 0.6, fontSize: 15, color: WHITE,
      fontFace: HEAD, bold: true, align: "center", valign: "middle", isTextBox: true, margin: 0 });
    s.addText(t, { x: M + 0.85, y, w: 6.5, h: 0.38, fontSize: 17, color: NAVY,
      fontFace: HEAD, bold: true, isTextBox: true, margin: 0 });
    s.addText(d, { x: M + 0.85, y: y + 0.4, w: 7.4, h: 0.72, fontSize: 12.5, color: SLATE,
      fontFace: BODY, isTextBox: true, margin: 0, lineSpacingMultiple: 1.15 });
    s.addText(iss, { x: 11.3, y: y + 0.05, w: 1.3, h: 0.35, fontSize: 12, color: AMBER,
      fontFace: BODY, bold: true, align: "right", isTextBox: true, margin: 0 });
  });

  s.addShape(pres.ShapeType.roundRect, { x: M, y: 6.05, w: 11.8, h: 1.0, rectRadius: 0.1,
    fill: { color: NAVY } });
  s.addText("One hard rule: a weak prediction must never look like a strong one.",
    { x: M + 0.4, y: 6.18, w: 11, h: 0.32, fontSize: 14.5, color: AMBER, fontFace: BODY,
      bold: true, isTextBox: true, margin: 0 });
  s.addText("Four confidence states, four visibly different treatments. Never let an officer act on a guess that looked like evidence.",
    { x: M + 0.4, y: 6.5, w: 11, h: 0.42, fontSize: 12.5, color: ICE, fontFace: BODY,
      isTextBox: true, margin: 0 });
  s.addNotes("This is a tested requirement, not a preference. There is a UI test that fails if the four states render the same.");
}

// ================================================================ 8. RAJ + SURAJ
{
  const s = pres.addSlide();
  sectionHeader(s, "RAJ  ·  SURAJ", "The graph view, the deck, and the core engine");

  s.addShape(pres.ShapeType.roundRect, { x: M, y: 1.9, w: 5.8, h: 3.9, rectRadius: 0.12,
    fill: { color: OFF }, line: { color: "E2E8F2", width: 1 } });
  s.addShape(pres.ShapeType.ellipse, { x: M + 0.35, y: 2.2, w: 0.66, h: 0.66, fill: { color: AMBER } });
  s.addText("RK", { x: M + 0.35, y: 2.2, w: 0.66, h: 0.66, fontSize: 17, color: WHITE,
    fontFace: HEAD, bold: true, align: "center", valign: "middle", isTextBox: true, margin: 0 });
  s.addText("Raj", { x: M + 1.15, y: 2.22, w: 4.4, h: 0.4, fontSize: 21, color: NAVY,
    fontFace: HEAD, bold: true, isTextBox: true, margin: 0 });
  s.addText("FRONTEND · PRESENTATION", { x: M + 1.15, y: 2.6, w: 4.4, h: 0.3, fontSize: 11,
    color: AMBER, fontFace: BODY, bold: true, charSpacing: 1.5, isTextBox: true, margin: 0 });
  [ "Money-trail graph view — issue #17",
    "Architecture diagrams — issue #9",
    "Owns the SIH deck and demo run-sheet",
    "Judge questions and answers",
  ].forEach((t, i) => {
    s.addText(t, { x: M + 0.4, y: 3.25 + i * 0.55, w: 5.1, h: 0.45, fontSize: 13,
      color: SLATE, fontFace: BODY, bullet: true, isTextBox: true, margin: 0 });
  });

  s.addShape(pres.ShapeType.roundRect, { x: M + 6.05, y: 1.9, w: 5.8, h: 3.9, rectRadius: 0.12,
    fill: { color: NAVY } });
  s.addShape(pres.ShapeType.ellipse, { x: M + 6.4, y: 2.2, w: 0.66, h: 0.66, fill: { color: AMBER } });
  s.addText("S", { x: M + 6.4, y: 2.2, w: 0.66, h: 0.66, fontSize: 19, color: WHITE,
    fontFace: HEAD, bold: true, align: "center", valign: "middle", isTextBox: true, margin: 0 });
  s.addText("Suraj", { x: M + 7.2, y: 2.22, w: 4.4, h: 0.4, fontSize: 21, color: WHITE,
    fontFace: HEAD, bold: true, isTextBox: true, margin: 0 });
  s.addText("LEAD · ML · SECURITY", { x: M + 7.2, y: 2.6, w: 4.4, h: 0.3, fontSize: 11,
    color: AMBER, fontFace: BODY, bold: true, charSpacing: 1.5, isTextBox: true, margin: 0 });
  [ "Authentication and tamper-evident audit",
    "API, entity resolution, money-flow graph",
    "The three-tier prediction engine",
    "Honest evaluation and security hardening",
  ].forEach((t, i) => {
    s.addText(t, { x: M + 6.45, y: 3.25 + i * 0.55, w: 5.1, h: 0.45, fontSize: 13,
      color: ICE, fontFace: BODY, bullet: true, isTextBox: true, margin: 0 });
  });
  s.addNotes("Raj learns the system by drawing it — the diagrams are genuinely the fastest onboarding path.");
}

// ================================================================ 9. HOW WE WORK
{
  const s = pres.addSlide();
  sectionHeader(s, "HOW WE WORK", "Nobody pushes to main. Including me.");

  const flow = ["Branch", "Build", "make verify", "Push", "Pull request", "One review", "Merge"];
  const cw = 1.62, gap = 0.15;
  const startX = (W - (flow.length * cw + (flow.length - 1) * gap)) / 2;
  flow.forEach((label, i) => {
    const x = startX + i * (cw + gap);
    const hot = label === "make verify" || label === "One review";
    s.addShape(pres.ShapeType.roundRect, { x, y: 2.1, w: cw, h: 0.95, rectRadius: 0.09,
      fill: { color: hot ? AMBER : NAVY } });
    s.addText(label, { x: x + 0.05, y: 2.1, w: cw - 0.1, h: 0.95, fontSize: 12,
      color: hot ? DEEP : WHITE, fontFace: BODY, bold: true, align: "center",
      valign: "middle", isTextBox: true, margin: 0 });
  });

  s.addText("Your first five minutes", { x: M, y: 3.5, w: 6, h: 0.35, fontSize: 12,
    color: AMBER, fontFace: BODY, bold: true, charSpacing: 2, isTextBox: true, margin: 0 });
  s.addShape(pres.ShapeType.roundRect, { x: M, y: 3.9, w: 11.8, h: 1.55, rectRadius: 0.1,
    fill: { color: DEEP } });
  s.addText([
    { text: "git clone https://github.com/thesurajgupta/atlas.git && cd atlas", options: { breakLine: true } },
    { text: "cp .env.example .env", options: { breakLine: true } },
    { text: "make up  &&  make verify", options: {} },
  ], { x: M + 0.4, y: 4.05, w: 11, h: 1.25, fontSize: 14, color: ICE,
    fontFace: "Courier New", isTextBox: true, margin: 0, lineSpacingMultiple: 1.45 });

  s.addText("Everything else — branch names, commit style, where to ask — is in docs/team/WORKFLOW.md. Start at pinned issue #15.",
    { x: M, y: 5.7, w: 11.8, h: 0.6, fontSize: 14, color: SLATE, fontFace: BODY,
      isTextBox: true, margin: 0, lineSpacingMultiple: 1.25 });
  s.addNotes("Main is protected: pull request, green CI, one approval. That applies to me too — it is not bureaucracy, it is how main stays working.");
}

// ================================================================ 10. RULES
{
  const s = pres.addSlide();
  sectionHeader(s, "THREE RULES", "These are what make us credible");

  const rules = [
    ["Never commit a secret or real data", "The repo is public. We use synthetic data only. If you ever commit a credential — rotate it first, then tell us."],
    ["Never weaken a check to go green", "If a test fails it has found something real. Four silent bugs have already been caught this way, and every one looked fine locally."],
    ["Never type a number by hand", "Every metric comes from the evaluation tool with a commit attached. One made-up number and the judges stop believing all of them."],
  ];
  rules.forEach(([t, d], i) => {
    const y = 1.95 + i * 1.5;
    s.addShape(pres.ShapeType.roundRect, { x: M, y, w: 11.8, h: 1.28, rectRadius: 0.1,
      fill: { color: i === 2 ? NAVY : OFF }, line: { color: i === 2 ? NAVY : "E2E8F2", width: 1 } });
    s.addShape(pres.ShapeType.ellipse, { x: M + 0.4, y: y + 0.33, w: 0.62, h: 0.62,
      fill: { color: i === 2 ? AMBER : NAVY } });
    s.addText(String(i + 1), { x: M + 0.4, y: y + 0.33, w: 0.62, h: 0.62, fontSize: 19,
      color: i === 2 ? DEEP : WHITE, fontFace: HEAD, bold: true, align: "center",
      valign: "middle", isTextBox: true, margin: 0 });
    s.addText(t, { x: M + 1.25, y: y + 0.22, w: 10.2, h: 0.4, fontSize: 18,
      color: i === 2 ? WHITE : NAVY, fontFace: HEAD, bold: true, isTextBox: true, margin: 0 });
    s.addText(d, { x: M + 1.25, y: y + 0.63, w: 10.2, h: 0.55, fontSize: 12.5,
      color: i === 2 ? ICE : SLATE, fontFace: BODY, isTextBox: true, margin: 0, lineSpacingMultiple: 1.15 });
  });
  s.addNotes("Rule three is the one judges test. A number nobody can reproduce is worse than no number.");
}

// ================================================================ 11. THIS WEEK
{
  const s = pres.addSlide();
  sectionHeader(s, "THIS WEEK", "What each of us does next");

  const rows = [
    ["Everyone", "Accept the GitHub invite, run make verify, read issue #15", AMBER],
    ["Sneha", "Issue #4 — geography, population and cash-out endpoints", "31507A"],
    ["Vijay", "Issue #5 — the seven fraud typology generators", "31507A"],
    ["Vidushi", "Issue #18 — evaluation metrics, then #7 design system", "6B3FA0"],
    ["Lucky", "Issue #8 — hex risk map and jurisdiction treemap", "1C6E7D"],
    ["Raj", "Issue #17 — money-trail graph view, plus #9 diagrams", "1C6E7D"],
    ["Suraj", "Review your PRs, finish the API, start the prediction engine", NAVY],
  ];
  rows.forEach(([who, what, c], i) => {
    const y = 1.85 + i * 0.72;
    s.addShape(pres.ShapeType.roundRect, { x: M, y, w: 11.8, h: 0.6, rectRadius: 0.07,
      fill: { color: i === 0 ? OFF : WHITE }, line: { color: "E2E8F2", width: 1 } });
    s.addShape(pres.ShapeType.ellipse, { x: M + 0.28, y: y + 0.2, w: 0.2, h: 0.2, fill: { color: c } });
    s.addText(who, { x: M + 0.65, y: y + 0.12, w: 1.9, h: 0.36, fontSize: 14, color: NAVY,
      fontFace: HEAD, bold: true, isTextBox: true, margin: 0 });
    s.addText(what, { x: M + 2.6, y: y + 0.14, w: 9, h: 0.34, fontSize: 13, color: SLATE,
      fontFace: BODY, isTextBox: true, margin: 0 });
  });
  s.addNotes("If anything here is wrong for you, say so today. Better to swap now than three weeks in.");
}

// ================================================================ 12. CLOSING
{
  const s = pres.addSlide();
  s.background = { color: DEEP };
  s.addText("WHERE WE ARE", { x: M, y: 1.3, w: 8, h: 0.3, fontSize: 12, color: AMBER,
    fontFace: BODY, bold: true, charSpacing: 3, isTextBox: true, margin: 0 });
  s.addText("Foundations done. Now the interesting part.",
    { x: M, y: 1.7, w: 11.5, h: 1.0, fontSize: 34, color: WHITE, fontFace: HEAD,
      bold: true, isTextBox: true, margin: 0 });

  const done = [
    ["Repository", "Public, protected, CI on every push"],
    ["Database", "15 tables, geospatial and time-series ready"],
    ["Security", "Login, MFA, tamper-evident audit trail"],
    ["Honesty gates", "Two of five live, each proven by breaking it"],
  ];
  done.forEach(([t, d], i) => {
    const x = M + (i % 2) * 6.05;
    const y = 3.15 + Math.floor(i / 2) * 1.15;
    s.addShape(pres.ShapeType.ellipse, { x, y: y + 0.08, w: 0.34, h: 0.34, fill: { color: GREEN } });
    s.addText(t, { x: x + 0.55, y, w: 5.2, h: 0.36, fontSize: 16, color: WHITE,
      fontFace: HEAD, bold: true, isTextBox: true, margin: 0 });
    s.addText(d, { x: x + 0.55, y: y + 0.38, w: 5.2, h: 0.4, fontSize: 12.5, color: ICE,
      fontFace: BODY, isTextBox: true, margin: 0 });
  });

  s.addText("github.com/thesurajgupta/atlas", { x: M, y: 6.15, w: 11.5, h: 0.4,
    fontSize: 15, color: AMBER, fontFace: "Courier New", isTextBox: true, margin: 0 });
  s.addNotes("Close by asking each person to confirm their task out loud, and to accept the GitHub invite before leaving the room.");
}

pres.writeFile({ fileName: "ATLAS-Team-Roles.pptx" })
  .then(f => console.log("written:", f));
