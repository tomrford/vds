#!/bin/bash
set -e

MAX_ITERATIONS=${1:-50}
STATUS_FILE="status.md"

for ((i = 1; i <= MAX_ITERATIONS; i++)); do
    echo "=== Iteration $i/$MAX_ITERATIONS ==="

    cat prompt.md | claude --dangerously-skip-permissions --print

    if [[ -f "summary.md" ]]; then
        echo "--- Summary: $(cat summary.md)"
    fi

    STATUS=$(head -1 "$STATUS_FILE" | grep -oE '(Done|Blocked|In Progress)')

    if [[ "$STATUS" == "Done" ]]; then
        echo "✅ Complete after $i iterations"
        exit 0
    elif [[ "$STATUS" == "Blocked" ]]; then
        echo "🚫 Blocked after $i iterations - manual intervention needed"
        exit 1
    fi

    echo "Status: $STATUS - continuing..."
done

echo "⚠️ Max iterations ($MAX_ITERATIONS) reached"
exit 1
