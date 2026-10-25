// Executes Commands against the session and words the answer. Only describes engine output.
import { CODE_LABEL } from "../engine/codes";
import { counterfactuals, statusWord } from "../engine/counterfactual";
import { compareIds } from "../engine/decide";
import { normaliseId } from "../engine/normalise";
import { fmtDate } from "../engine/plan";
import { getPolicyValue } from "../engine/policy";
import { diff, replay, type Change, type Session, type Step, type Update } from "../engine/session";
import type { Decision, RunResult, Status } from "../engine/types";
import { POLICY_PATHS, type Command, type Parsed } from "./commands";
import type { ChatMemory } from "./rules";

export type Block =
  | { kind: "text"; text: string }
  | { kind: "changes"; title: string; changes: Change[]; simulated: boolean }
  | { kind: "swap"; challenger: string; challengerKey: string; displaced: string; displacedKey: string; gap: number; simulated: boolean }
  | { kind: "apply"; label: string };

export interface ChatState {
  session: Session;
  memory: ChatMemory;
  pending: Update[] | null;
  pendingLabel?: string;
}

export interface Reply {
  blocks: Block[];
  focus: string[]; // decision keys to highlight
  mode: "AI-assisted" | "Rule-based";
}

const HOLD_CODES = new Set(["PIN_MISSING", "PIN_INVALID", "CITY_PIN_MISMATCH", "DUPLICATE_ID", "UNIT_ERROR", "DATA_MISSING", "DATA_INVALID", "SAME_PROPERTY_CLAIM", "SPACE_CONTRADICTION", "PIN_HAS_STORE", "SPACE_SIZE_MISSING", "FLOOR_UNKNOWN", "NOTE_CONFLICT", "EXPERIENCE_CONFLICT", "FUNDING_GAP", "SPACE_SMALL"]);

export function replyText(r: Reply): string {
  return r.blocks
    .map((b) => {
      if (b.kind === "text") return b.text;
      if (b.kind === "changes") return [b.title, ...b.changes.map(changeLine)].join("\n");
      if (b.kind === "swap") return `Swap recommendation: approve ${b.challenger} and move ${b.displaced} to the waitlist (${b.challenger} leads by ${b.gap} points). A person must confirm.`;
      return b.label;
    })
    .join("\n");
}

export function changeLine(c: Change): string {
  const sc = c.before.score !== c.after.score ? ` · score ${c.before.score ?? "–"} → ${c.after.score ?? "–"}` : c.after.score !== null ? ` · score ${c.after.score}` : "";
  const rk = c.before.rank !== c.after.rank ? ` · rank ${c.before.rank ?? "–"} → ${c.after.rank ?? "–"}` : "";
  const q = c.before.queue !== c.after.queue && (c.before.queue || c.after.queue) ? ` · queue ${c.before.queue ? `#${c.before.queue}` : "–"} → ${c.after.queue ? `#${c.after.queue}` : "–"}` : "";
  return `${c.id}: ${statusWord(c.before.status)} → ${statusWord(c.after.status)}${sc}${rk}${q}`;
}

