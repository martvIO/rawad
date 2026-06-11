"""
Post-run reporting for the Dawa load test.

Reads the CSVs that Locust + locustfile.py produced and generates the required
on-screen charts (saved as PNG and shown), then prints a plain-language verdict.

    python analyze.py                       # reads out/dawa_*  + out/*.csv, shows charts
    python analyze.py --prefix out/dawa --no-show

Inputs (all under --out-dir):
    <prefix>_stats_history.csv   per-interval time series (Locust --csv-full-history)
    <prefix>_stats.csv           final per-endpoint aggregate (Locust)
    status_breakdown.csv         status-class tally per endpoint (locustfile.py)
    page_ttfb.csv                page time-to-first-byte summary (locustfile.py)

Charts produced (saved to <out-dir>/*.png):
    1_latency_vs_users.png       p50/p90/p95/p99 latency vs concurrent users
    2_throughput_over_time.png   requests/s over time (+ user count)
    3_errors.png                 error rate over time  +  error-type breakdown
    4_endpoint_latency.png       per-endpoint median & p95 bar chart
"""

from __future__ import annotations

import argparse
import os
import sys

# Windows consoles default to cp1252 and crash on non-ASCII output. Force UTF-8.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, ValueError):
    pass

import numpy as np
import pandas as pd

# Defaults mirror locustfile.py so the verdict uses the same thresholds.
P95_MS = 1000.0
ERROR_RATE_MAX = 0.01

# Percentile columns we try to read from the history/stats CSVs, mapped to labels.
PCTL = [("50%", "p50"), ("90%", "p90"), ("95%", "p95"), ("99%", "p99")]


def _read_csv(path: str) -> pd.DataFrame | None:
    if not os.path.exists(path):
        print(f"  ! missing {path}")
        return None
    try:
        df = pd.read_csv(path)
        return df if not df.empty else None
    except Exception as e:  # noqa: BLE001
        print(f"  ! could not read {path}: {e}")
        return None


