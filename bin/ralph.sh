#!/bin/bash
# Ralph Coding Agent - Long-running AI agent loop
# Usage: ./ralph.sh <design_doc> [max_iterations]
#   design_doc: Path to design document relative to design/ directory (e.g., core/open-responses.md)
#   max_iterations: Maximum number of iterations (default: 10)
#
# This script runs the coding agent skill in a loop, following instructions
# from .codex/skills/coding-agent/SKILL.md

set -e

# Parse arguments
MAX_ITERATIONS=10
DESIGN_DOC=""

# First argument is always the design document
if [[ $# -gt 0 ]]; then
  DESIGN_DOC="$1"
  shift
fi

# Second argument (if present) is max_iterations
if [[ $# -gt 0 ]] && [[ "$1" =~ ^[0-9]+$ ]]; then
  MAX_ITERATIONS="$1"
fi

# Validate design document is provided
if [[ -z "$DESIGN_DOC" ]]; then
  echo "Error: Design document path is required"
  echo "Usage: ./ralph.sh <design_doc> [max_iterations]"
  echo "Example: ./ralph.sh core/open-responses.md"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SKILL_FILE="$REPO_ROOT/.codex/skills/coding-agent/SKILL.md"
PROGRESS_FILE="/tmp/progress.txt"
ARCHIVE_DIR="$SCRIPT_DIR/archive"
LAST_BRANCH_FILE="$SCRIPT_DIR/.last-branch"

# Resolve design document path
# If absolute path, use as-is. Otherwise, prepend design/ directory
if [[ "$DESIGN_DOC" == /* ]]; then
  # Absolute path - use as-is
  :
elif [[ "$DESIGN_DOC" == design/* ]]; then
  # Already has design/ prefix - prepend repo root
  DESIGN_DOC="$REPO_ROOT/$DESIGN_DOC"
else
  # Relative path - prepend design/ directory
  DESIGN_DOC="$REPO_ROOT/design/$DESIGN_DOC"
fi

# Verify skill file exists
if [ ! -f "$SKILL_FILE" ]; then
  echo "Error: Skill file not found at $SKILL_FILE"
  exit 1
fi

# Verify design document exists
if [ ! -f "$DESIGN_DOC" ]; then
  echo "Error: Design document not found at $DESIGN_DOC"
  exit 1
fi

# Initialize progress file if it doesn't exist
if [ ! -f "$PROGRESS_FILE" ]; then
  echo "# Ralph Progress Log" > "$PROGRESS_FILE"
  echo "Started: $(date)" >> "$PROGRESS_FILE"
  echo "---" >> "$PROGRESS_FILE"
fi

echo "Starting Ralph - Coding Agent"
echo "Skill file: $SKILL_FILE"
echo "Design document: $DESIGN_DOC"
echo "Progress file: $PROGRESS_FILE"
echo "Max iterations: $MAX_ITERATIONS"

for i in $(seq 1 $MAX_ITERATIONS); do
  echo ""
  echo "==============================================================="
  echo "  Ralph Iteration $i of $MAX_ITERATIONS"
  echo "==============================================================="

  # Run codex with the coding agent skill
  # Use --dangerously-bypass-approvals-and-sandbox for autonomous operation
  # Prepend design document instruction to skill file content
  # Note: codex exec outputs to stderr, so we capture both stdout and stderr
  OUTPUT=$({
    {
      echo "## Design Document"
      echo ""
      echo "The design document to use is: \`$DESIGN_DOC\`"
      echo ""
      echo "---"
      echo ""
      cat "$SKILL_FILE"
    } | codex exec --dangerously-bypass-approvals-and-sandbox - 2>&1
  } | tee /dev/stderr) || true
  
  # Filter output as Codex echoes the full prompt, which includes "<promise>COMPLETE</promise>" and undesirably triggers the stop condition 
  # When Codex prints role markers, keep only assistant output to avoid matching the trigger phrase in prompt
  if echo "$OUTPUT" | grep -q "^assistant"; then
    OUTPUT=$(echo "$OUTPUT" | awk 'BEGIN{found=0} /^assistant/{found=1;next} {if(found) print}')
  # Fallback: when role markers are absent, start from the post-run summary to trim the echoed prompt
  elif echo "$OUTPUT" | grep -q "^tokens used"; then
    OUTPUT=$(echo "$OUTPUT" | awk 'BEGIN{found=0} /^tokens used/{found=1} {if(found) print}')
  fi
  
  # Check for completion signal (from SKILL.md: reply with <promise>COMPLETE</promise> when all stories are complete)
  if echo "$OUTPUT" | grep -q "<promise>COMPLETE</promise>"; then
    echo ""
    echo "Ralph completed all tasks!"
    echo "Completed at iteration $i of $MAX_ITERATIONS"
    exit 0
  fi
  
  echo "Iteration $i complete. Continuing..."
  sleep 2
done

echo ""
echo "Ralph reached max iterations ($MAX_ITERATIONS) without completing all tasks."
echo "Check $PROGRESS_FILE for status."
exit 1