export function respond(state: ChatState, parsed: Parsed, at: string, mode: Reply["mode"] = "Rule-based"): { state: ChatState; reply: Reply } {
  let st: ChatState = { ...state, session: { ...state.session, log: [...state.session.log] } };
  const blocks: Block[] = [];
  const focus = new Set<string>();
  const say = (text: string) => blocks.push({ kind: "text", text });
  const steps = () => replay(st.session);
  let cur: Step = steps().at(-1)!;
  const refresh = () => (cur = steps().at(-1)!);

  if ((parsed.language === "Hindi" || parsed.language === "Kannada") && mode === "Rule-based") {
    say(`(Rule-based mode answers in English; it cannot reply in ${parsed.language}. The AI-assisted mode can.)`);
  }

  const find = (raw: string): Decision | null => {
    const k = normaliseId(raw);
    return cur.result.decisions.find((d) => d.key === k) ?? cur.result.decisions.find((d) => d.key.split("#")[0] === k) ?? null;
  };
  const missingId = (raw: string) => {
    const ids = [...cur.result.decisions].sort((a, b) => compareIds(a.key, b.key));
    say(`I can't find ${raw.toUpperCase().replace(/^APP-(\d)$/, "APP-00$1").replace(/^APP-(\d\d)$/, "APP-0$1")} in this file. It has ${ids.length} applications${ids.length ? `, from ${ids[0].id} to ${ids.at(-1)!.id}` : ""}. Please check the ID; I won't guess.`);
  };

  // batch consecutive updates so several pieces of news give one combined report
  let batch: { cmd: Command; update: Update }[] = [];
  let batchHypo = false;
  const flush = () => {
    if (!batch.length) return;
    const updates = batch.map((b) => b.update);
    const targets = batch.map((b) => b.cmd).flatMap((c) => ("id" in c ? [c.id] : []));
    const before = cur.result;
    let after: RunResult;
    if (batchHypo) {
      after = replay(st.session, updates).at(-1)!.result;
      st = { ...st, pending: updates, pendingLabel: updates.map((u) => u.text).join("; ") };
    } else {
      for (const u of updates) st.session.log.push({ update: u, at });
      st = { ...st, pending: null };
      refresh();
      after = cur.result;
    }
    reportUpdate(batch.map((b) => b.cmd), before, after, batchHypo, targets);
    batch = [];
  };

  for (const cmd of parsed.commands) {
    const upd = toUpdate(cmd);
    if (upd === "invalid") continue;
    if (upd) {
      const hypo = "hypothetical" in cmd && !!cmd.hypothetical;
      if (batch.length && hypo !== batchHypo) flush();
      batchHypo = hypo;
      batch.push({ cmd, update: upd });
      continue;
    }
    flush();
    handle(cmd);
  }
  flush();

  return { state: st, reply: { blocks, focus: [...focus], mode } };

  // ----------------------------------------------------------------
  function toUpdate(cmd: Command): Update | null | "invalid" {
    switch (cmd.intent) {
      case "update_facts": {
        const d = find(cmd.id);
        if (!d) return missingId(cmd.id), "invalid";
        const bits = Object.entries(cmd.changes).map(([k, v]) => `${k} ${v === null ? "cleared" : v}`).join(", ");
        return { kind: "facts", key: d.key, changes: cmd.changes, text: `${d.id}: ${bits}` };
      }
      case "withdraw": {
        const d = find(cmd.id);
        if (!d) return missingId(cmd.id), "invalid";
        if (d.status === "WITHDRAWN") return say(`${d.id} has already withdrawn; nothing to change.`), "invalid";
        return { kind: "withdraw", key: d.key, text: `${d.id} withdrew` };
      }
      case "territory_change": {
        const k = normaliseId(cmd.territory);
        const t = cur.result.territories.find((x) => x.key === k);
        if (!t) return say(`I can't find ${cmd.territory.toUpperCase()} in this file. Territories are ${cur.result.territories.map((x) => x.id).join(", ")}.`), "invalid";
        const bits = [cmd.slots !== undefined ? `${cmd.slots} open slots` : "", cmd.addPins?.length ? `add pins ${cmd.addPins.join(", ")}` : "", cmd.removePins?.length ? `remove pins ${cmd.removePins.join(", ")}` : "", cmd.priority ? `${cmd.priority} priority` : ""].filter(Boolean).join(", ");
        return { kind: "territory", key: k, slots: cmd.slots, addPins: cmd.addPins, removePins: cmd.removePins, priority: cmd.priority, text: `${t.id}: ${bits}` };
      }
      case "policy_change":
        return { kind: "policy", path: cmd.path, value: cmd.value, text: `${POLICY_PATHS[cmd.path]} = ${cmd.value}` };
      default:
        return null;
    }
  }

  function reportUpdate(cmds: Command[], before: RunResult, after: RunResult, simulated: boolean, targets: string[]) {
    const changes = diff(before, after);
    const targetKeys = new Set(targets.map((t) => find(t)?.key).filter(Boolean) as string[]);
    if (simulated) say(`What-if only: nothing has been applied yet.`);
    for (const c of cmds) {
      if (c.intent === "update_facts") {
        const d = after.decisions.find((x) => x.key === normaliseId(c.id) || x.key.split("#")[0] === normaliseId(c.id))!;
        const b = before.decisions.find((x) => x.key === d.key)!;
        focus.add(d.key);
        const facts = describeFacts(c.changes);
        say(`${simulated ? "If" : "Recorded for"} ${d.id}${simulated ? "" : " (claimed in chat, pending verification)"}: ${facts}.${c.summary ? ` Note: ${c.summary}.` : ""}`);
        lead(b, d, simulated);
        if (c.missing?.length) say(`To go further I need: ${c.missing.join("; ")}.`);
      } else if (c.intent === "withdraw") {
        const d = after.decisions.find((x) => x.key === normaliseId(c.id) || x.key.split("#")[0] === normaliseId(c.id))!;
        focus.add(d.key);
        say(`${d.id} ${simulated ? "would be" : "is now"} withdrawn. ${d.why}`);
      } else if (c.intent === "territory_change") {
        const t = after.territories.find((x) => x.key === normaliseId(c.territory))!;
        const tb = before.territories.find((x) => x.key === t.key)!;
        say(`${t.id} ${simulated ? "would have" : "now has"} ${t.slots} open slot${t.slots === 1 ? "" : "s"} and ${t.freePins.length} free pin${t.freePins.length === 1 ? "" : "s"}, so usable capacity is ${t.effectiveCapacity}${t.effectiveCapacity === tb.effectiveCapacity ? ` (unchanged${t.freePins.length < t.slots ? `: only ${t.freePins.length} pin${t.freePins.length === 1 ? " is" : "s are"} free, and the brand never opens two stores in one pin` : ""})` : ` (was ${tb.effectiveCapacity})`}.`);
      } else if (c.intent === "policy_change") {
        const old = getPolicyValue(cur.policy, c.path);
        say(`${simulated ? "Simulating" : "Applied"} ${POLICY_PATHS[c.path]} ${old} → ${c.value}.${simulated ? "" : " This re-ran every decision from the uploaded file with the new policy and replayed the logged updates in order."}`);
      }
    }
    const others = changes.filter((c) => !targetKeys.has(c.key));
    const knock = others.filter((c) => c.before.status !== c.after.status || c.before.queue !== c.after.queue);
    const rankOnly = others.filter((c) => !knock.includes(c));
    const own = changes.filter((c) => targetKeys.has(c.key));
    if (own.length) blocks.push({ kind: "changes", title: simulated ? "Would change:" : "Changed:", changes: own, simulated });
    if (knock.length) {
      blocks.push({ kind: "changes", title: `Knock-on effects on ${knock.length} other application${knock.length === 1 ? "" : "s"}:`, changes: knock, simulated });
      knock.forEach((k) => focus.add(k.key));
      for (const k of knock.filter((x) => x.before.status !== x.after.status).slice(0, 4)) say(`${k.id}: ${k.why}`);
    } else if (own.length) say(`No other application changes status.`);
    if (rankOnly.length) say(`Rank shifted without a status change for ${rankOnly.map((c) => c.id).join(", ")}.`);
    if (!changes.length) say(`No decision changes${simulated ? " in this what-if" : ""}.${explainNoChange(cmds, after)}`);
    const locked = before.decisions.filter((d) => d.status === "APPROVED" && after.decisions.find((x) => x.key === d.key)?.status === "APPROVED" && changes.some((c) => c.key !== d.key));
    const lockedInTouched = locked.filter((d) => changes.some((c) => after.decisions.find((x) => x.key === c.key)?.territoryKey === d.territoryKey));
    if (lockedInTouched.length) say(`Approved partners ${lockedInTouched.map((d) => d.id).join(", ")} stay locked; an update never displaces an approval on its own.`);
    // contested outcomes: lead with the reasoning and offer the swap
    for (const d of after.decisions.filter((x) => x.contested)) {
      const was = before.decisions.find((x) => x.key === d.key);
      if (was?.contested && !simulated) continue;
      const against = after.decisions.find((x) => x.id === d.contested!.against)!;
      say(`${d.id} now qualifies and would outrank ${against.id} by ${d.contested!.gap} points, but I will not revoke an approved partner on my own. Here is the swap recommendation.`);
      blocks.push({ kind: "swap", challenger: d.id, challengerKey: d.key, displaced: against.id, displacedKey: against.key, gap: d.contested!.gap, simulated });
    }
    if (simulated) blocks.push({ kind: "apply", label: 'Say "apply" to commit this, or ask another question to discard it.' });
  }

  function lead(b: Decision, d: Decision, simulated: boolean) {
    if (b.status === d.status && b.score?.total === d.score?.total) {
      say(`${d.id} ${simulated ? "would stay" : "stays"} ${statusWord(d.status).toLowerCase()}: ${d.why.replace(/^[A-Za-z ,]+?: /, "")}`);
      return;
    }
    say(`${d.id}: ${statusWord(b.status)} → ${statusWord(d.status)}. ${d.why}`);
    if (!simulated && (d.status === "APPROVED" || d.status === "CONDITIONAL")) say(`First next step: ${d.nextStep} (${d.owner}).`);
  }

  function explainNoChange(cmds: Command[], after: RunResult): string {
    const c = cmds[0];
    if (c.intent === "update_facts") {
      const d = after.decisions.find((x) => x.key === normaliseId(c.id) || x.key.split("#")[0] === normaliseId(c.id));
      return d ? ` ${d.id} is still ${statusWord(d.status).toLowerCase()} because: ${d.why.replace(/^[A-Za-z ,#\d]+?: /, "")}` : "";
    }
    return "";
  }

  function handle(cmd: Command) {
    switch (cmd.intent) {
      case "explain": {
        for (const raw of cmd.ids) {
          const d = find(raw);
          if (!d) {
            missingId(raw);
            continue;
          }
          focus.add(d.key);
          let pre = "";
          if (cmd.premise && cmd.premise !== d.status) pre = `${d.id} is not ${premiseWord(cmd.premise)}; it is ${statusWord(d.status).toLowerCase()}. `;
          say(`${pre}${d.why}`);
          for (const line of d.detail.slice(0, d.status === "ON_HOLD" ? 3 : 2)) say(`• ${line}`);
          if (d.status === "ON_HOLD" && d.asks.length) say(`Needed: ${d.asks.map((a) => `${a.what} (${a.from})`).join("; ")}.`);
          else say(`Next step: ${d.nextStep} (${d.owner}).`);
        }
        break;
      }
      case "next_steps": {
        for (const raw of cmd.ids) {
          const d = find(raw);
          if (!d) {
            missingId(raw);
            continue;
          }
          focus.add(d.key);
          if (d.plan) {
            const p = d.plan;
            say(`${d.id} is ${statusWord(d.status).toLowerCase()}. Plan: ${p.totalWeeks} weeks to open, ready by ${fmtDate(p.readyDate)}${p.targetDate ? ` vs target ${fmtDate(p.targetDate)} (${p.feasible ? "on time" : `too early; earliest ${p.earliestMonth}`})` : ""}.`);
            for (const s of p.steps) say(`• Week ${s.week}${s.weeks > 1 ? `–${s.week + s.weeks - 1}` : ""}: ${s.label} (${s.owner})`);
            say(`Training: ${p.training.track}, ${p.training.weeks} week${p.training.weeks === 1 ? "" : "s"}, in ${p.training.language}; ${p.training.mode.toLowerCase()}; buddy store ${p.training.buddyStore ?? "to be assigned"} (${p.training.buddyReason}); competency sign-off before go-live.`);
            say(`Supply: ${p.supply.note}; ${p.supply.cluster}.`);
            say(`Documents: ${p.documents.join("; ")}.`);
          } else say(`${d.id} is ${statusWord(d.status).toLowerCase()}, so there is no onboarding plan yet. Next step: ${d.nextStep} (${d.owner}).`);
        }
        break;
      }
      case "what_would_it_take": {
        for (const raw of cmd.ids) {
          const d = find(raw);
          if (!d) {
            missingId(raw);
            continue;
          }
          focus.add(d.key);
          const w = counterfactuals(cur, d.key, st.session.today);
          const good = w.filter((x) => x.improves);
          say(`${d.id} is ${statusWord(d.status).toLowerCase()}. ${good.length ? "Changes I tested that would improve it:" : w.length ? "None of the single changes I tested would improve it:" : "It is already as far forward as it can go."}`);
          for (const x of (good.length ? good : w).slice(0, 4)) say(`• ${x.change}: ${statusWord(x.from)} → ${statusWord(x.to)}`);
        }
        break;
      }
      case "compare":
      case "rank_explain": {
        const [a, b] = cmd.ids.map(find);
        if (!a || !b) {
          cmd.ids.forEach((x) => !find(x) && missingId(x));
          break;
        }
        focus.add(a.key);
        focus.add(b.key);
        const sa = a.score?.total ?? 0;
        const sb = b.score?.total ?? 0;
        if (cmd.intent === "rank_explain") {
          const ahead = rankAhead(a, b);
          if (ahead === b) say(`${b.id} actually ranks ahead of ${a.id} (${statusWord(b.status)} vs ${statusWord(a.status)}).`);
          say(`${ahead.id} ranks ahead: score ${ahead.score?.total} vs ${(ahead === a ? b : a).score?.total}${a.ready !== b.ready ? `, and ${ahead.id} has a ready site while the other does not (a ready site always ranks first)` : ""}.`);
        } else say(`${a.id} (${statusWord(a.status)}, score ${sa}) vs ${b.id} (${statusWord(b.status)}, score ${sb}).`);
        if (a.score && b.score) {
          const rows = a.score.components.map((c, i) => ({ label: c.label, x: c.value, y: b.score!.components[i].value, max: c.max, d: c.value - b.score!.components[i].value }));
          for (const r of [...rows].sort((p, q) => Math.abs(q.d) - Math.abs(p.d))) say(`• ${r.label}: ${a.id} ${r.x} vs ${b.id} ${r.y} (of ${r.max})`);
        }
        if (a.pin && a.pin === b.pin) say(`They share pin ${a.pin}, and the brand never opens two stores in one pin, so only one can get it.`);
        else if (a.territoryKey && a.territoryKey === b.territoryKey) say(`Both compete in ${a.territoryId} for ${cur.result.territories.find((t) => t.key === a.territoryKey)?.effectiveCapacity} usable slot(s).`);
        if (sa === sb) say("Scores are tied, so the tie-break order applies: ready site, then investment, then application ID.");
        break;
      }
      case "territory_status": {
        const ts = cmd.territories.length ? cmd.territories.map((t) => cur.result.territories.find((x) => x.key === normaliseId(t)) ?? normaliseId(t)) : cur.result.territories;
        if (cmd.filter === "unfilled") {
          const open = cur.result.territories.filter((t) => t.unusedCapacity > 0);
          if (!open.length) say("Every territory's usable capacity is allocated (approved or conditionally reserved).");
          else for (const t of open) say(`${t.id} (${t.city}): ${t.unusedCapacity} of ${t.effectiveCapacity} usable slot${t.effectiveCapacity === 1 ? "" : "s"} still open${t.onHold.length ? `; holds that could fill it: ${t.onHold.join(", ")}` : ""}.`);
          for (const t of cur.result.territories.filter((x) => x.bindingReason)) say(`${t.bindingReason}`);
          break;
        }
        for (const t of ts) {
          if (typeof t === "string") {
            say(`I can't find ${t} in this file. Territories are ${cur.result.territories.map((x) => x.id).join(", ")}.`);
            continue;
          }
          say(`${t.id} · ${t.city} · Tier ${t.tier} · ${t.priority} priority: ${t.slots} open slot${t.slots === 1 ? "" : "s"}, ${t.freePins.length} free pin${t.freePins.length === 1 ? "" : "s"} (${t.freePins.join(", ") || "none"}), usable capacity ${t.effectiveCapacity}.${t.bindingReason ? ` ${t.bindingReason}` : ""}`);
          say(`• Approved: ${t.approved.join(", ") || "none"} · Conditional: ${t.conditional.join(", ") || "none"} · Waitlisted: ${t.waitlisted.join(", ") || "none"} · On hold: ${t.onHold.join(", ") || "none"}`);
          if (t.storePins.length) say(`• Pins with our stores: ${t.storePins.map((s) => `${s.pin} (${s.storeId})`).join(", ")}`);
        }
        break;
      }
      case "queue": {
        for (const raw of cmd.territories ?? []) {
          const t = cur.result.territories.find((x) => x.key === normaliseId(raw));
          if (!t) {
            say(`I can't find ${raw} in this file.`);
            continue;
          }
          if (!t.waitlisted.length) say(`No one is waiting in ${t.id}.${t.onHold.length ? ` On hold (would join once fixed): ${t.onHold.join(", ")}.` : ""}`);
          else {
            say(`Next in line for ${t.id}:`);
            t.waitlisted.forEach((id, i) => {
              const d = cur.result.decisions.find((x) => x.id === id)!;
              focus.add(d.key);
              say(`#${i + 1} ${id} (score ${d.score?.total}): ${d.why.replace(/^Waitlisted[^:]*: /, "")}`);
            });
          }
        }
        for (const raw of cmd.ids ?? []) {
          const d = find(raw);
          if (!d) {
            missingId(raw);
            continue;
          }
          say(d.queuePos ? `${d.id} is #${d.queuePos} in ${d.territoryId}'s queue; ahead: ${d.ahead.join(", ") || "no one"}.` : `${d.id} is not in a queue; it is ${statusWord(d.status).toLowerCase()}.`);
        }
        break;
      }
      case "list": {
        let ds = cur.result.decisions;
        if (cmd.status?.length) ds = ds.filter((d) => cmd.status!.includes(d.status));
        if (cmd.onlyCode) ds = ds.filter((d) => d.status === "ON_HOLD" && d.codes.filter((c) => HOLD_CODES.has(c)).every((c) => c === cmd.onlyCode) && d.codes.includes(cmd.onlyCode as never));
        const what = cmd.onlyCode ? `on hold only because: ${CODE_LABEL[cmd.onlyCode as keyof typeof CODE_LABEL]?.toLowerCase() ?? cmd.onlyCode}` : cmd.status?.length ? cmd.status.map((s) => statusWord(s).toLowerCase()).join(" or ") : "in total";
        say(`${ds.length} application${ds.length === 1 ? " is" : "s are"} ${what}${ds.length ? `: ${ds.map((d) => d.id).join(", ")}` : ""}.`);
        for (const d of ds.slice(0, 12)) {
          focus.add(d.key);
          say(`• ${d.id}: ${d.why}`);
        }
        break;
      }
      case "summary": {
        const r = cur.result;
        const count = (s: Status) => r.decisions.filter((d) => d.status === s).length;
        const cap = r.territories.reduce((n, t) => n + t.effectiveCapacity, 0);
        const used = r.territories.reduce((n, t) => n + t.approved.length + t.conditional.length, 0);
        say(`${r.decisions.length} applications: ${count("APPROVED")} approved, ${count("CONDITIONAL")} conditional, ${count("WAITLISTED")} waitlisted, ${count("ON_HOLD")} on hold, ${count("DECLINED")} declined${count("WITHDRAWN") ? `, ${count("WITHDRAWN")} withdrawn` : ""}. Usable capacity ${used} of ${cap} allocated. Pin rule: ${r.pinConflicts} conflicts.`);
        const holds = r.decisions.filter((d) => d.status === "ON_HOLD");
        if (holds.length) say(`Quickest wins: ${holds.slice(0, 3).map((d) => `${d.id} (${d.nextStep.toLowerCase()})`).join("; ")}.`);
        break;
      }
      case "apply": {
        if (!st.pending?.length) {
          say("There is no what-if waiting to be applied.");
          break;
        }
        const before = cur.result;
        const n = st.pending.length;
        for (const u of st.pending) st.session.log.push({ update: u, at });
        const label = st.pendingLabel;
        st = { ...st, pending: null };
        refresh();
        say(`Applied: ${label}.`);
        const cmds = st.session.log.slice(-n).map((l) => updateToCmd(l.update)).filter(Boolean) as Command[];
        reportUpdate(cmds, before, cur.result, false, cmds.flatMap((c) => ("id" in c ? [c.id] : [])));
        break;
      }
      case "undo": {
        const last = st.session.log.at(-1);
        if (!last) {
          say("Nothing to undo; this is the original upload.");
          break;
        }
        const before = cur.result;
        st.session.log.pop();
        refresh();
        say(`Undone: ${last.update.text}. The state is now exactly as before that update.`);
        const ch = diff(before, cur.result);
        if (ch.length) blocks.push({ kind: "changes", title: "Restored:", changes: ch, simulated: false });
        break;
      }
      case "reset": {
        st.session.log = [];
        st = { ...st, pending: null };
        refresh();
        say("Reset to the original upload. Every update has been cleared.");
        break;
      }
      case "confirm_swap": {
        const contested = cur.result.decisions.filter((d) => d.contested);
        const pick = cmd.ids?.length ? contested.find((d) => cmd.ids!.some((i) => normaliseId(i) === d.key || normaliseId(i) === normaliseId(d.contested!.against))) : contested[0];
        if (!pick) {
          say("There is no contested approval to swap right now.");
          break;
        }
        const displaced = cur.result.decisions.find((d) => d.id === pick.contested!.against)!;
        const before = cur.result;
        st.session.log.push({ update: { kind: "swap", challenger: pick.key, displaced: displaced.key, text: `Confirmed swap: ${pick.id} replaces ${displaced.id}` }, at });
        refresh();
        say(`Swap confirmed by you and logged: ${pick.id} is approved and ${displaced.id} moves to the waitlist.`);
        const d2 = cur.result.decisions.find((d) => d.key === displaced.key)!;
        if (d2.handling) say(d2.handling);
        blocks.push({ kind: "changes", title: "Changed:", changes: diff(before, cur.result), simulated: false });
        focus.add(pick.key);
        focus.add(displaced.key);
        break;
      }
      case "verify": {
        const d = find(cmd.id);
        if (!d) {
          missingId(cmd.id);
          break;
        }
        const before = cur.result;
        st.session.log.push({ update: { kind: "verify", key: d.key, text: `${d.id} verified` }, at });
        refresh();
        say(`${d.id}'s claimed details are marked verified.`);
        const ch = diff(before, cur.result);
        if (ch.length) blocks.push({ kind: "changes", title: "Changed:", changes: ch, simulated: false });
        break;
      }
      case "simulate_days": {
        const before = cur.result;
        st.session.log.push({ update: { kind: "days", days: cmd.days, text: `${cmd.days} days passed` }, at });
        refresh();
        const ch = diff(before, cur.result);
        say(`Simulated ${cmd.days} days with no news.${cmd.days >= 30 ? " Conditional reservations without a qualifying site lapse and pass to the next in line." : ""}${cmd.days >= 14 ? " Holds with no reply close, with a re-apply path." : ""}`);
        if (ch.length) blocks.push({ kind: "changes", title: "Changed:", changes: ch, simulated: false });
        else say("Nothing changed.");
        break;
      }
      case "help":
        say(cmd.reason ?? "Try: “Why is APP-007 on hold?”, “APP-012 found a ground-floor space of 400 sq ft”, “Who is next in line for TER-03?”, “What if the approval bar were 60?”");
        break;
      default:
        break;
    }
  }

  function rankAhead(a: Decision, b: Decision): Decision {
    const order = (d: Decision) => [d.ready ? 0 : 1, -(d.score?.total ?? -1)];
    const [ar, as] = order(a);
    const [br, bs] = order(b);
    if (ar !== br) return ar < br ? a : b;
    if (as !== bs) return as < bs ? a : b;
    return compareIds(a.key, b.key) <= 0 ? a : b;
  }
}

