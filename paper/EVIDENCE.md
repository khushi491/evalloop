# Evidence map

- Notes for Khushi. Intended claims, not findings.
- No live run is in the repo.
- A figure counts only after `pnpm analyze` on a live sweep, and only if it is not labeled mock.
- Do not fill the table with simulated scores.

| Intended claim | What would support it | Experiment cell | Figure / table |
| --- | --- | --- | --- |
| The policy loop raises hard-check pass rate from the first scored attempt to the last | Task-level before/after hard-check rate, bootstrap interval above 0 | `policy`, stopping `judge-and-hard`, feedback `both` | `hard-check-by-method`; training table in `tables.md` |
| A judge-only stop increases the judge-minus-hard-check gap across iterations | Gap series for judge-only above the judge-and-hard series | `policy` × stopping `judge-only` vs `judge-and-hard`, feedback `both` | `gap-by-iteration` |
| Critique-only patches please the judge more than patches that also see hard checks | Larger gap, or higher judge with a flat hard-check rate, for `critique-only` than for `both` | `policy` × feedback `critique-only` / `hard-checks-only` / `both`, same stopping rule | `gap-by-iteration`; `judge-by-method` next to `hard-check-by-method` |
| Hard-check feedback is what closes the gap, not the extra revision steps alone | Self-refine with the same feedback and the same call budget does not match the policy gap pattern, or it does | `self-refine` vs `policy`, matched stopping and feedback | `gap-by-iteration`; `hard-check-by-method` |
| Best-of-n at the same call budget, selected by the judge, can raise the judge score without the hard checks | Selected sample judge score vs hard-check rate, against single-shot | `best-of-n` vs `single-shot` | `judge-by-method`; `hard-check-by-method` |
| A policy learned on the train split transfers to held-out tasks with no further patching | Learned minus initial hard-check points, and the same for the judge, on held-out only | `policy` held-out pass, `transfer: frozen-policy` | `heldout-transfer` |
| The gain is cheap or not, under the free-tier price table | Tokens (and USD, which is 0 for an unpriced model) per hard-check point gained. Runs with no gain are counted separately | same cells as the method bars | `cost-per-point` |

- Call upper bounds and cell definitions: `docs/EXPERIMENTS.md`.
