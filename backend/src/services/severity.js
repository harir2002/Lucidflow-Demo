/**
 * IRDAI Dark Pattern Severity Matrix
 * Sources:
 *   - CCPA Guidelines for Prevention and Regulation of Dark Patterns — Nov 30, 2023
 *   - IRDAI Directive — April 2, 2026
 *   - Consumer Protection Act 2019 — Section 2(47) & Section 18
 *   - Motor Vehicles Act — PA Cover mandate
 *   - DPDP Act 2023 — Consent requirements
 */

const SEVERITY_RULES = [
  { id: 1, name: 'False Urgency', rules: [
    { severity: 'HIGH',   condition: 'Countdown timer on premium quote that resets or is artificial', signals: ['countdown', 'timer resets', 'offer expires in', 'hurry'] },
    { severity: 'HIGH',   condition: '"Only X policies left" — unverifiable scarcity claim', signals: ['only', 'left at this rate', 'last few remaining'] },
    { severity: 'MEDIUM', condition: 'Social proof pressure — "1000 people viewing" without real-time verification', signals: ['people viewing', 'customers watching', 'popular right now'] },
    { severity: 'LOW',    condition: 'Renewal reminders with mildly exaggerated urgency — factually accurate', signals: ['renew now', 'policy lapsing soon', 'act fast'] },
  ]},
  { id: 2, name: 'Basket Sneaking', rules: [
    { severity: 'HIGH',   condition: 'Add-on pre-ticked by default at checkout (PA, hospital cash, zero-dep, roadside)', signals: ['pre-checked', 'checked by default', 'pre-selected', 'auto-added', 'ticked'] },
    { severity: 'HIGH',   condition: 'GST or mandatory fee revealed only at final payment step', signals: ['gst added at checkout', 'taxes added later', 'additional charges at payment'] },
    { severity: 'MEDIUM', condition: 'Optional service bundled without clear opt-out at point of display', signals: ['included', 'bundled for you', 'added for your convenience'] },
    { severity: 'LOW',    condition: '"Recommended" label on add-on but not pre-checked', signals: ['recommended', 'most popular', 'suggested add-on'] },
  ]},
  { id: 3, name: 'Confirm Shaming', rules: [
    { severity: 'HIGH',   condition: 'Opt-out uses guilt/self-incriminating language', signals: ["don't want to protect", 'i agree i have no', 'i accept i am unprotected', 'i agree i do not'] },
    { severity: 'HIGH',   condition: 'PA waiver forces user to "agree" to negative statement to decline', signals: ['by not choosing pa', 'by not selecting pa', 'agree the following'] },
    { severity: 'MEDIUM', condition: 'Decline button significantly smaller or visually suppressed vs accept', signals: ['small decline button', 'greyed out no', 'hidden opt-out'] },
    { severity: 'LOW',    condition: 'Mild negative framing on opt-out but no guilt language', signals: ['skip for now', 'maybe later', 'not interested'] },
  ]},
  { id: 4, name: 'Forced Action', rules: [
    { severity: 'HIGH',   condition: 'Policy cancellation only by phone/branch — no online pathway', signals: ['call to cancel', 'visit branch to cancel', 'cancellation only by phone', 'write to cancel'] },
    { severity: 'HIGH',   condition: 'App download mandatory to access policy documents or file a claim', signals: ['download app to continue', 'app required', 'only available on app'] },
    { severity: 'MEDIUM', condition: 'OTP/phone number required before any premium quote is shown', signals: ['enter mobile to get quote', 'verify number to proceed', 'otp before quote'] },
    { severity: 'MEDIUM', condition: 'Account creation mandatory before any pricing shown', signals: ['sign up to see prices', 'create account to continue', 'register to view'] },
    { severity: 'LOW',    condition: 'Phone/lead form prominent but product info still visible below', signals: ['get a call today', 'request callback', 'connect with us'] },
  ]},
  { id: 5, name: 'Subscription Trap', rules: [
    { severity: 'HIGH',   condition: 'Auto-renewal with no opt-out and no pre-renewal notification', signals: ['auto-renews', 'automatically renewed without notice', 'charged automatically'] },
    { severity: 'HIGH',   condition: 'No online cancellation — only phone/branch/letter accepted', signals: ['write to cancel', 'visit office to cancel', 'helpline to cancel only'] },
    { severity: 'MEDIUM', condition: 'Auto-renewal default with opt-out buried in fine print', signals: ['auto-renewal enabled by default', 'renewed unless you call', 'will be renewed unless'] },
    { severity: 'LOW',    condition: 'Renewal reminder sent but opt-out link small/not prominent', signals: ['renewal reminder', 'policy renewing soon'] },
  ]},
  { id: 6, name: 'Bait & Switch', rules: [
    { severity: 'HIGH',   condition: 'Headline price excludes mandatory PA cover', signals: ['without pa cover', 'excluding personal accident', 'base third party only', 'without including pa'] },
    { severity: 'HIGH',   condition: 'Headline price excludes GST — checkout price materially higher', signals: ['plus gst', 'excluding gst', 'before tax', 'exclusive of 18%'] },
    { severity: 'HIGH',   condition: '"Comprehensive coverage" without waiting period disclosure', signals: ['comprehensive coverage', 'all pre-existing covered', 'no waiting period', 'fully covered from day one'] },
    { severity: 'MEDIUM', condition: 'Price applies only to narrow category, not disclosed at headline', signals: ['below 75cc', 'below 1000cc', 'for select models', 'specific conditions'] },
    { severity: 'LOW',    condition: 'Statistical claims without time-period qualifier', signals: ['crore customers', 'gross written premium', 'policies issued'] },
  ]},
  { id: 7, name: 'Drip Pricing', rules: [
    { severity: 'HIGH',   condition: 'GST (18%) not shown until final payment screen', signals: ['gst not shown', 'tax added at checkout', 'exclusive of all taxes'] },
    { severity: 'HIGH',   condition: 'Mandatory PA cover cost revealed only at final checkout', signals: ['pa cover added at checkout', 'mandatory cover included at payment', 'pa cost revealed'] },
    { severity: 'MEDIUM', condition: 'Stamp duty or policy issuance fee shown only at payment step', signals: ['stamp duty', 'policy fee', 'issuance charge', 'processing fee added'] },
    { severity: 'MEDIUM', condition: 'EMI shown as monthly only — total cost not displayed', signals: ['per month', 'monthly premium', 'emi option', 'pay monthly'] },
    { severity: 'LOW',    condition: '"Starting from" price with conditions not immediately adjacent', signals: ['starting from', 'from only', 'as low as'] },
  ]},
  { id: 8, name: 'Disguised Ads', rules: [
    { severity: 'HIGH',   condition: 'Sponsored plan in comparison flow without "Sponsored"/"Ad" label', signals: ['no ad label', 'featured without disclosure', 'top result undisclosed'] },
    { severity: 'MEDIUM', condition: 'Editorial-style article promotes own products without "promotional" label', signals: ['knowledge centre', 'expert advice', 'our recommendation without label'] },
    { severity: 'MEDIUM', condition: 'Partner/co-branded product presented as unbiased recommendation', signals: ['irctc', 'tnscb', 'co-branded undisclosed', 'partner product'] },
    { severity: 'LOW',    condition: 'Promotional widget in informational page without label', signals: ['discover the perfect plan', 'get a quote widget', 'sidebar promotion'] },
  ]},
  { id: 9, name: 'Trick Questions', rules: [
    { severity: 'HIGH',   condition: 'Double-negative checkbox — "Uncheck to not receive offers"', signals: ['uncheck to not', 'deselect to opt out', 'untick to stop receiving'] },
    { severity: 'HIGH',   condition: 'Marketing consent pre-ticked and bundled with policy purchase', signals: ['pre-selected consent', 'marketing checkbox ticked', 'bundled consent pre-checked'] },
    { severity: 'MEDIUM', condition: 'Data sharing bundled into single T&C acceptance click', signals: ['by clicking you agree', 'by proceeding you consent', 'terms include data sharing'] },
    { severity: 'MEDIUM', condition: 'No standalone consent checkbox on lead form', signals: ['no consent checkbox', 'no opt-in visible', 'implicit consent by submission'] },
    { severity: 'LOW',    condition: 'Consent language overly broad but not double-negative', signals: ['by submitting', 'by using this site', 'deemed to have consented'] },
  ]},
  { id: 10, name: 'SaaS Billing', rules: [
    { severity: 'HIGH',   condition: 'Charge after free trial without clear pre-notice', signals: ['free trial ends', 'trial expiry charge', 'auto-charged after trial'] },
    { severity: 'MEDIUM', condition: 'Card stored during free period with no prominent notice', signals: ['card saved', 'payment method stored', 'billing starts after trial'] },
    { severity: 'LOW',    condition: 'Introductory offer end-date mentioned but not prominent', signals: ['offer valid till', 'introductory rate', 'special price until'] },
  ]},
  { id: 11, name: 'Rogue Malwares', rules: [
    { severity: 'HIGH',   condition: 'Pop-up mimics OS/browser security warning', signals: ['your device is at risk', 'security alert', 'system warning popup'] },
    { severity: 'HIGH',   condition: 'Chatbot uses alarming language to force purchase', signals: ['your vehicle is unprotected', 'at risk right now', 'immediate danger', 'urgent action required'] },
    { severity: 'MEDIUM', condition: 'Push notification framed as risk alert (marketing message)', signals: ['alert your policy', 'warning coverage gap', 'risk notification'] },
    { severity: 'LOW',    condition: 'Chatbot uses mild urgency without explicit false alarm', signals: ["don't wait", 'protect yourself today', 'get covered now'] },
  ]},
  { id: 12, name: 'Nagging', rules: [
    { severity: 'HIGH',   condition: 'Modal re-appears after explicit user dismissal', signals: ['re-appears after dismiss', 'cannot permanently dismiss', 'shown again after close'] },
    { severity: 'HIGH',   condition: 'Call centre script mandates re-offering declined product', signals: ['mandatory upsell script', 'must re-offer', 'script requires offer again'] },
    { severity: 'MEDIUM', condition: 'More than 15 modal/popup elements on a single page', signals: ['15+ modals', '20 modal elements', '30 modal elements', '40 modal elements', '60 modal elements'] },
    { severity: 'MEDIUM', condition: 'Exit-intent popup on checkout/transaction page', signals: ['wait before you go', "don't leave", 'exit intent upsell', 'leaving so soon'] },
    { severity: 'LOW',    condition: '6-15 modal elements on page', signals: ['6 modal', '7 modal', '8 modal', '10 modal', '12 modal elements'] },
  ]},
  { id: 13, name: 'Interface Interference', rules: [
    { severity: 'HIGH',   condition: 'Online cancellation absent — only phone/branch exists', signals: ['no online cancel', 'cancellation not available digitally', 'call to cancel only'] },
    { severity: 'HIGH',   condition: 'Grievance redressal link absent from product/checkout pages', signals: ['grievance not on product page', 'complaint link in footer only', 'no complaint button visible'] },
    { severity: 'MEDIUM', condition: 'Exclusions shown only behind extra click/tab', signals: ['excluded tab', 'click to see exclusions', "what's not covered hidden", 'exclusions behind tab'] },
    { severity: 'MEDIUM', condition: 'Policy T&C in very small font or low-contrast text', signals: ['fine print terms', 'small text disclaimer', 'low contrast terms', 'grey tiny text'] },
    { severity: 'LOW',    condition: 'Service buttons less prominent than purchase buttons', signals: ['ghost button track', 'outline button secondary', 'smaller track claim button'] },
  ]},
];

