/**
 * Whether per-attribute numbers (e.g. 4.5) are shown in the draft and on
 * fighter cards. Off: players choose from fighter names alone and the
 * ratings stay hidden, per the product direction. On: useful when tuning
 * or debugging the draft. Note this is presentation only — while the
 * simulation runs client-side the values still ship in the JS bundle.
 */
export const SHOW_ATTRIBUTE_RATINGS = false;

/**
 * Whether exact per-attribute numbers (e.g. "Jones wrestling 94") appear
 * after a build is complete: on the fighter sheet and the head-to-head
 * screen. Off: only the bars and the overall number are shown, plus "Best
 * pick" and "Weak link" callouts on your fighter. Exact numbers turn the
 * draft into recalling a lookup table once players have seen them a few
 * times; bars and callouts keep the feedback without that. Independent of
 * SHOW_ATTRIBUTE_RATINGS above, which governs the draft itself.
 */
export const SHOW_ATTRIBUTE_NUMBERS = false;
