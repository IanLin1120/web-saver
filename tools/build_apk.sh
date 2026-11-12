#!/usr/bin/env bash
# 不用 Gradle 的本機建置：aapt2 → javac → dx → zipalign → apksigner
# 需要：SDK=/path（內含 android-34.jar、dx.jar、bin/aapt2、bin/zipalign、uber.jar）
# 簽章：KS=金鑰檔 KS_PASS=… KEY_ALIAS=… KEY_PASS=…
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SDK="${SDK:-/home/claude/sdk}"
OUT="${OUT:-$ROOT/build}"
VER="$(tr -d '[:space:]' < "$ROOT/VERSION")"
IFS=. read -r A B C <<< "$VER"
CODE=$((A * 10000 + B * 100 + C))
rm -rf "$OUT" && mkdir -p "$OUT/res" "$OUT/cls" "$OUT/gen"

python3 "$ROOT/web/build.py"

sed 's#<manifest xmlns:android="http://schemas.android.com/apk/res/android">#<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.ian.websaver">#' "$ROOT/app/src/main/AndroidManifest.xml" > "$OUT/AndroidManifest.xml"
"$SDK/bin/aapt2" compile --dir "$ROOT/app/src/main/res" -o "$OUT/res.zip"
"$SDK/bin/aapt2" link -o "$OUT/base.apk" -I "$SDK/android-34.jar" \
  --manifest "$OUT/AndroidManifest.xml" \
  --min-sdk-version 26 --target-sdk-version 34 \
  --version-code "$CODE" --version-name "$VER" \
  -A "$ROOT/app/src/main/assets" --java "$OUT/gen" --auto-add-overlay \
  "$OUT/res.zip"

javac -nowarn -source 8 -target 8 -encoding UTF-8 -bootclasspath "$SDK/android-34.jar" -d "$OUT/cls" \
  $(find "$ROOT/app/src/main/java" "$OUT/gen" -name '*.java') 2>&1 | grep -v -E '^(warning|Note|Picked up)|bootstrap|^[0-9]+ warnings?$' || true
java -cp "$SDK/dx.jar" com.android.dx.command.Main --dex --min-sdk-version=26 --output="$OUT/classes.dex" "$OUT/cls" 2>&1 | grep -v 'Picked up' || true

cp "$OUT/base.apk" "$OUT/unsigned.apk"
(cd "$OUT" && zip -q -j unsigned.apk classes.dex)
LD_LIBRARY_PATH="$SDK/bin" "$SDK/bin/zipalign" -p -f 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

NAME="Terra瀏覽器_v${VER}.apk"
java -cp "$SDK/uber.jar" com.android.apksigner.ApkSignerTool sign \
  --ks "$KS" --ks-pass "pass:$KS_PASS" --ks-key-alias "$KEY_ALIAS" --key-pass "pass:$KEY_PASS" \
  --min-sdk-version 26 --v4-signing-enabled false --out "$OUT/signed.apk" "$OUT/aligned.apk" 2>&1 | grep -v 'Picked up' || true
rm -f "$OUT/signed.apk.idsig"; mv "$OUT/signed.apk" "$OUT/$NAME"
java -cp "$SDK/uber.jar" com.android.apksigner.ApkSignerTool verify --verbose "$OUT/signed-check.apk" 2>/dev/null || true
cp "$OUT/$NAME" "$OUT/check.apk"; java -cp "$SDK/uber.jar" com.android.apksigner.ApkSignerTool verify --verbose "$OUT/check.apk" 2>&1 | grep -E 'Verified|v2|v3|ERROR' | head -5
ls -la "$OUT/$NAME"
