export type ManagerCoachingFacts = {
  events: { id: string; title: string; startsAt: Date | null; readiness?: { gaps: { code: string }[] } | null }[];
  deals: { id: string; title: string; status: string }[];
  invoices: { id: string; status: string; totalMinor: number; paidMinor: number }[];
  settlements: { id: string; status: string; event: { title: string } }[];
  prospects: { id: string; name: string; status: string }[];
};

export const MANAGER_COACHING_POLICY_VERSION = "manager_coaching_v1";

type CoachingConcept = {
  id: string;
  title: string;
  aliases: string[];
  definition: string;
  why: string;
  next: string;
  caution: string | null;
};

const concepts: CoachingConcept[] = [
  { id: "hold", title: "hold", aliases: ["soft hold", "date hold", "hold"], definition: "A hold is a temporary claim on a date while the buyer, venue, or band decides whether the show will happen. It is not a confirmed booking.", why: "Treating a hold like a confirmed show can create double-booking, travel, and availability problems.", next: "Keep the event or opportunity in hold status, record who must decide and by when, and confirm every member before changing it to confirmed.", caution: "Ask whether the hold has a position or expiration date; customs vary by buyer and market." },
  { id: "guarantee", title: "guarantee", aliases: ["guaranteed fee", "guarantee"], definition: "A guarantee is the minimum performance fee the buyer agrees to pay if the band fulfills the deal.", why: "It gives the band a floor for deciding whether the show covers travel, crew, and other costs.", next: "Record the amount, currency, deposit, balance due date, and cancellation terms in the deal before the show is treated as financially ready.", caution: "A guarantee can still depend on the written cancellation, force-majeure, tax, and performance terms. StoryBoard does not decide whether those terms are legally sufficient." },
  { id: "door_deal", title: "door deal", aliases: ["percentage of the door", "ticket split", "door split", "door deal"], definition: "A door deal pays the band from ticket revenue, usually as a stated percentage after specifically agreed deductions.", why: "The percentage alone is not enough; capacity, ticket price, comps, fees, and allowed expenses determine what the band may actually receive.", next: "Record the split and every permitted deduction in the offer, then enter attendance, gross, expenses, and the final calculation in the show settlement.", caution: "Do not assume what “net” means. Ask the buyer to name each deduction in writing." },
  { id: "backend", title: "backend", aliases: ["backend points", "backend"], definition: "Backend is additional pay tied to show results, often a percentage after an agreed threshold or after defined expenses.", why: "A strong-looking backend can be worth nothing if its threshold or deductions are unclear.", next: "Write the threshold, percentage, calculation base, deductions, and reporting evidence into the deal facts before comparing it with a flat guarantee.", caution: "Use the exact buyer language and have unclear contract terms reviewed; “backend” has no single universal calculation." },
  { id: "deposit", title: "deposit", aliases: ["booking deposit", "deposit"], definition: "A deposit is money paid before the performance and credited toward the total fee.", why: "It reduces cancellation and cash-flow risk and proves that the buyer is moving from interest to a real commitment.", next: "Record the amount and due date on the deal or invoice, then record the payment only when the band has actual evidence that funds arrived.", caution: "Do not mark a deposit paid from a promise, draft email, or pending transfer." },
  { id: "advance", title: "show advance", aliases: ["production advance", "advance checklist", "show advance", "advancing a show", "advance"], definition: "A show advance is the pre-show process of confirming the people, schedule, access, production, hospitality, payment, and day-of details with the venue or buyer.", why: "It turns a contract or booking into a show the band can actually execute without avoidable surprises.", next: "Open the gig in Band operations, build the advance checklist, assign owners, and confirm load-in, soundcheck, doors, set time, contacts, parking, production, hospitality, and payment timing.", caution: "Advancing confirms logistics; it does not replace an agreement or authorize StoryBoard to contact the buyer without approval." },
  { id: "stage_plot", title: "stage plot", aliases: ["stage diagram", "stage plot"], definition: "A stage plot is a simple overhead diagram showing where performers, instruments, monitors, power, and major equipment should be placed on stage.", why: "It helps the venue prepare space, power, monitor positions, and changeovers before the band arrives.", next: "Keep the current stage-plot link on the gig and verify that it matches the lineup and equipment for that show.", caution: "A stage plot shows placement; it does not replace the channel-by-channel input list." },
  { id: "input_list", title: "input list", aliases: ["channel list", "input list"], definition: "An input list is the ordered list of every microphone, direct box, playback feed, and other audio channel the band needs.", why: "It tells the audio team how many channels, stands, cables, direct boxes, and monitor mixes to prepare.", next: "Attach the current input-list link to the gig and make sure it agrees with the stage plot and actual lineup.", caution: "Name substitutions and special power or phantom-power needs explicitly instead of assuming the venue will infer them." },
  { id: "technical_rider", title: "technical rider", aliases: ["tech rider", "technical rider"], definition: "A technical rider describes the production conditions the band needs, such as sound, lighting, backline, stage dimensions, power, and crew.", why: "It gives the buyer enough detail to confirm what the room can supply and what the band must bring or rent.", next: "Link the reviewed rider to the gig, then turn any exception or missing item into an owned advance task.", caution: "A rider is only useful when the buyer has received and accepted the relevant requirements; a Drive link alone does not prove agreement." },
  { id: "hospitality_rider", title: "hospitality rider", aliases: ["hospitality requirements", "hospitality rider"], definition: "A hospitality rider lists practical non-production needs such as meals, water, dressing space, towels, guest access, or lodging.", why: "Clear, proportionate requests prevent day-of confusion and let the buyer price the deal accurately.", next: "Link the current rider to the gig and confirm important exceptions during the advance rather than assuming every venue follows it.", caution: "Separate genuine health or access needs from preferences, and avoid storing private health details in normal Manager memory." },
  { id: "deal_memo", title: "deal memo", aliases: ["deal summary", "deal memo"], definition: "A deal memo is a concise summary of the agreed business points: parties, date, place, fee structure, deposit, timing, production, cancellation, and other key terms.", why: "It exposes missing or contradictory terms before a longer agreement is generated.", next: "Review the offer facts in StoryBoard, generate a memo snapshot, and correct the source records before preparing delivery.", caution: "A deal memo is not automatically a signed contract and is not legal advice." },
  { id: "agreement", title: "performance agreement", aliases: ["performance contract", "booking contract", "agreement", "contract"], definition: "A performance agreement is the reviewed document that states what each party promises to do and what happens if plans change.", why: "It creates a shared written record for payment, timing, production, cancellation, and other responsibilities.", next: "Use only an owner-activated template, verify every merge field against the deal, review the PDF, and route delivery through Approvals.", caution: "StoryBoard templates are starting points, not legal advice. Use qualified legal review when the risk or terms warrant it." },
  { id: "invoice", title: "invoice", aliases: ["invoice"], definition: "An invoice is a request for payment that names the amount, payer, due date, payment instructions, and what the charge covers.", why: "It makes receivables trackable and gives both sides a reference for deposits and balances.", next: "Create the invoice from the agreed deal facts, verify the number and due date, and record payments only from real evidence.", caution: "An invoice requests money; it does not prove that money was received or settle the whole show." },
  { id: "settlement", title: "settlement", aliases: ["show settlement", "settlement statement", "settlement"], definition: "A settlement is the post-show money check: what the show earned, which expenses count, what was already paid, and what is still owed.", why: "It turns ticket counts and deal terms into a reviewable final result instead of relying on a verbal total.", next: "Record attendance, gross revenue, same-currency expenses, deposits, and the agreed split; review the calculation before finalizing the immutable statement.", caution: "Do not call net income final while expenses or deal terms are missing, and do not mix currencies in one calculation." },
  { id: "member_split", title: "member split", aliases: ["member payout", "band split", "member split"], definition: "A member split records how the band intends to divide a specific settlement or payout among performers and crew.", why: "Writing the split down prevents the final payment conversation from depending on memory or assumptions.", next: "Finalize the show settlement first, then enter splits that add up exactly to the distributable amount and record actual payouts separately.", caution: "StoryBoard can check the arithmetic, but it does not decide tax, employment, partnership, or fairness questions for the band." },
  { id: "radius_clause", title: "radius clause", aliases: ["radius restriction", "radius clause"], definition: "A radius clause limits where or when the artist may perform around a particular event.", why: "A broad restriction can block other useful shows and change the real value of an offer.", next: "Record the exact distance, dates, exceptions, and affected markets as deal facts before the band decides.", caution: "This is a legal restriction. Do not rely on a summary when deciding whether the written clause is acceptable." },
  { id: "buyout", title: "buyout", aliases: ["meal buyout", "hotel buyout", "hospitality buyout", "buyout"], definition: "A buyout is cash paid instead of providing a specific item or service, commonly meals, lodging, or local transport.", why: "The amount matters only relative to what the band must actually purchase in that market.", next: "Record what the buyout replaces, the amount, currency, payment timing, and who will handle the purchase.", caution: "Do not treat a general fee as a buyout unless the deal says what obligation it replaces." },
  { id: "merch_cut", title: "merch cut", aliases: ["merchandise commission", "merch percentage", "merch cut"], definition: "A merch cut is the venue or promoter's share of merchandise sales, sometimes calculated differently for soft goods and recorded music.", why: "It affects show profit and may come with staffing, tax, or payment conditions.", next: "Record the percentage, calculation base, excluded items, staffing arrangement, and settlement method before accepting the deal.", caution: "Ask whether the percentage applies to gross sales, sales after tax, or another base." },
  { id: "press_kit", title: "electronic press kit", aliases: ["electronic press kit", "press kit", "epk"], definition: "An electronic press kit is the short, buyer-ready package that explains who the band is and provides strong music, live video, photos, contact details, and useful proof.", why: "It lets a buyer judge fit quickly without searching across scattered links.", next: "Keep one current press-kit link in the booking profile and make the pitch match the kind of show being requested.", caution: "Use accurate, current claims; a larger-looking number is not useful if it cannot be supported." },
  { id: "music_publishing", title: "music publishing", aliases: ["song publishing", "music publishing", "publishing"], definition: "Music publishing is the business of administering the composition—the song itself, separate from any particular recording—and collecting or licensing money tied to that composition.", why: "A band can own a recording while different writers own the underlying song, so release and licensing decisions need both sides understood.", next: "Record the real writers, ownership agreement, and registration status outside assumptions; use a release project task to gather missing identifiers or registrations before launch.", caution: "Ownership, registration, and royalty rules vary by agreement and territory. StoryBoard does not determine legal ownership from credits or conversation." },
  { id: "pro", title: "performing-rights organization", aliases: ["performing rights organization", "performance rights organization", "performing rights society", "pro registration", "pro"], definition: "A performing-rights organization licenses certain public performances of compositions and distributes the collected royalties to registered writers and publishers under its rules.", why: "Correct writer, publisher, work, and setlist information helps eligible performances connect to the right accounts.", next: "Track the registration task in the release or business project and keep the exact work identifiers and writer splits with the authoritative rights records.", caution: "A PRO does not usually replace distribution, mechanical licensing, neighboring-rights collection, or legal ownership documentation." },
  { id: "master_rights", title: "master rights", aliases: ["sound recording rights", "master ownership", "master rights", "masters"], definition: "Master rights concern the specific recorded performance—the actual audio master—rather than the underlying song composition.", why: "Licensing, distribution revenue, and release control can depend on who owns or controls that recording.", next: "In the release project, record where final masters live, who approved them, and which signed agreement or authoritative record establishes control.", caution: "Possessing the audio file does not by itself prove ownership." },
  { id: "distribution", title: "music distribution", aliases: ["digital distribution", "music distributor", "distribution"], definition: "A music distributor delivers approved recordings and metadata to streaming and download services and reports the revenue it receives under its agreement.", why: "Release dates, artist names, credits, artwork, territories, and identifiers must be correct before delivery to avoid delays or split catalogs.", next: "Use a release project with a target date, owners, approved assets, metadata, and a delivery milestone; keep provider submission outside StoryBoard until a reviewed adapter exists.", caution: "Distribution does not automatically provide marketing, publishing administration, ownership clearance, or guaranteed placement." },
  { id: "isrc", title: "ISRC", aliases: ["international standard recording code", "isrc code", "isrc"], definition: "An ISRC is a unique identifier for a particular sound recording or music video version.", why: "Using one consistent identifier helps services and reports refer to the same recording instead of treating identical audio as unrelated versions.", next: "Store the authoritative identifier with the release metadata and verify that remixes, edits, and new recordings use the correct distinct code.", caution: "An ISRC identifies a recording; it does not prove copyright ownership or identify the underlying composition." },
  { id: "qualified_prospect", title: "qualified prospect", aliases: ["qualified lead", "qualified prospect"], definition: "A qualified prospect is a real buyer, venue, festival, or event lead that fits the band's market and has enough evidence to justify a next step.", why: "Qualification keeps the band from spending equal time on every name it finds.", next: "Confirm fit, location, type, contact path, notes, and why the opportunity is plausible before converting it or adding it to a campaign.", caution: "Qualified means worth pursuing, not guaranteed to book." }
];

