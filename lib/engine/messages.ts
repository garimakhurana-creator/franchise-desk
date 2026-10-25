// Applicant-facing message drafts in the preferred language. Never exposes other applicants' data
// and never asks for a fee before verification and a signed agreement.
import type { ReasonCode } from "./codes";
import { fmtDate, addDays } from "./plan";
import type { Policy } from "./policy";
import type { Decision, Lang } from "./types";

type Pack = {
  approved: string;
  condSite: string;
  condDoc: string;
  hold: string;
  wait: string;
  waitPin: string;
  declined: string;
  withdrawn: string;
  team: string;
  asks: Partial<Record<ReasonCode, string>> & { default: string };
  tasks: Partial<Record<ReasonCode, string>> & { default: string };
  reasons: Partial<Record<ReasonCode, string>> & { closed: string; default: string };
};

const EN: Pack = {
  approved: "Dear {name}, good news: your application {id} for a store at pin {pin} is approved. Next: KYC and the franchise agreement in weeks 1 to 2. Your {weeks}-week {track} training will be in English. No fee is due until your documents are verified and the agreement is signed.",
  condSite: "Dear {name}, we have reserved a slot for you in {city} until {date}. To confirm it, please find a ground-floor space of at least {min} sq ft in pin {pins} and send us the details.",
  condDoc: "Dear {name}, we have reserved a slot for you at pin {pin} until {date}. To confirm it, please send: {task}. No fee is due until your documents are verified and the agreement is signed.",
  hold: "Dear {name}, before we can decide on application {id} we need: {ask}. Please reply within 14 days.",
  wait: "Dear {name}, you are number {q} on the waiting list for {city}. Another applicant ranked higher for the available slot. We will contact you as soon as a slot opens.",
  waitPin: " A space in pin {pins} would keep you eligible.",
  declined: "Dear {name}, we cannot proceed with application {id} right now: {reason}. You are welcome to re-apply whenever this changes.",
  withdrawn: "Dear {name}, we have recorded the withdrawal of application {id}. Thank you for your interest.",
  team: " – Expansion team",
  asks: {
    PIN_MISSING: "the correct 6-digit pin code",
    PIN_INVALID: "the correct 6-digit pin code",
    CITY_PIN_MISMATCH: "the correct city or pin code of the store",
    SPACE_SIZE_MISSING: "the size of the space in sq ft",
    FLOOR_UNKNOWN: "the floor of the space (ground, upper or mall)",
    SPACE_CONTRADICTION: "whether you have a space and, if so, its size and floor",
    UNIT_ERROR: "confirmation of your investment amount in lakh",
    FUNDING_GAP: "proof of funds or a co-investor",
    PIN_HAS_STORE: "a space in a free pin code ({pins})",
    SAME_PROPERTY_CLAIM: "the title deed or registered lease for the property",
    NOTE_CONFLICT: "confirmation of your investment amount with a bank statement",
    EXPERIENCE_CONFLICT: "the correct years of retail experience",
    SPACE_SMALL: "a space of at least {min} sq ft",
    default: "the missing details in your application",
  },
  tasks: {
    LOAN_DEPENDENT: "the bank's loan sanction letter",
    FUZZY_IDENTITY: "PAN and Aadhaar for an identity check",
    WEAK_TITLE: "the title deed or a registered lease",
    CONFLICT_OF_INTEREST: "a signed non-compete declaration",
    COMPLIANCE_CUE: "bank records showing the source of funds",
    CAPACITY_OUTLIER: "proof and source of funds",
    SLOT_SQUATTING: "identity confirmation and the site you want to pursue",
    default: "the requested documents",
  },
  reasons: {
    OUT_OF_TERRITORY: "pin {pin} is outside the areas where we are opening stores",
    INVEST_LOW: "the investment is well below our estimate of ₹{req} lakh for this store",
    PIN_HAS_STORE_NO_ALT: "we already have a store at this pin and the area has no other free pin",
    BELOW_BAR: "your score of {s} is below our minimum",
    closed: "we did not receive the requested details within 14 days",
    default: "the application does not clear one of our opening rules",
  },
};

