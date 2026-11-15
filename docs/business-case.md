# Business case — pilot proposal

Minutes 45–55 of the meeting. Everything here is a proposed commercial option for a fictional prospect, not an AITOMATIC offering. Dollar figures are illustrative and say so.

## 1. Positioning

We are not asking you to trust an AI to make release decisions. We are proposing a measured, read-only pilot that helps engineers investigate failures faster while they stay in control. The rules decide; the model explains; a human accepts or overrides every item.

## 2. Pilot plan: 4 weeks, one CI source, one service, read-only

| Week | Work | Output the customer keeps |
|---|---|---|
| 1 | Read-only CI token; ingest the last 30 days of runs into `raw_events`; run the ETL; **measure** the triage baseline (minutes from failed run to first human classification, counted from ticket or chat timestamps, not recalled) | Data-quality report on the real feed (duplicates, missing timestamps, summary/attempt drift); baseline numbers; targets fixed for W4 |
| 2–3 | Shadow mode: the agent triages every failed run as it lands; engineers see the verdict, evidence and hypothesis and click accept or override; QA lead edits the rule file (taxonomy, quarantine, precedence) once a week | Accept/override log; rule file v2 with the customer's classes |
| 4 | Measurement against the W1 baseline; rule tuning; go/no-go meeting | Pilot report; decision |

Scope boundaries: one tenant; no SSO; no write access to CI, tickets or releases; model endpoint chosen with the customer's security team in W1 (cloud, gateway, or on-premises OpenAI-compatible).

## 3. Success and exit criteria

Targets are set in W1 from the measured baseline. Starting proposals:

| Criterion | Starting target | How it is measured |
|---|---|---|
| Classification accepted without edit | >= 70% of failed runs | accept/override log |
| Median time-to-first-classification | down >= 30% vs W1 | timestamps, same method as baseline |
| Unsafe recommendations | 0 SHIP on a run a human later held | release log vs gate verdicts |
| Provenance | 0 evidence ids that fail to resolve | validator check `evidence_ids_resolve`, logged per request |
| Data-quality value | >= 1 integration defect found by the report | W1 report, confirmed by the platform team |

Exit: if the acceptance rate is under 50% at the end of W3 with the rule file already tuned once, stop; the customer keeps the baseline, the data-quality report and the rule file. If criteria are met, proceed to a second service and a production integration plan.

## 4. Cost drivers (what the pilot price is made of)

