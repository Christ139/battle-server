#!/bin/bash
# Step 3 Verification Script

echo "=================================================="
echo "   STEP 3 VERIFICATION: Rust WASM Battle Core"
echo "=================================================="
echo ""

PASS=0
FAIL=0

# Check 1: Directory exists
echo "1. Checking battle-core directory..."
if [ -d "battle-core" ]; then
    echo "   ✅ PASS: battle-core/ directory exists"
    PASS=$((PASS + 1))
else
    echo "   ❌ FAIL: battle-core/ directory not found"
    echo "   Fix: mkdir -p battle-core/src"
    FAIL=$((FAIL + 1))
fi
echo ""

# Check 2: Cargo.toml
echo "2. Checking Cargo.toml..."
if [ -f "battle-core/Cargo.toml" ]; then
    echo "   ✅ PASS: Cargo.toml exists"
    PASS=$((PASS + 1))
else
    echo "   ❌ FAIL: Cargo.toml missing"
    echo "   Fix: Copy Cargo.toml to battle-core/"
    FAIL=$((FAIL + 1))
fi
echo ""

# Check 3: Rust source files
echo "3. Checking Rust source files..."
REQUIRED_FILES=("spatial_grid.rs" "battle_unit.rs" "targeting.rs" "weapons.rs" "movement.rs" "simulator.rs" "lib.rs")
MISSING=0

for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "battle-core/src/$file" ]; then
        echo "   ✅ $file"
    else
        echo "   ❌ MISSING: $file"
        MISSING=$((MISSING + 1))
    fi
done

if [ $MISSING -eq 0 ]; then
    echo "   ✅ PASS: All 7 Rust files present"
    PASS=$((PASS + 1))
else
    echo "   ❌ FAIL: Missing $MISSING files"
    FAIL=$((FAIL + 1))
fi
echo ""

# Check 4: Cargo build
echo "4. Checking Cargo build..."
if [ -f "battle-core/Cargo.toml" ]; then
    cd battle-core
    if cargo check --quiet 2>/dev/null; then
        echo "   ✅ PASS: Code compiles without errors"
        PASS=$((PASS + 1))
    else
        echo "   ⚠️  Code has compilation errors"
        echo "   Run: cd battle-core && cargo build"
        FAIL=$((FAIL + 1))
    fi
    cd ..
else
    echo "   ⏭️  SKIP: Cargo.toml not found"
fi
echo ""

# Check 5: WASM package
echo "5. Checking WASM package..."
if [ -f "battle-core/pkg/battle_core.wasm" ]; then
    SIZE=$(ls -lh battle-core/pkg/battle_core_bg.wasm | awk '{print $5}')
    echo "   ✅ PASS: WASM binary exists ($SIZE)"
    PASS=$((PASS + 1))
    
    if [ -f "battle-core/pkg/battle_core.js" ]; then
        echo "   ✅ PASS: Node.js bindings exist"
        PASS=$((PASS + 1))
    else
        echo "   ❌ FAIL: Node.js bindings missing"
        FAIL=$((FAIL + 1))
    fi
else
    echo "   ⏭️  SKIP: Not built yet"
    echo "   Run: cd battle-core && wasm-pack build --target nodejs --release"
fi
echo ""

# Summary
echo "=================================================="
echo "   SUMMARY"
echo "=================================================="
echo "Passed: $PASS checks"
echo "Failed: $FAIL checks"
echo ""

if [ $FAIL -eq 0 ] && [ $PASS -ge 5 ]; then
    echo "🎉 SUCCESS! Rust WASM battle core is ready!"
    echo ""
    echo "You are ready for Step 4: Create battle-data.service.js"
    echo ""
    exit 0
else
    echo "⚠️  Please fix the issues above"
    echo ""
    echo "Quick fixes:"
    echo "1. Create directory: mkdir -p battle-core/src"
    echo "2. Copy Cargo.toml to battle-core/"
    echo "3. Copy all 7 .rs files to battle-core/src/"
    echo "4. Build: cd battle-core && wasm-pack build --target nodejs --release"
    exit 1
fi