function updateToCmd(u: Update): Command | null {
  if (u.kind === "facts") return { intent: "update_facts", id: u.key, changes: u.changes };
  if (u.kind === "withdraw") return { intent: "withdraw", id: u.key };
  if (u.kind === "territory") return { intent: "territory_change", territory: u.key, slots: u.slots, addPins: u.addPins, removePins: u.removePins, priority: u.priority };
  if (u.kind === "policy") return { intent: "policy_change", path: u.path as "bars.approval", value: Number(u.value), hypothetical: false };
  return null;
}

function premiseWord(s: Status): string {
  return { APPROVED: "approved", CONDITIONAL: "conditional", ON_HOLD: "on hold", WAITLISTED: "waitlisted", DECLINED: "rejected", WITHDRAWN: "withdrawn" }[s];
}

function describeFacts(c: Record<string, unknown>): string {
  const parts: string[] = [];
  if (c.space === "None") parts.push("no space any more");
  else if (c.space) parts.push(`${String(c.space).toLowerCase()} space`);
  if (c.size) parts.push(`${c.size} sq ft`);
  if (c.floor) parts.push(`${c.floor === "Mall" ? "mall unit" : `${String(c.floor).toLowerCase()} floor`}`);
  if (c.pin) parts.push(`pin ${c.pin}`);
  if (c.invest !== undefined) parts.push(`investment ₹${c.invest} lakh`);
  if (c.experience !== undefined) parts.push(`${c.experience} years' experience`);
  if (c.targetMonths !== undefined) parts.push(`target ${c.targetMonths} months`);
  if (c.city) parts.push(`city ${c.city}`);
  if (c.language) parts.push(`language ${c.language}`);
  return parts.join(", ") || "no usable facts";
}
