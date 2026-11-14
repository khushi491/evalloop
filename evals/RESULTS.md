# EvalLoop results

Resumed from `/workspace/evalloop-eval/evals/results/2026-11-13T09-33-47-479Z.json`. Call costs recorded on earlier attempts are kept.

Generated: 2026-11-14T09:15:50.116Z

## Config

| Setting | Value |
| --- | --- |
| Model | gemini-3.5-flash |
| Temperature | runner 0.4, evaluator 0.1, patcher 0.2 |
| Max attempts | 3 |
| Target total | 90 |
| Runs per task | 1 |
| Max cost | $3.00 |
| Max calls | 20 |
| Delay between calls | 1000 ms |
| Tasks | bug-report, incident-postmortem, invoice-json, meeting-notes, onboarding-email, product-faq, release-json, security-advisory, status-update, support-double-charge |

Price table: free tier / unknown. No token price is configured for gemini-3.5-flash, so estimated cost is $0. Estimated cost is $0. Token spend is estimated only for a model with a configured price.

Total for an attempt is `round((hardCheckPassRate * 100 + judgeScore) / 2)`. The judge score is the rubric total from the five 0–5 categories and is reported on its own. The hard-check rate is the share of deterministic checks that passed and is also reported on its own. The total blends those two, so a perfect judge score cannot hide a failed check. The loop stops when the total reaches the target and every hard check passes. Hard-check failures are sent to the patcher with the judge feedback.

When a task is repeated, each cell is the mean across runs that have a judge score. The average row is the unweighted mean across those tasks, and its total is recomputed from that mean hard-check rate and mean judge score.

## Training

Each training task starts from the initial policy. Before is the first scored attempt. After is the last scored attempt.

| Task | Runs | Attempts | Before hard-check | Before judge | Before total | After hard-check | After judge | After total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Search bug report (`bug-report`) | 1 | 3 | 80.0% | 100.0 | 90.0 | 100.0% | 100.0 | 100.0 |
| Checkout outage postmortem (`incident-postmortem`) | 1 | 1 | 100.0% | 100.0 | 100.0 | 100.0% | 100.0 | 100.0 |
| Weekly planning notes (`meeting-notes`) | 1 | 1 | 100.0% | 100.0 | 100.0 | 100.0% | 100.0 | 100.0 |
| Workspace welcome email (`onboarding-email`) | 1 | 3 | 75.0% | 72.0 | 74.0 | 100.0% | 100.0 | 100.0 |
| Shipping and returns FAQ (`product-faq`) | 1 | 2 | 50.0% | 68.0 | 59.0 | 100.0% | 100.0 | 100.0 |
| Release notes JSON (`release-json`) | 1 | 1 | 100.0% | 96.0 | 98.0 | 100.0% | 96.0 | 98.0 |
| Duplicate charge reply (`support-double-charge`) | 1 | 1 | 100.0% | 96.0 | 98.0 | 100.0% | 96.0 | 98.0 |
| **Average** | | | 86.4% | 90.3 | 88.0 | 100.0% | 98.9 | 99.0 |

## Learned policy

Compared with the initial policy: 10 rules added, 0 rules removed, 8 checklist items added, 0 checklist items removed. Word cap 120 → 120. Tone unchanged.

The learned policy keeps an initial rule unless every training run removed it, and it appends rules any training run added. The word cap is the minimum cap seen in training.

## Held-out

These tasks are scored once under the initial policy and once under the learned policy. The patcher does not see held-out tasks.

| Task | Runs | Initial hard-check | Initial judge | Initial total | Learned hard-check | Learned judge | Learned total |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Consulting invoice JSON (`invoice-json`) | 1 | 100.0% | 96.0 | 98.0 | 100.0% | 100.0 | 100.0 |
| Library security advisory (`security-advisory`) | 1 | 75.0% | 100.0 | 88.0 | 100.0% | 100.0 | 100.0 |
| API latency status update (`status-update`) | 1 | 100.0% | 84.0 | 92.0 | 100.0% | 100.0 | 100.0 |
| **Average** | | 91.7% | 93.3 | 93.0 | 100.0% | 100.0 | 100.0 |

## Cost

| | |
| --- | --- |
| Estimated cost | $0.00 |
| Prompt tokens | 26237 |
| Cached prompt tokens | 0 |
| Completion tokens | 5228 |
| Model calls | 41 |
| Calls missing usage | 0 |
