#!/usr/bin/env python3
# Utilities
# -----------------------------


def parse_start(s: str) -> Grid:
vals = [int(x.strip()) for x in s.replace(";", ",").split(",") if x.strip()]
if len(vals) != 16:
raise ValueError("--start must contain exactly 16 integers (row-major)")
return [vals[i * 4 : (i + 1) * 4] for i in range(4)]




def print_grid(g: Grid) -> None:
width = max(4, max((len(str(x)) for row in g for x in row), default=1))
for r in range(4):
print(" ".join(f"{g[r][c]:>{width}d}" for c in range(4)))




# -----------------------------
# CLI
# -----------------------------


def main() -> None:
p = argparse.ArgumentParser(description="2048 Expectimax Solver (configurable start)")
p.add_argument("--start", type=str, help="16 comma/semicolon-separated ints (row-major)")
p.add_argument("--start-file", type=str, help="JSON file with [[...4],[...4],[...4],[...4]]")
p.add_argument("--corner", type=str, default="BL", choices=["TL","TR","BL","BR"], help="preferred corner for monotonic gradient")
p.add_argument("--seed", type=int, default=None, help="RNG seed for reproducibility")
p.add_argument("--max-steps", type=int, default=5000)
# Heuristic weights
p.add_argument("--w-empty", type=float, default=HeuristicWeights.w_empty)
p.add_argument("--w-mono", type=float, default=HeuristicWeights.w_monotonicity)
p.add_argument("--w-smooth", type=float, default=HeuristicWeights.w_smoothness)
p.add_argument("--w-corner", type=float, default=HeuristicWeights.w_max_on_corner)
# Search depth
p.add_argument("--depth-base", type=int, default=SearchConfig.depth_base)
p.add_argument("--depth-bonus-empty", type=int, default=SearchConfig.depth_bonus_empty)
p.add_argument("--depth-thresh", type=str, default="8,12", help="thresholds (a,b) to add depth when empties >= a and >= b")
p.add_argument("--prune-prob", type=float, default=SearchConfig.prune_prob, help="ignore nature branches whose single-cell prob is below this")


args = p.parse_args()


# Construct start board
start_board: Optional[Grid] = None
if args.start_file:
with open(args.start_file, "r", encoding="utf8") as f:
start_board = json.load(f)
elif args.start:
start_board = parse_start(args.start)


# Heuristic & search config
h = HeuristicWeights(
w_empty=args.w_empty,
w_monotonicity=args.w_mono,
w_smoothness=args.w_smooth,
w_max_on_corner=args.w_corner,
)
hcfg = HeuristicConfig(weights=h, corner=args.corner)


t = args.depth_thresh.split(",")
if len(t) != 2:
raise ValueError("--depth-thresh must be two ints separated by a comma, e.g., 8,12")
thresh = (int(t[0]), int(t[1]))


scfg = SearchConfig(
depth_base=args.depth_base,
depth_bonus_empty=args.depth_bonus_empty,
depth_empty_thresholds=thresh,
prune_prob=args.prune_prob,
)
ai = ExpectimaxAI(hcfg=hcfg, scfg=scfg)


final_board, score, moves = solve(
ai,
start_board=start_board,
seed=args.seed,
max_steps=args.max_steps,
)


print("Final board:")
print_grid(final_board)
print(f"Final score: {score}")
print(f"Moves made: {len(moves)}")




if __name__ == "__main__":
main()