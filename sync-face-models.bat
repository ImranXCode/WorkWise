@echo off
echo === Syncing @vladmandic/face-api model files ===
echo.

if not exist "node_modules\@vladmandic\face-api\model" (
    echo ERROR: node_modules\@vladmandic\face-api\model not found.
    echo Make sure you have run "npm install" first, then re-run this script.
    pause
    exit /b 1
)

if not exist "public\models\face-api" (
    mkdir "public\models\face-api"
)

echo Copying model files from node_modules into public\models\face-api ...
xcopy /Y /I "node_modules\@vladmandic\face-api\model\*" "public\models\face-api\"

echo.
echo === DONE ===
echo Model files copied. Now run: npm run dev
pause