function buildSeverityPrompt() {
  return `
SEVERITY CLASSIFICATION — MANDATORY RULES
Use ONLY these definitions. Do not use independent judgment on severity.

HIGH — Direct regulatory violation. Misleads on price, coverage, or legal obligation.
MEDIUM — Significant UX manipulation. Coerces or pressures consumer.
LOW — Design concern or minor non-conformance.

INSURANCE-SPECIFIC HIGH SEVERITY (always HIGH regardless of context):
  1. Price shown excludes mandatory PA cover (Motor Vehicles Act) without immediate adjacent disclosure
  2. Price shown excludes GST (18%) without "+ GST" label immediately adjacent to the price
  3. Any checkbox pre-ticked for a paid add-on at checkout
  4. Opt-out button forces user to "agree" to self-incriminating statement
  5. Policy cancellation only via phone/branch — no online option
  6. Grievance redressal link absent from product/checkout pages

MEDIUM triggers:
  - Phone/OTP required before showing any quote
  - >15 modal/popup elements on a single page
  - Consent for marketing bundled with T&C acceptance
  - Exit-intent popup on transaction page
  - Exclusions hidden behind a secondary tab

LOW triggers:
  - Lead form prominent but product info still accessible below
  - 6-15 modals on page
  - Service buttons less prominent than purchase buttons
  - Statistical claims without time-period qualifier
`;
}

function resolveSeverity(patternId, evidence, modelSeverity) {
  const p = SEVERITY_RULES.find(r => r.id === patternId);
  if (!p) return modelSeverity || 'LOW';
  const ev = (evidence || '').toLowerCase();
  for (const level of ['HIGH', 'MEDIUM', 'LOW']) {
    for (const rule of p.rules.filter(r => r.severity === level)) {
      if (rule.signals.some(s => ev.includes(s.toLowerCase()))) return level;
    }
  }
  return modelSeverity || 'LOW';
}

const PATTERNS = SEVERITY_RULES.map(p => ({
  id: p.id,
  name: p.name,
  signals: [...new Set(p.rules.flatMap(r => r.signals))].slice(0, 6),
}));

module.exports = { SEVERITY_RULES, PATTERNS, buildSeverityPrompt, resolveSeverity };
