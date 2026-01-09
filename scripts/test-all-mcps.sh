#!/bin/bash
# Test tous les MCPs Docker
# Usage: ./scripts/test-all-mcps.sh

set -e

cd "$(dirname "$0")/.."

echo "=== MCP Suite - Tests ==="
echo ""

MCPS=("contabo" "lemlist" "gemini" "vps-ssh" "instagram" "canva")
TOTAL=0
PASSED=0

for mcp in "${MCPS[@]}"; do
    echo -n "Testing mcp-$mcp... "

    RESULT=$(echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | docker run --rm -i --env-file .env mcp-$mcp:latest 2>&1)

    if echo "$RESULT" | grep -q '"tools"'; then
        TOOLS=$(echo "$RESULT" | grep -o '"name"' | wc -l)
        echo "OK ($TOOLS tools)"
        ((PASSED++))
    else
        echo "FAILED"
        echo "  Error: $RESULT"
    fi

    ((TOTAL++))
done

# Test special pour vertex-rag (necessite initialize)
echo -n "Testing mcp-vertex-rag... "
RESULT=$(printf '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":0}\n{"jsonrpc":"2.0","method":"tools/list","id":1}\n' | docker run --rm -i --env-file .env mcp-vertex-rag:latest 2>&1)

if echo "$RESULT" | grep -q '"tools"'; then
    TOOLS=$(echo "$RESULT" | grep -o '"name"' | wc -l)
    echo "OK ($TOOLS tools)"
    ((PASSED++))
else
    echo "FAILED"
fi
((TOTAL++))

echo ""
echo "=== Results: $PASSED/$TOTAL passed ==="

if [ $PASSED -eq $TOTAL ]; then
    echo "All tests passed!"
    exit 0
else
    echo "Some tests failed!"
    exit 1
fi