const HI: Pack = {
  approved: "प्रिय {name}, खुशखबरी! पिन {pin} पर स्टोर के लिए आपका आवेदन {id} स्वीकृत हो गया है। अगला कदम: पहले दो हफ्तों में KYC और फ्रैंचाइज़ी अनुबंध। आपका {weeks} हफ्ते का प्रशिक्षण हिंदी में होगा। दस्तावेज़ों के सत्यापन और अनुबंध पर हस्ताक्षर से पहले कोई शुल्क नहीं लिया जाएगा।",
  condSite: "प्रिय {name}, हमने {date} तक {city} में आपके लिए एक स्लॉट आरक्षित किया है। इसे पक्का करने के लिए कृपया पिन {pins} में कम से कम {min} वर्ग फुट की ग्राउंड फ्लोर जगह ढूंढकर हमें बताएं।",
  condDoc: "प्रिय {name}, हमने {date} तक पिन {pin} पर आपके लिए स्लॉट आरक्षित किया है। इसे पक्का करने के लिए कृपया यह भेजें: {task}। दस्तावेज़ों के सत्यापन और अनुबंध पर हस्ताक्षर से पहले कोई शुल्क नहीं लिया जाएगा।",
  hold: "प्रिय {name}, आवेदन {id} पर निर्णय लेने से पहले हमें यह जानकारी चाहिए: {ask}। कृपया 14 दिनों के भीतर जवाब दें।",
  wait: "प्रिय {name}, आप {city} की प्रतीक्षा सूची में {q} नंबर पर हैं। उपलब्ध स्लॉट के लिए किसी अन्य आवेदक की रैंक अधिक थी। स्लॉट खुलते ही हम आपसे संपर्क करेंगे।",
  waitPin: " पिन {pins} में जगह मिलने पर आप पात्र बने रहेंगे।",
  declined: "प्रिय {name}, फिलहाल हम आवेदन {id} पर आगे नहीं बढ़ सकते: {reason}। स्थिति बदलने पर आप कभी भी दोबारा आवेदन कर सकते हैं।",
  withdrawn: "प्रिय {name}, हमने आवेदन {id} की वापसी दर्ज कर ली है। आपकी रुचि के लिए धन्यवाद।",
  team: " – विस्तार टीम",
  asks: {
    PIN_MISSING: "सही 6 अंकों का पिन कोड",
    PIN_INVALID: "सही 6 अंकों का पिन कोड",
    CITY_PIN_MISMATCH: "स्टोर का सही शहर या पिन कोड",
    SPACE_SIZE_MISSING: "जगह का आकार (वर्ग फुट में)",
    FLOOR_UNKNOWN: "जगह किस मंजिल पर है (ग्राउंड, ऊपरी या मॉल)",
    SPACE_CONTRADICTION: "क्या आपके पास जगह है, और है तो उसका आकार और मंजिल",
    UNIT_ERROR: "निवेश राशि की पुष्टि (लाख रुपये में)",
    FUNDING_GAP: "धन का प्रमाण या सह-निवेशक",
    PIN_HAS_STORE: "किसी खाली पिन कोड ({pins}) में जगह",
    SAME_PROPERTY_CLAIM: "संपत्ति का मालिकाना हक दस्तावेज़ या पंजीकृत किराया अनुबंध",
    NOTE_CONFLICT: "बैंक स्टेटमेंट के साथ निवेश राशि की पुष्टि",
    EXPERIENCE_CONFLICT: "खुदरा अनुभव के सही वर्ष",
    SPACE_SMALL: "कम से कम {min} वर्ग फुट की जगह",
    default: "आवेदन में छूटी हुई जानकारी",
  },
  tasks: {
    LOAN_DEPENDENT: "बैंक ऋण स्वीकृति पत्र",
    FUZZY_IDENTITY: "पहचान जांच के लिए PAN और आधार",
    WEAK_TITLE: "मालिकाना हक दस्तावेज़ या पंजीकृत किराया अनुबंध",
    CONFLICT_OF_INTEREST: "हस्ताक्षरित गैर-प्रतिस्पर्धा घोषणा",
    COMPLIANCE_CUE: "धन के स्रोत के बैंक रिकॉर्ड",
    CAPACITY_OUTLIER: "धन का प्रमाण और स्रोत",
    SLOT_SQUATTING: "पहचान की पुष्टि और आप कौन सी जगह चुनना चाहते हैं",
    default: "मांगे गए दस्तावेज़",
  },
  reasons: {
    OUT_OF_TERRITORY: "पिन {pin} उन क्षेत्रों से बाहर है जहां हम स्टोर खोल रहे हैं",
    INVEST_LOW: "निवेश राशि इस स्टोर की अनुमानित लागत ₹{req} लाख से काफी कम है",
    PIN_HAS_STORE_NO_ALT: "इस पिन पर हमारा स्टोर पहले से है और इस क्षेत्र में कोई और खाली पिन नहीं है",
    BELOW_BAR: "आपका स्कोर {s} हमारी न्यूनतम सीमा से कम है",
    closed: "मांगी गई जानकारी 14 दिनों में नहीं मिली",
    default: "आवेदन हमारे एक नियम पर खरा नहीं उतरता",
  },
};

