// Turns engine evaluations into Decisions with plain-language explanations.
// The text only describes what the engine decided; it never decides anything itself.
import { floorWord, minSize } from "./assess";
import type { ReasonCode } from "./codes";
import { rankCompare, type Ev, type TInfo } from "./decide";
import { buildPlan, fmtDate, fmtMonth, addDays, nextFestival } from "./plan";
import type { Policy } from "./policy";
import type { Ask, CityRef, Dataset, Decision, Flag, Owner, RunContext, Stability } from "./types";

export interface World {
  ds: Dataset;
  policy: Policy;
  ctx: RunContext;
  tinfos: TInfo[];
  asOfYear: number;
  refs: CityRef[];
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const listOr = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]}`);
const listAnd = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

const HOLD_ORDER: ReasonCode[] = [
  "PIN_MISSING",
  "PIN_INVALID",
  "CITY_PIN_MISMATCH",
  "DUPLICATE_ID",
  "UNIT_ERROR",
  "DATA_MISSING",
  "DATA_INVALID",
  "SAME_PROPERTY_CLAIM",
  "SPACE_CONTRADICTION",
  "PIN_HAS_STORE",
  "SPACE_SIZE_MISSING",
  "FLOOR_UNKNOWN",
  "NOTE_CONFLICT",
  "EXPERIENCE_CONFLICT",
  "FUNDING_GAP",
  "SPACE_SMALL",
];

export function explainAll(evs: Ev[], w: World): Decision[] {
  const { policy, ctx } = w;
  const byTerr = new Map<string, Ev[]>();
  for (const e of evs) if (e.terr) byTerr.set(e.terr.t.key, [...(byTerr.get(e.terr.t.key) ?? []), e]);
  const moving = (e: Ev) => e.status === "APPROVED" || e.status === "CONDITIONAL";

  // queue positions per territory
  const queue = new Map<string, number>();
  for (const [, pool] of byTerr) {
    const wl = pool.filter((e) => e.status === "WAITLISTED");
    const order = [...wl].sort((a, b) => {
      const ca = a.loss?.kind === "contested" ? 0 : a.reserve ? 2 : 1;
      const cb = b.loss?.kind === "contested" ? 0 : b.reserve ? 2 : 1;
      return ca - cb || rankCompare(a, b);
    });
    order.forEach((e, i) => queue.set(e.key, i + 1));
  }

  // density per city
  const cityCount = new Map<string, number>();
  for (const s of w.ds.stores) cityCount.set(s.pin.slice(0, 3), (cityCount.get(s.pin.slice(0, 3)) ?? 0) + 1);
  for (const e of evs) if (moving(e) && e.app.pin) cityCount.set(e.app.pin.slice(0, 3), (cityCount.get(e.app.pin.slice(0, 3)) ?? 0) + 1);

  return evs.map((e) => explainOne(e));

  function explainOne(e: Ev): Decision {
    const app = e.app;
    const T = e.terr?.t;
    const pool = T ? byTerr.get(T.key) ?? [] : [];
    const scored = pool.filter((p) => p.status !== "WITHDRAWN" && p.score && (p.eligible || p.reserve)).sort(rankCompare);
    const s = e.score?.total ?? null;
    const allocated = pool.filter(moving).sort(rankCompare);
    const takenPins = new Set(allocated.map((a) => a.allocatedPin).filter(Boolean) as string[]);
    const freeOffer = (e.terr?.freePins ?? []).filter((p) => !takenPins.has(p) && p !== app.pin);
    const cap = e.terr?.cap ?? 0;
    const slots = T?.slots ?? 0;
    const binding = e.terr && e.terr.freePins.length < slots ? `${T!.id} wants ${plural(slots, "store")} but ${e.terr.freePins.length === 0 ? "no pin is" : `only ${plural(e.terr.freePins.length, "pin")} ${e.terr.freePins.length === 1 ? "is" : "are"}`} free` : null;
    const rankIdx = scored.findIndex((p) => p.key === e.key);
    let rank = rankIdx >= 0 ? { k: rankIdx + 1, n: scored.length } : null;
    const detail: string[] = [];
    const asks: Ask[] = [];
    const codes: ReasonCode[] = [];
    let why = "";
    let nextStep = "";
    let owner: Owner = "Expansion";
    let redirect: string | null = null;
    let handling: string | undefined;
    const flags: Flag[] = [...e.verify, ...e.info];
    const prev = ctx.previous?.[e.key];
    const promoted = prev === "WAITLISTED" && moving(e);
    const next = (txt: string, who: Owner) => {
      nextStep = txt;
      owner = who;
    };
    const queuePos = queue.get(e.key) ?? null;
    const sameCityOpen = () =>
      w.tinfos.filter((ti) => ti.t.key !== T?.key && ti.t.city && T?.city && ti.t.city.toLowerCase() === T.city.toLowerCase() && ti.cap > (byTerr.get(ti.t.key) ?? []).filter(moving).length);

    // provisional rank for applicants on hold
    const provisional = () => {
      if (!e.score || !T) return null;
      const hypo = { ...e, ready: e.hasSite, eligible: true } as Ev;
      const others = pool.filter((p) => p.key !== e.key && (p.eligible || p.reserve) && p.status !== "WITHDRAWN");
      const k = 1 + others.filter((o) => rankCompare(o, hypo) < 0).length;
      return { k, n: others.length + 1, wins: k <= cap && e.score.total >= e.bar };
    };

    switch (e.status) {
      case "WITHDRAWN": {
        const prevPin = ctx.pinned[e.key];
        why = T
          ? prevPin
            ? `Withdrawn on request; the slot and pin ${prevPin} in ${T.id} are released to the next in line.`
            : `Withdrawn on request; nothing was reserved for it in ${T.id}, so no one else moves.`
          : `Withdrawn on request; row ${app.row} is closed and nothing else changes.`;
        next("Close the file and confirm the withdrawal in writing", "Expansion");
        break;
      }
      case "DECLINED": {
        if (e.closed) {
          const primary = sortHolds(e)[0];
          codes.push(...sortHolds(e).map((h) => h.code));
          why = `Declined: no reply in ${policy.windows.holdCloseDays} days to the request to ${lc(primary.ask?.what ?? "send the missing detail")}; re-apply any time.`;
          next(`Re-apply any time; ${lc(primary.ask?.what ?? "send the missing detail")}`, "Applicant");
          break;
        }
        const d = e.decline!;
        codes.push(d.code);
        why = `Declined: ${d.text}`;
        if (d.ask) {
          next(d.ask.what, d.ask.from);
          asks.push(d.ask);
        }
        if (d.code === "OUT_OF_TERRITORY") {
          const open = e.prefixCity ? w.tinfos.filter((ti) => ti.t.city && e.prefixCity!.city.toLowerCase() === ti.t.city.toLowerCase() && ti.cap > 0) : [];
          redirect = open.length ? open.map((o) => `${o.t.id}: pins ${o.freePins.join(", ")}`).join("; ") : null;
          detail.push(open.length ? `We can consider a site in ${listOr(open.map((o) => o.t.id))}.` : `There is no open territory in ${e.prefixCity?.city ?? "this city"}, so there is no alternative to offer today.`);
        }
        if (d.code === "INVEST_LOW" && e.capex) detail.push(capexLine(e));
        if (d.code === "PIN_HAS_STORE_NO_ALT" && e.terr) detail.push(`${T!.id} lists ${plural(T!.pins.length, "pin")}; ${listAnd(e.terr.storePins.map((sp) => `${sp.pin} (${sp.storeId})`))} already ${e.terr.storePins.length === 1 ? "has" : "have"} our store, so usable capacity is 0 despite ${plural(slots, "open slot")}.`);
        for (const h of e.holds) detail.push(`Also noted: ${h.text}`);
        detail.push("How to re-apply: send a fresh application once the point above is fixed; nothing is held against the applicant.");
        break;
      }
      case "ON_HOLD": {
        const hs = sortHolds(e);
        codes.push(...hs.map((h) => h.code));
        const primary = hs[0];
        const pv = provisional();
        if (primary.code === "PIN_HAS_STORE" && pv) {
          why = `On hold: pin ${app.pin} already has our store ${e.storeAtPin!.id}; moving to free pin ${listOr(freeOffer.slice(0, 3)) || e.terr!.freePins[0]} would rank it ${pv.k} of ${pv.n} (score ${s}).`;
        } else {
          why = `On hold: ${primary.text}`;
        }
        for (const h of hs) if (h.ask) asks.push(h.ask);
        next(primary.ask?.what ?? "Send the missing detail", primary.ask?.from ?? "Applicant");
        if (primary.code === "PIN_HAS_STORE") {
          const what = freeOffer.length ? `Move the site to free pin ${listOr(freeOffer)} in ${T!.id}` : `Move the site to another pin; every free pin of ${T!.id} is already allocated`;
          next(what, "Applicant");
          asks[asks.findIndex((x) => x === primary.ask)] = { what, from: "Applicant" };
        }
        if (hs.length > 1) detail.push(`To decide, we need ${plural(hs.length, "item")}: ${hs.map((h) => lc(h.ask?.what ?? h.code)).join("; ")}.`);
        if (pv && s !== null) {
          const locked = allocated.filter((a) => a.pinned).length;
          detail.push(
            `If fixed, it would rank ${pv.k} of ${pv.n} in ${T!.id} (provisional score ${s}, bar ${e.bar})` +
              (pv.wins ? `, inside the ${plural(cap, "usable slot")}` : s < e.bar ? ", below the bar" : `, outside the ${plural(cap, "usable slot")}`) +
              (pv.wins && locked >= cap && cap > 0 ? "; both slots are held by approved partners, so a swap would need sign-off." : "."),
          );
        } else if (!T && s !== null) detail.push(`Provisional score ${s}.`);
        if (primary.code === "PIN_HAS_STORE") detail.push(`Free pins in ${T!.id} today: ${listAnd(freeOffer) || "none left unallocated"}.`);
        if (primary.detail) detail.push(primary.detail);
        if (e.capex) detail.push(capexLine(e));
        detail.push(`On hold uses no slot. If there is no reply within ${policy.windows.holdCloseDays} days the hold closes and the applicant can re-apply.`);
        break;
      }
      case "APPROVED": {
        const site = `${(app.space ?? "").toLowerCase()} ${app.size} sq ft ${floorWord(app.floor)} site at pin ${e.allocatedPin}`;
        why = promoted
          ? `Approved, promoted from the waitlist: a slot in ${T!.id} opened; ${site}, score ${s}.`
          : `Approved: ${site}, score ${s}, ranked ${rank?.k ?? 1} of ${rank?.n ?? 1} in ${T!.id}.`;
        if (e.pinned) detail.push("This approval is locked: later updates cannot displace it without a person confirming a swap.");
        const challenger = pool.find((p) => p.loss?.kind === "contested" && p.loss.against?.key === e.key);
        if (challenger) detail.push(`${challenger.app.id} now outranks this partner by ${challenger.loss!.gap} points; the approval stays unless the expansion head confirms a swap.`);
        if (e.phase === 2 && e.adjacentTo) detail.push(`Approved although ${e.adjacentTo.km !== null ? `${e.adjacentTo.km} km` : "close"} from ${e.adjacentTo.ev.app.id}, because a slot remained after better-spaced sites.`);
        const claim = e.verify.find((v) => v.code === "CLAIM_UNVERIFIED");
        if (claim) {
          codes.push("CLAIM_UNVERIFIED");
          next(claim.task!, "Field");
          detail.push("The decision moves forward now, tagged pending verification; no fee is collected before verification and a signed agreement.");
        } else next("Complete KYC and sign the franchise agreement in weeks 1 to 2", "Legal");
        break;
      }
      case "CONDITIONAL": {
        const checks = e.verify.filter((v) => v.code !== "CLAIM_UNVERIFIED");
        codes.push(...checks.map((v) => v.code));
        const until = fmtDate(addDays(ctx.today, policy.windows.conditionalDays));
        const nextInLine = pool.filter((p) => p.status === "WAITLISTED" && !p.reserve).sort((a, b) => (queue.get(a.key) ?? 99) - (queue.get(b.key) ?? 99))[0];
        if (e.phase === 3) {
          const idx = allocated.findIndex((a) => a.key === e.key) + 1;
          why = `Conditional: slot ${idx} of ${cap} in ${T!.id} is reserved until ${until} (score ${s}) while a qualifying site is found.`;
          const min = minSize(policy, e.tier);
          const pins = (e.terr?.freePins ?? []).filter((p) => !takenPins.has(p));
          next(`Find a ground-floor site of at least ${min} sq ft in free pin ${listOr(pins) || "of the territory"} by ${until}`, "Applicant");
          asks.push({ what: `A qualifying site: ${min}+ sq ft, ground floor preferred, in pin ${listOr(pins)}`, from: "Applicant" }, { what: "Field visit to verify the site once found", from: "Field" });
          detail.push(`A qualifying site is at least ${min} sq ft (${policy.capex.idealSize[String(e.tier) as "1"]} ideal), ideally ground floor, in a free pin with no store of ours: ${listAnd(pins) || "none free right now"}.`);
          if (checks.length) for (const c of checks) asks.push({ what: c.task!, from: c.owner ?? "Applicant" });
        } else {
          const c = checks[0];
          why = `Conditional: pin ${e.allocatedPin} in ${T!.id} is reserved until ${until} (score ${s}); ${lc(c.text)}.`;
          next(`${c.task} by ${until}`, c.owner ?? "Applicant");
          for (const v of checks) asks.push({ what: v.task!, from: v.owner ?? "Applicant" });
        }
        detail.push(nextInLine ? `Next in line if this lapses: ${nextInLine.app.id} (score ${nextInLine.score?.total}).` : `No one is waiting in ${T!.id}; if this lapses the slot stays open for new applicants.`);
        break;
      }
      case "WAITLISTED": {
        const L = e.loss;
        const q = queuePos ?? 1;
        if (L?.kind === "contested") {
          codes.push("CONTESTED");
          why = `Waitlisted #1: now outranks approved partner ${L.against!.app.id} by ${L.gap} points, but an approval is not revoked without sign-off.`;
          next(`Expansion head to review the swap with ${L.against!.app.id} and confirm or keep`, "Expansion");
          detail.push(`It now qualifies and would outrank ${L.against!.app.id}, but I will not revoke an approved partner on my own. Here is the swap recommendation: confirm the swap to approve ${app.id} and move ${L.against!.app.id} to the waitlist with an alternative offer.`);
        } else if (L?.kind === "pin" && L.winner) {
          const peer = e.identityPeers.includes(L.winner.key);
          codes.push(peer ? "FUZZY_IDENTITY" : "PIN_TAKEN");
          if (binding) codes.push("SLOTS_FULL");
          const ws = L.winner.score?.total;
          why = peer
            ? `Waitlisted: same pin ${app.pin} and a near-identical name as ${L.winner.app.id}; counted once until an identity check (score ${ws} vs ${s}).`
            : binding
              ? `Waitlisted: pin ${app.pin} goes to ${L.winner.app.id} (score ${ws} vs ${s}); ${binding}.`
              : `Waitlisted: pin ${app.pin} goes to ${L.winner.app.id} (score ${ws} vs ${s}); only one store is allowed per pin.`;
          const gap = (ws ?? 0) - (s ?? 0);
          detail.push(`${L.winner.app.id} ranks ahead by ${gap} point${gap === 1 ? "" : "s"}${gap === 0 ? " (tie broken by investment, then ID)" : ""}. The brand never opens two stores in one pin.`);
          const full = allocated.length >= cap;
          if (freeOffer.length && !full) next(`Find a site in free pin ${listOr(freeOffer.slice(0, 3))} to compete for the open ${T!.id} slot`, "Applicant");
          else if (freeOffer.length) next(`Stay on the waitlist at #${q}; a site in free pin ${listOr(freeOffer.slice(0, 3))} keeps you eligible when a slot frees`, "Applicant");
          else next(`Stay on the waitlist at #${q}; we contact you if pin ${app.pin} or a slot frees up`, "Expansion");
        } else if (L?.kind === "identity") {
          codes.push("FUZZY_IDENTITY");
          const peer = pool.find((p) => e.identityPeers.includes(p.key) && moving(p));
          why = `Waitlisted: ${peer ? `the same applicant appears to hold ${peer.app.id}` : "a likely duplicate identity holds a reservation"}; one person can hold one slot (score ${s}).`;
          next("Confirm identity and choose which application to pursue", "Expansion");
        } else if (L?.kind === "adjacent" && e.adjacentTo) {
          codes.push("ADJACENCY");
          why = `Waitlisted #${q}: pin ${app.pin} is ${e.adjacentTo.km !== null ? `${e.adjacentTo.km} km` : `${e.adjacentTo.gap} pin numbers`} from new store ${e.adjacentTo.ev.app.id}; better-spaced sites took ${T!.id}'s ${plural(cap, "slot")}.`;
          next(freeOffer.length ? `Consider a site in pin ${listOr(freeOffer.slice(0, 3))}, further from ${e.adjacentTo.ev.app.id}` : `Stay on the waitlist at #${q}`, "Applicant");
        } else if (L?.kind === "lapsed") {
          why = `Waitlisted #${q}: the ${policy.windows.conditionalDays}-day reservation in ${T!.id} lapsed without a qualifying site (score ${s}).`;
          next("Send details of a qualifying site to re-join the queue", "Applicant");
        } else if (L?.kind === "reserve" || e.reserve) {
          codes.push("BELOW_BAR");
          const gap = e.bar - (s ?? 0);
          const weak = [...(e.score?.components ?? [])].sort((a, b) => a.value / a.max - b.value / b.max)[0];
          why = `Waitlisted as reserve #${q}: score ${s} is below ${T!.id}'s bar of ${e.bar}, so applicants above the bar go first.`;
          next(`Add ${gap} point${gap === 1 ? "" : "s"}: the weakest area is ${weak.label.toLowerCase()} (${weak.value} of ${weak.max})`, "Applicant");
        } else {
          codes.push("SLOTS_FULL");
          const ahead = allocated.map((a) => `${a.app.id} (${a.score?.total})`);
          why = cap === 0
            ? `Waitlisted #${q}: ${T!.id} can host 0 new stores right now (${binding ?? `${plural(slots, "open slot")}`}).`
            : `Waitlisted #${q} in ${T!.id}: ${cap === 1 ? "its 1 usable slot" : `all ${cap} usable slots`} went to ${listAnd(ahead.slice(0, 3))}, vs score ${s}.`;
          next(`Stay on the waitlist at #${q}; promotion is automatic if a slot frees`, "Expansion");
          if (binding) detail.push(`${binding}, so usable capacity is ${cap}.`);
        }
        const alt = sameCityOpen();
        if (alt.length) {
          redirect = alt.map((a) => `${a.t.id} (pins ${a.freePins.join(", ")})`).join("; ");
          detail.push(`Suggestion: ${listOr(alt.map((a) => a.t.id))} in the same city still has room; a site there could be considered.`);
        }
        detail.push(`Waitlist position #${q} in ${T!.id}. Freed slots promote the waitlist automatically.`);
        if (ctx.swapNotes?.[e.key]) {
          handling = `Moved to the waitlist when the expansion head confirmed a swap with ${ctx.swapNotes[e.key]}. ${freeOffer.length ? `Next-best option: a site in free pin ${listOr(freeOffer.slice(0, 3))}.` : alt.length ? `Next-best option: ${listOr(alt.map((a) => a.t.id))}.` : "Next-best option: first in line when a slot frees."}`;
          detail.unshift(handling);
        }
        break;
      }
    }

    // integrity and other flags
    for (const f of e.verify) if (!codes.includes(f.code)) codes.push(f.code);
    for (const f of e.info) if (!codes.includes(f.code)) codes.push(f.code);
    if (e.pinReleased) detail.unshift(`The earlier approval was released because ${e.pinReleased}.`);

    // plan for partners who move forward
    let plan = null;
    if (moving(e)) {
      const sameHub = evs.filter((o) => o !== e && moving(o) && o.app.pin && e.app.pin && o.app.pin.slice(0, 3) === e.app.pin.slice(0, 3)).map((o) => o.app.id);
      plan = buildPlan(
        policy,
        {
          app,
          tier: e.tier,
          space: app.space,
          floor: e.phase === 3 ? "Ground" : app.floor,
          pin: e.allocatedPin ?? app.pin,
          today: ctx.today,
          signals: e.sig,
          extraDocs: e.verify.filter((v) => v.task).map((v) => v.task!),
          clusterWith: sameHub,
        },
        w.ds.stores,
        w.asOfYear,
      );
      if (!plan.feasible) {
        codes.push("TARGET_INFEASIBLE");
        detail.push(`Target of ${app.targetMonths} months is too early: the plan needs ${plan.totalWeeks} weeks, so the earliest realistic opening is ${plan.earliestMonth}. This does not affect the decision.`);
      }
      if (e.sig.festival) {
        const f = nextFestival(policy, e.sig.festival.name, ctx.today);
        if (f) detail.push(plan.readyDate <= f.date ? `Opening before ${f.name} (${fmtDate(f.date)}) looks possible: ready by ${fmtDate(plan.readyDate)}.` : `Opening before ${f.name} (${fmtDate(f.date)}) is not possible; earliest is ${fmtMonth(plan.readyDate)}.`);
      }
      const cityN = cityCount.get((e.app.pin ?? "").slice(0, 3)) ?? 0;
      const capN = policy.density.capPerCityByTier[String(e.tier) as "1"];
      if (cityN > capN) {
        codes.push("DENSITY_CAP");
        detail.push(`Density check: ${cityN} stores and approvals in this city exceed the guide of ${capN} for Tier ${e.tier}. This is a warning for review, not a decline.`);
      }
      if ((app.experience ?? 0) === 0 && (app.size ?? 0) >= policy.capex.largeSpaceNoExperienceSqft) detail.push(`Guidance: ${app.size} sq ft with no retail experience is a big start; consider a smaller format or a mentor from a nearby store.`);
    }

    // nearest store evidence line
    if (e.nearest) detail.push(`Nearest store of ours: ${e.nearest.storeId} at pin ${e.nearest.pin}, ${e.nearest.km !== null ? `${e.nearest.km} km away` : `pin gap ${e.nearest.pinGap} (proxy; no coordinates for this pin)`}, opened ${e.nearest.year ?? "year unknown"}, ${e.nearest.risk} overlap.`);

    if (!rank && e.status === "ON_HOLD") {
      const pv = provisional();
      if (pv) rank = { k: pv.k, n: pv.n };
    }

    return {
      key: e.key,
      id: app.id,
      name: app.name,
      status: e.status,
      codes: dedupe(codes),
      flags,
      territoryKey: T?.key ?? null,
      territoryId: T?.id ?? null,
      pin: app.pin,
      allocatedPin: moving(e) ? e.allocatedPin : null,
      ready: e.ready,
      score: e.score,
      scoreProvisional: e.status === "ON_HOLD" || e.status === "DECLINED",
      bar: e.terr ? e.bar : null,
      rank,
      queuePos,
      ahead: e.status === "WAITLISTED" ? [...allocated.map((a) => a.app.id), ...pool.filter((p) => p.status === "WAITLISTED" && (queue.get(p.key) ?? 99) < (queuePos ?? 0)).map((p) => p.app.id)] : [],
      capex: e.capex,
      nearest: e.nearest,
      competitors: scored.filter((p) => p.key !== e.key).slice(0, 6).map((p) => ({ id: p.app.id, key: p.key, score: p.score?.total ?? null, status: p.status })),
      contested: e.loss?.kind === "contested" ? { against: e.loss.against!.app.id, gap: e.loss.gap ?? 0 } : undefined,
      redirect,
      freePinsOffered: freeOffer,
      why,
      detail: detail.filter(Boolean),
      nextStep,
      owner,
      asks,
      plan,
      pinned: e.pinned,
      promoted,
      handling,
      stability: stability(e, scored, cap),
    };
  }

  function stability(e: Ev, scored: Ev[], cap: number): Stability | undefined {
    if (!e.score || e.status === "WITHDRAWN") return undefined;
    const s = e.score.total;
    const m = policy.stability.scoreMargin;
    if (e.status === "ON_HOLD") return { label: "borderline", flip: "Depends on the missing detail; see what is needed above." };
    if (Math.abs(s - e.bar) <= m && e.status !== "DECLINED") return { label: "borderline", flip: `Score ${s} is within ${m} of the bar ${e.bar}; a ${s >= e.bar ? "drop" : "rise"} of ${Math.abs(s - e.bar) + (s >= e.bar ? 1 : 0)} point(s) would change the outcome.` };
    if (Math.abs(s - policy.bars.decline) <= m) return { label: "borderline", flip: `Score ${s} is within ${m} of the decline bar ${policy.bars.decline}.` };
    const idx = scored.findIndex((p) => p.key === e.key);
    if (idx >= 0 && cap > 0 && scored.length > cap) {
      const boundaryIn = scored[cap - 1];
      const boundaryOut = scored[cap];
      if (boundaryIn && boundaryOut && boundaryIn.ready === boundaryOut.ready) {
        const gap = Math.abs((boundaryIn.score?.total ?? 0) - (boundaryOut.score?.total ?? 0));
        if ((e === boundaryIn || e === boundaryOut) && gap <= policy.stability.rankMargin) return { label: "borderline", flip: `Only ${gap} point(s) separate ${boundaryIn.app.id} and ${boundaryOut.app.id} at the slot boundary.` };
      }
    }
    return { label: "robust", flip: e.status === "APPROVED" || e.status === "CONDITIONAL" ? `Would change only if the site, funds or rank changed materially (margin ${Math.abs(s - e.bar)} points over the bar).` : "No single small change flips this; see what would change it below." };
  }
}

function sortHolds(e: Ev) {
  return [...e.holds].sort((a, b) => HOLD_ORDER.indexOf(a.code) - HOLD_ORDER.indexOf(b.code));
}

function capexLine(e: Ev): string {
  const c = e.capex!;
  const parts = [`fit-out and stock ₹${c.fitoutStock} lakh (₹${c.fitoutPerSqft + c.stockPerSqft}/sq ft × ${c.sizeUsed} sq ft${c.sizeAssumed ? ", assumed size" : ""})`, `franchise fee ₹${c.franchiseFee} lakh`];
  if (c.deposit) parts.push(`deposit ₹${c.deposit} lakh`, `3 months' rent ₹${c.runway} lakh`);
  parts.push(`10% buffer ₹${c.buffer} lakh`);
  return `Estimate ₹${c.required} lakh = ${parts.join(" + ")}${c.invest !== null ? `; applicant has ₹${Math.round(c.invest * 10) / 10} lakh (${Math.round((c.ratio ?? 0) * 100)}%)` : ""}. Figures are illustrative and editable in Policy.`;
}

function dedupe<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}
