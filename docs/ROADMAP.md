# Roadmap

## Elite features roadmap

Planned, not built. Do not start an item out of order or without being asked.

**Rules for every item:** all bots read and propose; humans approve money and messages. Nothing sends a text, moves money or changes a price on its own. Deterministic math lives in pure functions in `src/lib/<feature>.ts` with tests. Existing rules still apply (writes through definer functions, cleaners never see office data, consent and STOP, dry-run default).

**Order:** Vault rollout, marketing analytics, boardroom wiring, agent teams, then 4 and 1, then 5 after GHL is live, 3 after a few months of data, 2 last.

1. **Cash flow forecast.** 30/60/90-day projection from scheduled recurring visits, invoices due, payouts owed, ad spend and fixed costs. Deterministic math. Command Center alert when projected cash falls below the buffer.
2. **Self-healing dispatch.** When a cleaner cancels, rank backup cleaners by borough, availability and pay; draft the cleaner and client texts; one-tap approval. Auto-send only for explicitly approved low-risk cases, later. No live GPS tracking of contractors. Requires cleaner availability data first.
3. **Churn early warning.** Transparent rule-based health score (skips, reschedules, reply slowdown, complaints, late payments). Drafts for approval. Log the needed data now; ML only after 100+ clients.
4. **What-if modeler.** Sliders for cleaner pay, prices, churn, cost to win a client and ad spend; instant P&L effect; feeds the Roast Room context.
5. **Unified inbox.** Texts, email, social messages and calls per customer, tied to lead, invoices and crew. Built on `lead_messages` and GHL, after GHL is live. Consent and STOP rules apply.
6. **Quality and ratings.** Post-clean rating, photo checks, complaints, subcontractor scorecards.
7. **Pricing calculator** with margin built in.
8. **Subcontractor retention view.**