const KN: Pack = {
  approved: "ಆತ್ಮೀಯ {name}, ಶುಭ ಸುದ್ದಿ! ಪಿನ್ {pin} ನಲ್ಲಿ ಮಳಿಗೆ ತೆರೆಯಲು ನಿಮ್ಮ ಅರ್ಜಿ {id} ಅನುಮೋದನೆಗೊಂಡಿದೆ. ಮುಂದಿನ ಹಂತ: ಮೊದಲ ಎರಡು ವಾರಗಳಲ್ಲಿ KYC ಮತ್ತು ಫ್ರಾಂಚೈಸಿ ಒಪ್ಪಂದ. ನಿಮ್ಮ {weeks} ವಾರಗಳ ತರಬೇತಿ ಕನ್ನಡದಲ್ಲಿ ನಡೆಯುತ್ತದೆ. ದಾಖಲೆ ಪರಿಶೀಲನೆ ಮತ್ತು ಒಪ್ಪಂದಕ್ಕೆ ಸಹಿ ಆಗುವವರೆಗೆ ಯಾವುದೇ ಶುಲ್ಕ ಪಡೆಯುವುದಿಲ್ಲ.",
  condSite: "ಆತ್ಮೀಯ {name}, {date} ವರೆಗೆ {city} ನಲ್ಲಿ ನಿಮಗಾಗಿ ಒಂದು ಸ್ಲಾಟ್ ಕಾಯ್ದಿರಿಸಲಾಗಿದೆ. ಅದನ್ನು ಖಚಿತಪಡಿಸಲು ಪಿನ್ {pins} ನಲ್ಲಿ ಕನಿಷ್ಠ {min} ಚದರ ಅಡಿಯ ನೆಲ ಮಹಡಿಯ ಜಾಗವನ್ನು ಹುಡುಕಿ ನಮಗೆ ತಿಳಿಸಿ.",
  condDoc: "ಆತ್ಮೀಯ {name}, {date} ವರೆಗೆ ಪಿನ್ {pin} ನಲ್ಲಿ ನಿಮಗಾಗಿ ಸ್ಲಾಟ್ ಕಾಯ್ದಿರಿಸಲಾಗಿದೆ. ಅದನ್ನು ಖಚಿತಪಡಿಸಲು ದಯವಿಟ್ಟು ಇದನ್ನು ಕಳುಹಿಸಿ: {task}. ದಾಖಲೆ ಪರಿಶೀಲನೆ ಮತ್ತು ಒಪ್ಪಂದಕ್ಕೆ ಸಹಿ ಆಗುವವರೆಗೆ ಯಾವುದೇ ಶುಲ್ಕ ಪಡೆಯುವುದಿಲ್ಲ.",
  hold: "ಆತ್ಮೀಯ {name}, ಅರ್ಜಿ {id} ಕುರಿತು ನಿರ್ಧರಿಸುವ ಮೊದಲು ನಮಗೆ ಈ ಮಾಹಿತಿ ಬೇಕು: {ask}. ದಯವಿಟ್ಟು 14 ದಿನಗಳೊಳಗೆ ಉತ್ತರಿಸಿ.",
  wait: "ಆತ್ಮೀಯ {name}, {city} ಗಾಗಿ ಕಾಯುವ ಪಟ್ಟಿಯಲ್ಲಿ ನೀವು {q}ನೇ ಸ್ಥಾನದಲ್ಲಿದ್ದೀರಿ. ಲಭ್ಯವಿರುವ ಸ್ಲಾಟ್‌ಗೆ ಇನ್ನೊಬ್ಬ ಅರ್ಜಿದಾರರು ಹೆಚ್ಚಿನ ಶ್ರೇಣಿ ಪಡೆದಿದ್ದಾರೆ. ಸ್ಲಾಟ್ ತೆರೆದ ತಕ್ಷಣ ನಾವು ನಿಮ್ಮನ್ನು ಸಂಪರ್ಕಿಸುತ್ತೇವೆ.",
  waitPin: " ಪಿನ್ {pins} ನಲ್ಲಿ ಜಾಗ ಸಿಕ್ಕರೆ ನೀವು ಅರ್ಹರಾಗಿಯೇ ಇರುತ್ತೀರಿ.",
  declined: "ಆತ್ಮೀಯ {name}, ಸದ್ಯಕ್ಕೆ ಅರ್ಜಿ {id} ಯೊಂದಿಗೆ ಮುಂದುವರಿಯಲು ಸಾಧ್ಯವಿಲ್ಲ: {reason}. ಪರಿಸ್ಥಿತಿ ಬದಲಾದಾಗ ನೀವು ಮತ್ತೆ ಅರ್ಜಿ ಸಲ್ಲಿಸಬಹುದು.",
  withdrawn: "ಆತ್ಮೀಯ {name}, ಅರ್ಜಿ {id} ಹಿಂಪಡೆದಿರುವುದನ್ನು ನಾವು ದಾಖಲಿಸಿದ್ದೇವೆ. ನಿಮ್ಮ ಆಸಕ್ತಿಗೆ ಧನ್ಯವಾದಗಳು.",
  team: " – ವಿಸ್ತರಣಾ ತಂಡ",
  asks: {
    PIN_MISSING: "ಸರಿಯಾದ 6 ಅಂಕಿಯ ಪಿನ್ ಕೋಡ್",
    PIN_INVALID: "ಸರಿಯಾದ 6 ಅಂಕಿಯ ಪಿನ್ ಕೋಡ್",
    CITY_PIN_MISMATCH: "ಮಳಿಗೆಯ ಸರಿಯಾದ ನಗರ ಅಥವಾ ಪಿನ್ ಕೋಡ್",
    SPACE_SIZE_MISSING: "ಜಾಗದ ಗಾತ್ರ (ಚದರ ಅಡಿಗಳಲ್ಲಿ)",
    FLOOR_UNKNOWN: "ಜಾಗ ಯಾವ ಮಹಡಿಯಲ್ಲಿದೆ (ನೆಲ, ಮೇಲಿನ ಅಥವಾ ಮಾಲ್)",
    SPACE_CONTRADICTION: "ನಿಮ್ಮ ಬಳಿ ಜಾಗ ಇದೆಯೇ, ಇದ್ದರೆ ಅದರ ಗಾತ್ರ ಮತ್ತು ಮಹಡಿ",
    UNIT_ERROR: "ಹೂಡಿಕೆ ಮೊತ್ತದ ದೃಢೀಕರಣ (ಲಕ್ಷ ರೂಪಾಯಿಗಳಲ್ಲಿ)",
    FUNDING_GAP: "ಹಣದ ಪುರಾವೆ ಅಥವಾ ಸಹ-ಹೂಡಿಕೆದಾರ",
    PIN_HAS_STORE: "ಖಾಲಿ ಪಿನ್ ಕೋಡ್‌ನಲ್ಲಿ ({pins}) ಜಾಗ",
    SAME_PROPERTY_CLAIM: "ಆಸ್ತಿಯ ಮಾಲೀಕತ್ವ ಪತ್ರ ಅಥವಾ ನೋಂದಾಯಿತ ಬಾಡಿಗೆ ಒಪ್ಪಂದ",
    NOTE_CONFLICT: "ಬ್ಯಾಂಕ್ ಸ್ಟೇಟ್‌ಮೆಂಟ್‌ನೊಂದಿಗೆ ಹೂಡಿಕೆ ಮೊತ್ತದ ದೃಢೀಕರಣ",
    EXPERIENCE_CONFLICT: "ಚಿಲ್ಲರೆ ವ್ಯಾಪಾರ ಅನುಭವದ ಸರಿಯಾದ ವರ್ಷಗಳು",
    SPACE_SMALL: "ಕನಿಷ್ಠ {min} ಚದರ ಅಡಿಯ ಜಾಗ",
    default: "ಅರ್ಜಿಯಲ್ಲಿ ಬಿಟ್ಟುಹೋದ ಮಾಹಿತಿ",
  },
  tasks: {
    LOAN_DEPENDENT: "ಬ್ಯಾಂಕ್ ಸಾಲ ಮಂಜೂರಾತಿ ಪತ್ರ",
    FUZZY_IDENTITY: "ಗುರುತಿನ ಪರಿಶೀಲನೆಗಾಗಿ PAN ಮತ್ತು ಆಧಾರ್",
    WEAK_TITLE: "ಮಾಲೀಕತ್ವ ಪತ್ರ ಅಥವಾ ನೋಂದಾಯಿತ ಬಾಡಿಗೆ ಒಪ್ಪಂದ",
    CONFLICT_OF_INTEREST: "ಸಹಿ ಮಾಡಿದ ಸ್ಪರ್ಧಾತ್ಮಕವಲ್ಲದ ಘೋಷಣೆ",
    COMPLIANCE_CUE: "ಹಣದ ಮೂಲ ತೋರಿಸುವ ಬ್ಯಾಂಕ್ ದಾಖಲೆಗಳು",
    CAPACITY_OUTLIER: "ಹಣದ ಪುರಾವೆ ಮತ್ತು ಮೂಲ",
    SLOT_SQUATTING: "ಗುರುತಿನ ದೃಢೀಕರಣ ಮತ್ತು ನೀವು ಮುಂದುವರಿಸಲು ಬಯಸುವ ಜಾಗ",
    default: "ಕೇಳಿದ ದಾಖಲೆಗಳು",
  },
  reasons: {
    OUT_OF_TERRITORY: "ಪಿನ್ {pin} ನಾವು ಮಳಿಗೆ ತೆರೆಯುತ್ತಿರುವ ಪ್ರದೇಶಗಳ ಹೊರಗಿದೆ",
    INVEST_LOW: "ಹೂಡಿಕೆ ಮೊತ್ತವು ಈ ಮಳಿಗೆಯ ಅಂದಾಜು ವೆಚ್ಚ ₹{req} ಲಕ್ಷಕ್ಕಿಂತ ಬಹಳ ಕಡಿಮೆ ಇದೆ",
    PIN_HAS_STORE_NO_ALT: "ಈ ಪಿನ್‌ನಲ್ಲಿ ಈಗಾಗಲೇ ನಮ್ಮ ಮಳಿಗೆ ಇದೆ ಮತ್ತು ಈ ಪ್ರದೇಶದಲ್ಲಿ ಬೇರೆ ಖಾಲಿ ಪಿನ್ ಇಲ್ಲ",
    BELOW_BAR: "ನಿಮ್ಮ ಅಂಕ {s} ನಮ್ಮ ಕನಿಷ್ಠ ಮಿತಿಗಿಂತ ಕಡಿಮೆ ಇದೆ",
    closed: "ಕೇಳಿದ ಮಾಹಿತಿ 14 ದಿನಗಳಲ್ಲಿ ಬಂದಿಲ್ಲ",
    default: "ಅರ್ಜಿ ನಮ್ಮ ಒಂದು ನಿಯಮವನ್ನು ಪೂರೈಸುವುದಿಲ್ಲ",
  },
};