const comparisons = new Map([
  ["door_deal|guarantee", "A guarantee sets a minimum fee. A door deal makes pay depend on ticket results and the agreed deductions. Compare the guarantee with a conservative door estimate—not the room's best-case sellout—and write down exactly how either amount is calculated."],
  ["agreement|deal_memo", "A deal memo is the concise business summary used to expose missing terms. An agreement is the reviewed document that states the parties' promises and remedies. The memo should be correct before it feeds an agreement, but it does not replace legal review or signature."],
  ["invoice|settlement", "An invoice asks for a defined payment. A settlement reconciles the show's actual financial result. A deposit invoice can exist before the show; the settlement usually comes after performance and may reveal the remaining balance."],
  ["input_list|stage_plot", "A stage plot shows where people and equipment go. An input list names the audio channels the sound team must connect. Most production teams need both, and the two documents should describe the same lineup."],
  ["hold|guarantee", "A hold reserves a possible date; a guarantee is a payment term. Neither one by itself proves the show is confirmed. Confirmation should depend on the buyer's commitment, the band's availability, and the actual deal record."],
  ["deal_memo|invoice", "A deal memo records what the parties believe they agreed. An invoice requests payment under those facts. Correct the deal first; do not use an invoice to paper over an unclear fee, payer, or due date."]
]);