def _num(series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce")


def _pctl_cols(df: pd.DataFrame) -> list[tuple[str, str]]:
    """Return the percentile (column, label) pairs that actually exist in df."""
    return [(c, label) for c, label in PCTL if c in df.columns]


# ════════════════════════════════════════════════════════════════════════════
#  Per-stage table (drives chart 1 + the verdict)
# ════════════════════════════════════════════════════════════════════════════
def stage_table(history: pd.DataFrame) -> pd.DataFrame:
    """Collapse the Aggregated time series into one row per concurrency level."""
    agg = history[history["Name"] == "Aggregated"].copy()
    if agg.empty:
        # Some Locust versions label the total row "Total".
        agg = history[history["Name"].isin(["Total", "Aggregated"])].copy()
    agg["User Count"] = _num(agg["User Count"])
    agg["Requests/s"] = _num(agg["Requests/s"])
    agg["Failures/s"] = _num(agg.get("Failures/s", 0))
    for c, _ in _pctl_cols(agg):
        agg[c] = _num(agg[c])

    rows = []
    for users, grp in agg.groupby("User Count"):
        # Drop the first third of each level's samples (ramp transient) before summarising.
        grp = grp.sort_values("Timestamp")
        stable = grp.iloc[len(grp) // 3:] if len(grp) >= 3 else grp
        rps = stable["Requests/s"].mean()
        fps = stable["Failures/s"].mean()
        row = {
            "users": int(users),
            "rps": rps,
            "fail_per_s": fps,
            "error_rate": (fps / rps) if rps and rps > 0 else 0.0,
        }
        # Per stage, each percentile is the MEDIAN across the (ramp-trimmed) per-interval
        # values — i.e. the typical per-interval p95, NOT a true population p95 of the
        # stage's requests. Locust's history CSV only exposes per-interval percentiles,
        # so an exact per-stage p95 isn't recoverable here; this understates the tail if
        # a single interval within the stage spikes.
        for c, label in _pctl_cols(stable):
            row[label] = stable[c].median()
        rows.append(row)
    return pd.DataFrame(rows).sort_values("users").reset_index(drop=True)


# ════════════════════════════════════════════════════════════════════════════
#  Charts
# ════════════════════════════════════════════════════════════════════════════
def chart_latency_vs_users(stages: pd.DataFrame, out_dir: str, plt):
    fig, ax = plt.subplots(figsize=(9, 5.5))
    have = [label for _, label in PCTL if label in stages.columns]
    for label in have:
        ax.plot(stages["users"], stages[label], marker="o", label=label.upper())
    ax.axhline(P95_MS, ls="--", color="crimson", alpha=0.6, label=f"p95 SLO {int(P95_MS)}ms")
    ax.set_xlabel("Concurrent users")
    ax.set_ylabel("Response time (ms)")
    ax.set_title("Latency percentiles vs concurrent users")
    ax.grid(True, alpha=0.3)
    ax.legend()
    fig.tight_layout()
    p = os.path.join(out_dir, "1_latency_vs_users.png")
    fig.savefig(p, dpi=120)
    print(f"  saved {p}")


def chart_throughput(history: pd.DataFrame, out_dir: str, plt):
    agg = history[history["Name"].isin(["Aggregated", "Total"])].copy()
    t0 = _num(agg["Timestamp"]).min()
    agg["t"] = _num(agg["Timestamp"]) - t0
    fig, ax = plt.subplots(figsize=(9, 5.5))
    ax.plot(agg["t"], _num(agg["Requests/s"]), color="tab:blue", label="Requests/s")
    ax.set_xlabel("Elapsed time (s)")
    ax.set_ylabel("Requests/s", color="tab:blue")
    ax.tick_params(axis="y", labelcolor="tab:blue")
    ax.grid(True, alpha=0.3)
    ax2 = ax.twinx()
    ax2.plot(agg["t"], _num(agg["User Count"]), color="tab:gray", ls=":", label="Users")
    ax2.set_ylabel("Concurrent users", color="tab:gray")
    ax.set_title("Throughput over time (with concurrency)")
    fig.tight_layout()
    p = os.path.join(out_dir, "2_throughput_over_time.png")
    fig.savefig(p, dpi=120)
    print(f"  saved {p}")


def chart_errors(history: pd.DataFrame, breakdown: pd.DataFrame | None, out_dir: str, plt):
    agg = history[history["Name"].isin(["Aggregated", "Total"])].copy()
    t0 = _num(agg["Timestamp"]).min()
    agg["t"] = _num(agg["Timestamp"]) - t0
    rps = _num(agg["Requests/s"]).replace(0, float("nan"))
    err_pct = (_num(agg["Failures/s"]) / rps * 100).fillna(0)

    fig, (axL, axR) = plt.subplots(1, 2, figsize=(13, 5.5))
    axL.plot(agg["t"], err_pct, color="crimson", label="Genuine error rate (%)")
    axL.axhline(ERROR_RATE_MAX * 100, ls="--", color="gray", alpha=0.7,
                label=f"SLO {ERROR_RATE_MAX*100:.1f}%")
    axL.set_xlabel("Elapsed time (s)")
    axL.set_ylabel("Error rate (%)")
    axL.set_title("Error rate over time (excludes intentional 429s)")
    axL.grid(True, alpha=0.3)
    axL.legend()

    if breakdown is not None and not breakdown.empty:
        totals = {}
        for cls in ["2xx", "3xx", "4xx", "429", "5xx", "timeout", "error"]:
            if cls in breakdown.columns:
                totals[cls] = int(_num(breakdown[cls]).sum())
        # Show only the non-success classes for the "error types" view.
        labels = [c for c in ["4xx", "429", "5xx", "timeout", "error"] if totals.get(c, 0) > 0]
        values = [totals[c] for c in labels]
        colors = {"4xx": "tab:orange", "429": "gold", "5xx": "crimson",
                  "timeout": "tab:purple", "error": "black"}
        if values:
            axR.bar(labels, values, color=[colors.get(l, "gray") for l in labels])
            for i, v in enumerate(values):
                axR.text(i, v, str(v), ha="center", va="bottom", fontsize=9)
        else:
            axR.text(0.5, 0.5, "No errors recorded", ha="center", va="center")
        axR.set_ylabel("Total responses")
        axR.set_title("Error-type breakdown (429 = intentional rate-limit)")
        axR.grid(True, axis="y", alpha=0.3)
    fig.tight_layout()
    p = os.path.join(out_dir, "3_errors.png")
    fig.savefig(p, dpi=120)
    print(f"  saved {p}")


def chart_endpoint_latency(stats: pd.DataFrame, out_dir: str, plt):
    df = stats[~stats["Name"].isin(["Aggregated", "Total"])].copy()
    if df.empty:
        return
    med_col = "Median Response Time" if "Median Response Time" in df.columns else "50%"
    p95_col = "95%" if "95%" in df.columns else med_col
    df["med"] = _num(df[med_col])
    df["p95"] = _num(df[p95_col])
    df = df.sort_values("p95", ascending=False)
    names = df["Name"].astype(str).tolist()
    y = np.arange(len(names))
    fig, ax = plt.subplots(figsize=(10, max(4, 0.5 * len(names) + 2)))
    h = 0.38
    ax.barh(y - h / 2, df["med"], height=h, label="Median", color="tab:blue")
    ax.barh(y + h / 2, df["p95"], height=h, label="p95", color="tab:red")
    ax.set_yticks(y)
    ax.set_yticklabels(names)
    ax.invert_yaxis()
    ax.set_xlabel("Response time (ms)")
    ax.set_title("Per-endpoint response time (median vs p95)")
    ax.grid(True, axis="x", alpha=0.3)
    ax.legend()
    fig.tight_layout()
    p = os.path.join(out_dir, "4_endpoint_latency.png")
    fig.savefig(p, dpi=120)
    print(f"  saved {p}")


# ════════════════════════════════════════════════════════════════════════════
#  Verdict
# ════════════════════════════════════════════════════════════════════════════
def verdict(stages: pd.DataFrame, stats: pd.DataFrame, breakdown: pd.DataFrame | None,
            ttfb: pd.DataFrame | None):
    print("\n" + "=" * 72)
    print("  VERDICT - how well dawa.to held up")
    print("=" * 72)
    if stages.empty:
        print("  No aggregated history rows found - cannot judge. Did the run complete?")
        return

    has_p95 = "p95" in stages.columns
    healthy = stages[(stages.get("p95", 0) <= P95_MS) & (stages["error_rate"] <= ERROR_RATE_MAX)] \
        if has_p95 else stages[stages["error_rate"] <= ERROR_RATE_MAX]

    print(f"\n  SLO: p95 < {int(P95_MS)} ms AND genuine error rate < {ERROR_RATE_MAX*100:.1f}% "
          f"(intentional 429 rate-limits excluded).\n")
    # Per-stage one-liners.
    print(f"  {'users':>6} {'req/s':>8} {'p95 ms':>8} {'err %':>7}   status")
    degrade_at = None
    for _, r in stages.iterrows():
        p95 = r.get("p95", float("nan"))
        ok = (not has_p95 or p95 <= P95_MS) and r["error_rate"] <= ERROR_RATE_MAX
        if not ok and degrade_at is None:
            degrade_at = int(r["users"])
        print(f"  {int(r['users']):>6} {r['rps']:>8.1f} "
              f"{(p95 if p95 == p95 else 0):>8.0f} {r['error_rate']*100:>6.2f}%   "
              f"{'healthy' if ok else 'DEGRADED'}")

    if not healthy.empty:
        hmax = int(healthy["users"].max())
        print(f"\n  [OK] Stays healthy up to ~{hmax} concurrent users.")
    else:
        print("\n  [FAIL] Did not meet the SLO even at the lowest tested level.")
    if degrade_at is not None:
        print(f"  [!!]  First breaches the SLO at ~{degrade_at} concurrent users.")
    else:
        print("  [OK] No SLO breach across the whole ramp - try a higher max to find the ceiling.")

    # Weakest endpoints by p95.
    df = stats[~stats["Name"].isin(["Aggregated", "Total"])].copy()
    if not df.empty and "95%" in df.columns:
        df["p95"] = _num(df["95%"])
        worst = df.sort_values("p95", ascending=False).head(3)
        print("\n  Slowest endpoints (p95):")
        for _, r in worst.iterrows():
            print(f"    - {r['Name']:<28} {r['p95']:>7.0f} ms")

    # Endpoints with genuine server errors (5xx/timeout), separated from 429s.
    if breakdown is not None and not breakdown.empty:
        offenders = []
        for _, r in breakdown.iterrows():
            bad = int(r.get("5xx", 0)) + int(r.get("timeout", 0)) + int(r.get("error", 0))
            total = int(r.get("Total", 0)) or 1
            if bad > 0:
                offenders.append((r["Name"], bad, total, bad / total))
        if offenders:
            offenders.sort(key=lambda x: x[3], reverse=True)
            print("\n  Endpoints with GENUINE failures (5xx / timeout):")
            for name, bad, total, rate in offenders[:5]:
                print(f"    - {name:<28} {bad}/{total} ({rate*100:.1f}%)")
        else:
            print("\n  [OK] No 5xx / timeouts on any endpoint - failures (if any) were intentional 429s.")
        # Surface how much of the load the limiter rejected.
        tot_429 = int(_num(breakdown.get("429", pd.Series([0]))).sum())
        tot = int(_num(breakdown.get("Total", pd.Series([0]))).sum()) or 1
        if tot_429:
            print(f"\n  Rate limiter: {tot_429} responses ({tot_429/tot*100:.1f}% of all) were 429 "
                  f"(expected on the write endpoints from a single IP).")

    if ttfb is not None and not ttfb.empty:
        print("\n  Page time-to-first-byte (p95):")
        for _, r in ttfb.iterrows():
            print(f"    - {r['Name']:<28} {float(r['P95_ms']):>7.0f} ms  (n={int(r['Samples'])})")

    print("\n" + "=" * 72)


def main():
    ap = argparse.ArgumentParser(description="Chart + judge the Dawa load test results.")
    ap.add_argument("--prefix", default="out/dawa", help="Locust --csv prefix (default out/dawa)")
    ap.add_argument("--out-dir", default="out", help="where the breakdown CSVs live and PNGs go")
    ap.add_argument("--no-show", action="store_true", help="save PNGs but don't open windows")
    args = ap.parse_args()

    # Pick a non-interactive backend when we won't display, so it works headless.
    import matplotlib
    if args.no_show:
        matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    print("Loading results ...")
    history = _read_csv(f"{args.prefix}_stats_history.csv")
    stats = _read_csv(f"{args.prefix}_stats.csv")
    breakdown = _read_csv(os.path.join(args.out_dir, "status_breakdown.csv"))
    ttfb = _read_csv(os.path.join(args.out_dir, "page_ttfb.csv"))

    if history is None or stats is None:
        print("\nCannot produce charts without the Locust history + stats CSVs.")
        print("Run the test first:  python run.py")
        sys.exit(1)

    os.makedirs(args.out_dir, exist_ok=True)
    stages = stage_table(history)

    print("Building charts ...")
    chart_latency_vs_users(stages, args.out_dir, plt)
    chart_throughput(history, args.out_dir, plt)
    chart_errors(history, breakdown, args.out_dir, plt)
    chart_endpoint_latency(stats, args.out_dir, plt)

    verdict(stages, stats, breakdown, ttfb)

    if not args.no_show:
        print("\nShowing charts (close the windows to exit) ...")
        plt.show()


if __name__ == "__main__":
    main()
