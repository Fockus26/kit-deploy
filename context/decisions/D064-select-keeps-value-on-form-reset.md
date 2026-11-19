# D064 · Panel · A select keeps what it shows across the form's reset and submits it from its own hidden input · Implemented

**Decision:** `components/kit/option-select.tsx` is the one place for the rule. While the trigger's
form dispatches `reset` (a capture listener on the document marks it, cleared in a microtask), the
`onValueChange` Radix fires is ignored, so the parent's state and the trigger keep the chosen value.
The value travels in an `<input type="hidden" name value>` of its own; `name` is no longer passed
to Radix, whose native select the browser's reset rewinds to its mount-time option. A form that
wants to clear after a success does it through its own state or `key`, as every panel form is
controlled already.
**Why:** React 19 runs `form.reset()` when a `<form action={…}>` settles, also after a refusal.
Radix Select 2.4.1 (`@radix-ui/react-select/dist/index.mjs:96-103`) listens to that reset and sets
its initial value, which in controlled mode calls `onValueChange(first)`: Nuevo proyecto saved
512 MB when 1024 was chosen and Ajustes › Nuevo token minted for the first project (functional QA,
batch 2026-11-18, Alto). Controlled `<input>`s and the repo combobox's hidden input did not lose
their values. Guard: `scripts/qa/select-after-rejected-submit.mjs`. Side effect: the hidden input is
in the server HTML, so D053's "no value before hydration" edge is gone.
**Discarded alternative:** handling it in each form (re-applying values after the action, or a
`key` that remounts the select): two places today and every new form must remember it. Passing
Radix a `form` id that does not exist (so it never subscribes to the reset): works, but relies on a
bogus attribute and an internal detail of Radix.