| Driver | What drives it | Bounded by |
|---|---|---|
| Integration engineering | the CI API's quirks: pagination, redelivery, attempt granularity, artifact access; this dominates | one source, one service; the ETL and schema exist |
| Inference | per question: <= 8 tool calls, `max_tokens` 2000 per agent turn and 2500 for the answer, temperature 0, one revision at most; per day: `LIVE_DAILY_CAP` | tokens per request are accumulated in the graph; price = tokens × the chosen model's list price; the customer picks the model |
| Hosting and database | one Python service, one Postgres (Neon or customer's); PoC data is 2,053 rows | small until ingestion is continuous |
| Security review | read-only role, no model-written SQL, logs as untrusted data, endpoint choice | start in W1, not W4; the architecture doc is written for the reviewer |
| Rule maintenance | the QA lead's time editing YAML weekly in the pilot | the file is the customer's; no vendor needed to change a rule |

I do not quote a dollar price in this document. In the meeting, the honest answer is: integration engineering is the largest and least certain line; the others are small and bounded. A fixed-fee W1 (baseline plus data-quality report) with a go/no-go before W2 is the lowest-risk shape.

## 5. ROI: a formula, not a number

```
monthly_engineer_hours_saved = investigations_per_month × minutes_saved_per_investigation / 60
monthly_value_usd            = monthly_engineer_hours_saved × loaded_rate_usd_per_hour   (rate typed in by the customer)
```

`investigations_per_month` is measured (the dataset's own tool counts 25 in 30 days: retry-pass series plus final-failure series). `minutes_saved` is baseline minus assisted, measured in W1 and W4. `loaded_rate` is the customer's.

Illustrative sensitivity, hours per month, computed from the formula:

| investigations / month → | 25 (this dataset) | 100 | 250 |
|---|---|---|---|
| **5 min saved each** | 2.1 h | 8.3 h | 20.8 h |
| **10 min saved each** | 4.2 h | 16.7 h | 41.7 h |
| **20 min saved each** | 8.3 h | 33.3 h | 83.3 h |

At the rule file's base assumption of $60 per hour the middle cell is 16.7 h, about $1,000 a month; at the dataset's own scale (25 investigations, base 20 min each) total triage is only 8.3 h a month, so hours saved cannot exceed that. The honest reading: for a team this size the pilot pays in release-decision quality and in data-quality findings, not in headcount. The formula is in the product (`estimate_triage_cost`, low/base/high) so the customer can change every input.

What the ROI line does not capture and the pilot should log anyway: releases held that would otherwise have shipped on a wrong PASS; infra incidents found through `infra_only` retries; time not spent arguing about which dashboard is right.

## 6. Risks and mitigations

| Risk | Mitigation in the build | Mitigation in the pilot |
|---|---|---|
| Model gives a wrong explanation | validator rejects unknown ids, ungrounded numbers, stray verdicts; verdict not model-writable | every item accepted or overridden by an engineer; override reasons feed rule tuning |
| Model or provider outage | fallback model, then offline mode, always labelled | tools and gate answer without a model |
| CI feed is incomplete or late | incomplete → HOLD, missing summary → HOLD, never PASS by default | W1 data-quality report names the gaps before shadow mode |
| Rules do not fit the customer | YAML, versioned, customer-owned; unknown error classes are `UNCLASSIFIED`, visible | weekly rule review with the QA lead |
| Security objection to cloud model | OpenAI-compatible endpoint; logs untrusted; read-only DB role | endpoint and data path agreed in W1 with security |
| Integration takes longer than planned | ETL and schema exist; one source, one service | fixed-fee W1 with go/no-go |
| Adoption: engineers ignore it | answers cite ids engineers can open; "cannot verify" instead of guesses | shadow mode inside the existing failed-run flow, one-click accept |

## 7. Objection handling (top 10)

1. **It will hallucinate a root cause.** It can be wrong in the explanation; it cannot be wrong in the verdict, because the verdict is a tested function. The validator strips unknown ids and ungrounded numbers. Engineers accept or override.
2. **Where do your ROI numbers come from?** From your week-1 baseline. Today I have a formula and a sensitivity table. I will not give you a dollar figure I did not measure.
3. **We cannot send CI logs to a cloud model.** The endpoint is configurable; your security team chooses it in week 1. Logs are treated as untrusted data. The database role is read-only.
4. **Our CI already retries and marks flaky tests.** It retries. It does not separate grid failures from product failures, and it does not expire a quarantine. T-CHK-011 in the demo would be your top flaky test on most dashboards; it is a grid problem.
5. **Why not a dashboard query?** The rules could be SQL. The value is a cited answer to an arbitrary question, and a rule file that records your leads' judgment and survives staff changes.
6. **What happens when the model is down?** Tools and the gate still answer; the page shows the offline label. Shown in the demo.
7. **Vendor lock-in?** The rule file, the schema and the evidence format are YAML and SQL you keep. The model is any OpenAI-compatible endpoint. The agent layer is small and replaceable.
8. **Multi-tenant, SSO, scale?** Not in the pilot. The schema extends with a tenant key; promising it by week 4 would be overpromising.
9. **What does the pilot cost?** The largest line is integration engineering against your CI API; the rest is bounded and small. Fixed-fee week 1 with a go/no-go is the lowest-risk shape.
10. **What if it fails?** You stop after week 3. You keep a measured triage baseline, a data-quality report on your CI feeds, and the rule file. Week 1 is useful even if nothing else happens.

## 8. The close and next step

"Week one pays for itself even if you stop: a measured baseline and a data-quality report on your CI feeds. The rule file your leads write stays yours. The risk boundary is fixed: read-only, one service, a human on every item, a go/no-go after week one."

Next step to propose: a 45-minute scoping call with the QA Platform lead to pick the service and the CI source, confirm read-only token scope, and agree the baseline method; then a written week-1 statement of work with the five success criteria above and their measurement method.
