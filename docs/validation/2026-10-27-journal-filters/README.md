# Inclusive journal category filters

All selects every category chip. Individual categories can be turned off and
restored without replacing the other selections. Voice controls all voice types
and reports a mixed state when some are excluded. Stays are independent.
All-off is a valid empty selection; trash remains a separate view.

Mobile uses chip buttons in the filter sheet. Apply commits the draft; closing
without applying preserves the previous selection. Returning from details also
preserves selection, scroll and focus. The filter badge counts excluded leaf types.

Validation: web build and 71 unit tests passed. Desktop/mobile category selection,
exclusion, restoration, all-off and cancellation checks passed. Existing mobile,
main-sample and unified journal regressions passed across the broad run and a
focused completion run (39 distinct E2E cases). Screenshots use synthetic samples.
