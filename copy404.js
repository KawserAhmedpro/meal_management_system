import fs from 'fs';

// 1. Copy 404.html for GitHub Pages SPA routing
if (fs.existsSync('dist/index.html')) {
  fs.copyFileSync('dist/index.html', 'dist/404.html');
  console.log('✓ Copied dist/index.html to dist/404.html for GitHub Pages SPA routing');
}

// 2. Stamp dynamic build timestamp into dist/sw.js for instant byte-difference detection
if (fs.existsSync('dist/sw.js')) {
  let swContent = fs.readFileSync('dist/sw.js', 'utf8');
  const buildTimestamp = Date.now().toString();
  swContent = swContent.replace(/__BUILD_TIME__/g, buildTimestamp);
  fs.writeFileSync('dist/sw.js', swContent, 'utf8');
  console.log(`✓ Stamped Service Worker build timestamp: ${buildTimestamp}`);
}
