# Bugs

## Format
- Title:
- Impact: low | medium | high
- Repro:
- Notes:
- Status: open | in-progress | blocked | done

## Entries
- Title: Back nav from person page returns to scenario list instead of scenario
  Impact: medium
  Repro: Scenario -> Person -> Work Period -> Back (to person) -> Back
  Notes: Expected back target is scenario, but it navigates to scenario list.
  Status: open
- Title: Duplicate taxable source basis handling logic needs shared util
  Impact: low
  Repro: N/A
  Notes: Find duplicated basis-handling code in taxable source handling and refactor to a common util.
  Status: open
- Title: CPI inflation computed without standard helper
  Impact: low
  Repro: N/A
  Notes: Find places computing CPI inflation that should use a shared standard function.
  Status: closed
- Title: Non-SSA utility functions living in ssa.ts
  Impact: low
  Repro: N/A
  Notes: Identify utility functions in `ssa.ts` that are not SSA-specific and relocate/refactor.
  Status: open
- Title: policyYear setting seems unnecessary and possibly not inflating taxes correctly
  Impact: low
  Repro: N/A
  Notes: policyYear may be being used to inflate tax brackets instead of sim context date?
  Status: closed
