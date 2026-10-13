function needsManualReview(pageData) {
  const { domSignals, url } = pageData;
  const reasons = [];

  if (domSignals?.hasMultiStepFlow) {
    reasons.push({ code: 'MULTI_STEP_FLOW', detail: 'Page shows step indicators — scanner only captures the initial landing state.' });
  }
  if (domSignals?.hasLoginGate) {
    reasons.push({ code: 'LOGIN_GATED', detail: 'Page requires authentication — content behind login is out of scope.' });
  }
  if (domSignals?.pageHeightPx > 7800) {
    reasons.push({ code: 'PAGE_TOO_TALL', detail: `Page height (${domSignals.pageHeightPx}px) exceeds the 7800px screenshot cap.` });
  }
  if (/quote-details|\/checkout|\/payment-confirm/i.test(url)) {
    reasons.push({ code: 'TRANSACTION_FLOW_URL', detail: 'URL matches a transaction/checkout flow pattern.' });
  }

  return { required: reasons.length > 0, reasons };
}

module.exports = { needsManualReview };
