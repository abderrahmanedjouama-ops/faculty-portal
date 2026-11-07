/**
 * سكربت بناء الواجهة الأمامية للإنتاج (Production Frontend Build)
 * يقوم بنسخ وتجهيز كافة ملفات الواجهة الأمامية من مجلد public/ إلى مجلد dist/
 * ليتم تقديمها مباشرة من خادم Node.js (server.js) في بيئة الإنتاج (Render / Railway).
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

function buildFrontend() {
  if (!fs.existsSync(PUBLIC_DIR)) {
    console.error('❌ مجلد public غير موجود:', PUBLIC_DIR);
    process.exit(1);
  }

  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true, force: true });
  }

  fs.cpSync(PUBLIC_DIR, DIST_DIR, { recursive: true });
  console.log('✅ تم بناء الواجهة الأمامية بنجاح في مجلد dist/');
}

buildFrontend();
