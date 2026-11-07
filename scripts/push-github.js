/**
 * سكربت رفع ملفات المشروع إلى GitHub عبر واجهة Contents API
 * باستخدام مكتبة https المدمجة في Node.js وبروتوكول IPv4 حصراً (family: 4)
 *
 * طريقة التشغيل في PowerShell داخل المسار f:\project 7:
 *   node scripts/push-github.js <GITHUB_TOKEN>
 * أو مع تحديد رابط المستودع:
 *   node scripts/push-github.js <REPO_URL> <GITHUB_TOKEN>
 *
 * ملاحظة أمنية: لا يتم حفظ الرمز السري (Token) داخل الكود إطلاقاً.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const dns = require('dns');

if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

const DEFAULT_OWNER = 'abdalaUoi';
const DEFAULT_REPO = 'FST';
const BRANCH = 'main';
const REQUEST_TIMEOUT_MS = 30000;
const MAX_RETRIES = 3;

function parseCliArgs() {
  const args = process.argv.slice(2).map(a => a.trim()).filter(Boolean);
  let repoUrl = '';
  let token = (process.env.GITHUB_TOKEN || '').trim();

  if (args.length === 1) {
    token = args[0];
  } else if (args.length >= 2) {
    if (args[0].startsWith('ghp_') || args[0].startsWith('github_pat_')) {
      token = args[0];
      repoUrl = args[1];
    } else {
      repoUrl = args[0];
      token = args[1];
    }
  }

  let owner = DEFAULT_OWNER;
  let repo = DEFAULT_REPO;
  if (repoUrl) {
    const cleaned = repoUrl.replace(/\.git$/i, '').replace(/\/+$/, '');
    const match = cleaned.match(/github\.com[/:]([^/]+)\/([^/]+)$/i) || cleaned.match(/^([^/]+)\/([^/]+)$/);
    if (match) {
      owner = match[1];
      repo = match[2];
    }
  }

  return { owner, repo, token };
}

const { owner: CLI_OWNER, repo: CLI_REPO, token: TOKEN } = parseCliArgs();
const ROOT_DIR = path.resolve(__dirname, '..');

if (!TOKEN) {
  console.error('❌ يرجى تمرير رمز GitHub السري (Token) عند التشغيل:');
  console.error('   node scripts/push-github.js <YOUR_GITHUB_TOKEN>');
  console.error('   أو: node scripts/push-github.js <GITHUB_REPO_URL> <YOUR_GITHUB_TOKEN>');
  process.exit(1);
}

// المجلدات والملفات المستثناة من الرفع (مطابقة لـ .gitignore)
const IGNORED_NAMES = new Set([
  'node_modules',
  '.netlify',
  'dist',
  'build',
  'data',
  '.git',
  '.env',
  '.env.local',
  '.DS_Store',
  'Thumbs.db',
  'Desktop.ini',
  '.vscode',
  '.idea',
  'upload-to-github.js'
]);

function shouldIgnore(relPath, name) {
  if (IGNORED_NAMES.has(name)) return true;
  if (name.startsWith('.env.')) return true;
  if (name.endsWith('.log')) return true;
  if (
    name.endsWith('.sqlite') ||
    name.endsWith('.sqlite-wal') ||
    name.endsWith('.sqlite-shm') ||
    name.endsWith('.sqlite-journal')
  ) {
    return true;
  }
  return false;
}

function collectFiles(dir, baseDir = dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
    if (shouldIgnore(relPath, entry.name)) continue;
    if (entry.isDirectory()) {
      collectFiles(fullPath, baseDir, out);
    } else if (entry.isFile()) {
      out.push({ fullPath, relPath });
    }
  }
  return out;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const ipv4Agent = new https.Agent({
  keepAlive: true,
  family: 4,
  timeout: REQUEST_TIMEOUT_MS
});

function ghHttpsRequest(endpoint, method = 'GET', bodyObj = null) {
  return new Promise((resolve, reject) => {
    const payload = bodyObj ? Buffer.from(JSON.stringify(bodyObj), 'utf8') : null;

    const options = {
      hostname: 'api.github.com',
      port: 443,
      path: endpoint,
      method,
      family: 4,
      timeout: REQUEST_TIMEOUT_MS,
      agent: ipv4Agent,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'FST-Portal-NodeHttps-Uploader/1.0',
        ...(payload
          ? {
              'Content-Type': 'application/json; charset=utf-8',
              'Content-Length': payload.length
            }
          : {})
      }
    };

    const req = https.request(options, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const rawText = Buffer.concat(chunks).toString('utf8');
        let data = null;
        try {
          data = rawText ? JSON.parse(rawText) : null;
        } catch {
          data = { raw: rawText };
        }
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          data
        });
      });
    });

    req.on('timeout', () => {
      req.destroy(
        new Error(`انتهت مهلة الاتصال (${REQUEST_TIMEOUT_MS}ms) عند الطلب: ${method} ${endpoint}`)
      );
    });

    req.on('error', err => reject(err));

    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

async function ghRequestWithRetry(endpoint, method = 'GET', bodyObj = null, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await ghHttpsRequest(endpoint, method, bodyObj);
      if (res.status >= 500 && attempt < retries) {
        console.warn(`   ⚠️ استجابة الخادم (${res.status}) — إعادة المحاولة (${attempt}/${retries})...`);
        await sleep(1500 * attempt);
        continue;
      }
      return res;
    } catch (err) {
      if (attempt < retries) {
        console.warn(
          `   ⚠️ تعثر الاتصال (${err.code || err.message}) — إعادة المحاولة (${attempt}/${retries})...`
        );
        await sleep(1500 * attempt);
      } else {
        throw err;
      }
    }
  }
}

async function resolveOwnerAndEnsureRepo() {
  let owner = CLI_OWNER;
  const repo = CLI_REPO;

  const userRes = await ghRequestWithRetry('/user', 'GET');
  if (userRes.ok && userRes.data?.login) {
    owner = userRes.data.login;
  }

  const repoCheck = await ghRequestWithRetry(`/repos/${owner}/${repo}`, 'GET');
  if (repoCheck.status === 404) {
    console.log(`ℹ️ المستودع ${owner}/${repo} غير موجود بعد — جاري إنشاؤه تلقائياً...`);
    const createRes = await ghRequestWithRetry('/user/repos', 'POST', {
      name: repo,
      description: 'البوابة الرقمية لطلب الوثائق البيداغوجية والإدارية - كلية العلوم والتكنولوجيا',
      private: false,
      auto_init: false
    });
    if (!createRes.ok) {
      throw new Error(
        `تعذر إنشاء المستودع ${repo} (${createRes.status}): ${JSON.stringify(createRes.data)}`
      );
    }
  }

  return { owner, repo };
}

async function uploadSingleFileViaContentsApi(owner, repo, file, index, total) {
  const encodedPath = file.relPath
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/');

  const endpoint = `/repos/${owner}/${repo}/contents/${encodedPath}`;
  const contentBase64 = fs.readFileSync(file.fullPath).toString('base64');

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      let existingSha = null;
      const existingCheck = await ghHttpsRequest(
        `${endpoint}?ref=${encodeURIComponent(BRANCH)}`,
        'GET'
      );
      if (existingCheck.ok && existingCheck.data?.sha) {
        existingSha = existingCheck.data.sha;
      }

      const putBody = {
        message: `Upload ${file.relPath}`,
        content: contentBase64,
        branch: BRANCH,
        ...(existingSha ? { sha: existingSha } : {})
      };

      const putRes = await ghHttpsRequest(endpoint, 'PUT', putBody);
      if (putRes.ok) {
        console.log(`   [${index}/${total}] ✓ تم رفع: ${file.relPath}`);
        return;
      }

      if (attempt < MAX_RETRIES) {
        console.warn(
          `   ⚠️ تعذر رفع ${file.relPath} (حالة ${putRes.status}) — إعادة المحاولة (${attempt}/${MAX_RETRIES})...`
        );
        await sleep(1500 * attempt);
      } else {
        throw new Error(
          `فشل رفع الملف ${file.relPath} (${putRes.status}): ${JSON.stringify(putRes.data)}`
        );
      }
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        console.warn(
          `   ⚠️ خطأ أثناء رفع ${file.relPath} (${err.code || err.message}) — إعادة المحاولة (${attempt}/${MAX_RETRIES})...`
        );
        await sleep(1500 * attempt);
      } else {
        throw err;
      }
    }
  }
}

async function main() {
  const files = collectFiles(ROOT_DIR);
  console.log(`📦 تم العثور على ${files.length} ملفاً جاهزاً للرفع إلى GitHub...`);

  const { owner, repo } = await resolveOwnerAndEnsureRepo();
  console.log(
    `✅ الاتصال ناجح بحساب GitHub: ${owner} — جاري الرفع المتسلسل إلى ${owner}/${repo} (فرع ${BRANCH})...\n`
  );

  for (let i = 0; i < files.length; i++) {
    await uploadSingleFileViaContentsApi(owner, repo, files[i], i + 1, files.length);
  }

  console.log(`\n🎉 اكتمل رفع جميع الملفات (${files.length}/${files.length}) بنجاح إلى:`);
  console.log(`   https://github.com/${owner}/${repo}/tree/${BRANCH}`);
}

main().catch(err => {
  console.error('\n❌ خطأ أثناء الرفع إلى GitHub:', err.code || '', err.message);
  process.exit(1);
});