const educationIntent = /\b(?:what(?:'s| is| does)|explain|define|meaning of|how does|how do|difference between|versus|\bvs\.?\b|don't understand|do not understand)\b/i;

function normalized(value: string) {
  return value.toLowerCase().replace(/[’]/g, "'").replace(/[^a-z0-9]+/g, " ").trim();
}

function containsAlias(question: string, alias: string) {
  const haystack = ` ${normalized(question)} `;
  const needle = ` ${normalized(alias)} `;
  return haystack.includes(needle);
}

export function managerCoachingTopics(question: string) {
  if (!educationIntent.test(question)) return [];
  return concepts
    .filter((concept) => concept.aliases.some((alias) => containsAlias(question, alias)))
    .sort((left, right) => Math.max(...right.aliases.map((alias) => alias.length)) - Math.max(...left.aliases.map((alias) => alias.length)))
    .filter((concept, index, matches) => !matches.slice(0, index).some((prior) => prior.aliases.some((alias) => concept.aliases.some((candidate) => normalized(alias).includes(normalized(candidate))))))
    .slice(0, 2);
}

export function managerUnrecognizedCoachingTopic(question: string) {
  if (managerCoachingTopics(question).length) return null;
  const match = /^\s*explain\s+(.{2,80}?)\s+in\s+plain\s+language[.!?]*\s*$/i.exec(question);
  const topic = match?.[1]?.trim() ?? "";
  if (!topic || /\b(?:our|we|us|current|next|priority|plan|goal|blocked|slipping|ready|money|memory|context|decision)\b/i.test(topic)) return null;
  return topic;
}

function relevantContext(concept: CoachingConcept, facts: ManagerCoachingFacts, now: Date) {
  if (["settlement", "member_split"].includes(concept.id)) {
    const drafts = facts.settlements.filter((row) => row.status === "draft");
    return drafts.length ? { line: `You currently have ${drafts.length} draft settlement${drafts.length === 1 ? "" : "s"} waiting for review.`, ids: drafts.slice(0, 4).map((row) => row.id) } : null;
  }
  if (["invoice", "deposit"].includes(concept.id)) {
    const open = facts.invoices.filter((row) => row.status !== "paid" && row.totalMinor > row.paidMinor);
    return open.length ? { line: `StoryBoard currently shows ${open.length} invoice${open.length === 1 ? "" : "s"} with a remaining balance.`, ids: open.slice(0, 4).map((row) => row.id) } : null;
  }
  if (["guarantee", "door_deal", "backend", "deal_memo", "agreement", "radius_clause", "buyout", "merch_cut"].includes(concept.id)) {
    const active = facts.deals.filter((row) => !["declined", "expired"].includes(row.status));
    return active.length ? { line: `There ${active.length === 1 ? "is" : "are"} ${active.length} active deal record${active.length === 1 ? "" : "s"} where this may matter.`, ids: active.slice(0, 4).map((row) => row.id) } : null;
  }
  if (["advance", "stage_plot", "input_list", "technical_rider", "hospitality_rider"].includes(concept.id)) {
    const upcoming = facts.events.filter((row) => row.startsAt && row.startsAt >= now).slice(0, 4);
    const missingAdvance = upcoming.filter((row) => row.readiness?.gaps.some((gap) => gap.code === "advance_missing"));
    const selected = missingAdvance.length ? missingAdvance : upcoming;
    return selected.length ? { line: missingAdvance.length ? `${missingAdvance.length} upcoming show${missingAdvance.length === 1 ? " does" : "s do"} not yet have a generated advance checklist.` : `${selected.length} upcoming event${selected.length === 1 ? " is" : "s are"} available to review in Band operations.`, ids: selected.map((row) => row.id) } : null;
  }
  if (concept.id === "qualified_prospect") {
    const qualified = facts.prospects.filter((row) => row.status === "qualified");
    return qualified.length ? { line: `The booking board currently has ${qualified.length} qualified prospect${qualified.length === 1 ? "" : "s"}.`, ids: qualified.slice(0, 4).map((row) => row.id) } : null;
  }
  return null;
}

export function deterministicManagerCoaching(facts: ManagerCoachingFacts, question: string, now = new Date()) {
  const matched = managerCoachingTopics(question);
  if (!matched.length) {
    const unknownTopic = managerUnrecognizedCoachingTopic(question);
    return unknownTopic ? { topicIds: [], answer: `I do not have a reviewed StoryBoard explainer for “${unknownTopic}” yet, and I do not want to guess. Where did the term come up—a booking offer, contract, release, royalty statement, or something else? That context determines the useful answer.`, citations: [] } : null;
  }
  if (matched.length === 2 && /\b(?:difference|versus|vs\.?|compare)\b/i.test(question)) {
    const key = matched.map((concept) => concept.id).sort().join("|");
    const comparison = comparisons.get(key);
    if (comparison) {
      const contexts = matched.map((concept) => relevantContext(concept, facts, now)).filter((value): value is NonNullable<typeof value> => Boolean(value));
      return { topicIds: matched.map((concept) => concept.id), answer: `${comparison}${contexts[0] ? `\n\nIn your workspace: ${contexts[0].line}` : ""}`, citations: [...new Set(contexts.flatMap((context) => context.ids))].slice(0, 8) };
    }
  }
  const concept = matched[0]!;
  const context = relevantContext(concept, facts, now);
  const caution = concept.caution ? `\n\nWatch for: ${concept.caution}` : "";
  return {
    topicIds: [concept.id],
    answer: `${concept.definition}\n\nWhy it matters: ${concept.why}\n\nIn StoryBoard: ${concept.next}${context ? `\n\nIn your workspace: ${context.line}` : ""}${caution}`,
    citations: context?.ids ?? []
  };
}

export function managerCoachingConceptIds() {
  return concepts.map((concept) => concept.id);
}
