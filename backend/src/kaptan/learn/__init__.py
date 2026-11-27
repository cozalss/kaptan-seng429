"""The self-updating, honest learning loop (agent LEARN): KAPtan learns from matured events, never from the seal.

| piece | module | when |
|---|---|---|
| the pool (2022–2024 archive + live from 2026-11-01, net of cost) | `kaptan.learn.dataset` | read by the passes |
| robust edge estimator, walk-forward folds | `kaptan.learn.estimators` | chosen once; folds weekly |
| predicted vs realised edge per type, bounded factor | `kaptan.learn.calibration` | nightly (`learn_nightly`) |
| one-step threshold tests with every guard | `kaptan.learn.tuning` | weekly (`learn_weekly`, Friday) |
| versioned thresholds, "Geri al" | `kaptan.learn.rules_store` | on a change / undo |
| "Ne öğrendim" report, the Friday Telegram line | `kaptan.learn.weekly` | weekly, GET /me/learning |

    uv run python -m kaptan.learn report      # one pass, report only (no rule changes)
    uv run python -m kaptan.learn apply       # one pass; adopts steps that pass every guard (if the switch is on)
"""