const PACKS: Record<Lang, Pack> = { English: EN, Hindi: HI, Kannada: KN };

export function applicantMessage(d: Decision, opts: { lang: Lang | null; city: string | null; today: string; policy: Policy }): { lang: Lang; text: string } {
  const lang = opts.lang ?? "English";
  const P = PACKS[lang];
  const tier = d.capex?.tier ?? 2;
  const min = opts.policy.capex.minSize[String(tier) as "1"];
  const date = fmtDate(addDays(opts.today, opts.policy.windows.conditionalDays));
  const pins = d.freePinsOffered.slice(0, 3).join(", ");
  const name = d.name || (lang === "English" ? "applicant" : lang === "Hindi" ? "आवेदक" : "ಅರ್ಜಿದಾರರೇ");
  const fill = (s: string, extra: Record<string, string | number> = {}) =>
    s.replace(/\{(\w+)\}/g, (_, k) => String(({ name, id: d.id, pin: d.allocatedPin ?? d.pin ?? "", city: opts.city ?? "", date, min, pins, q: d.queuePos ?? 1, weeks: d.plan?.training.weeks ?? 2, track: d.plan?.training.track ?? "", req: d.capex?.required ?? "", s: d.score?.total ?? "", ...extra } as Record<string, string | number>)[k] ?? ""));
  const pick = <K extends string>(table: Partial<Record<K, string>> & { default: string }, code?: string) => (code && (table as Record<string, string>)[code]) || table.default;
  let text: string;
  switch (d.status) {
    case "APPROVED":
      text = fill(P.approved);
      break;
    case "CONDITIONAL": {
      const check = d.flags.find((f) => f.task && f.code !== "CLAIM_UNVERIFIED");
      text = !d.allocatedPin ? fill(P.condSite) : fill(P.condDoc, { task: pick(P.tasks, check?.code) });
      break;
    }
    case "ON_HOLD":
      text = fill(P.hold, { ask: fill(pick(P.asks, d.codes[0])) });
      break;
    case "WAITLISTED":
      text = fill(P.wait) + (pins ? fill(P.waitPin) : "");
      break;
    case "DECLINED": {
      const closed = /no reply in \d+ days/.test(d.why);
      text = fill(P.declined, { reason: fill(closed ? P.reasons.closed : pick(P.reasons, d.codes[0])) });
      break;
    }
    default:
      text = fill(P.withdrawn);
  }
  return { lang, text: text + P.team };
}
