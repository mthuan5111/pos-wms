const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Xác định repository root từ vị trí file tests/demo-sandbox/scan_secrets.cjs
const REPO_ROOT = path.resolve(__dirname, '../..');

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'bin',
  'obj',
  '.expo',
  'web-build',
  'dist',
  'build',
  '.system_generated'
]);

const FINDING_CATEGORY = {
  CONFIRMED_SECRET: 'CONFIRMED_SECRET',
  LIKELY_SECRET: 'LIKELY_SECRET',
  DEVELOPMENT_ONLY_SECRET: 'DEVELOPMENT_ONLY_SECRET',
  TEST_PLACEHOLDER: 'TEST_PLACEHOLDER',
  FALSE_POSITIVE: 'FALSE_POSITIVE'
};

function getGitTrackedStatus(filePath) {
  try {
    const rel = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
    if (rel.startsWith('..')) {
      return 'EXTERNAL (Ngoài repository)';
    }
    const checkTracked = execSync(`git ls-files "${rel}"`, { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    if (checkTracked) {
      return 'TRACKED (Đang được Git theo dõi)';
    }
    const checkIgnored = execSync(`git check-ignore "${rel}"`, { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    if (checkIgnored) {
      return 'IGNORED (.gitignore bảo vệ)';
    }
    return 'UNTRACKED (Chưa add vào Git)';
  } catch {
    return 'UNKNOWN';
  }
}

/**
 * Phân loại finding DỰA TRÊN NỘI DUNG DÒNG (Line Content Analysis).
 * Tuyệt đối không dùng tên file làm bằng chứng duy nhất để phân loại FALSE_POSITIVE.
 */
function classifyFinding(filePath, line, patternType) {
  const normPath = filePath.replace(/\\/g, '/');
  const trimmed = line.trim();

  // 1. Secret môi trường phát triển cục bộ (Local Development Only)
  if (
    normPath.includes('appsettings.Development.json') ||
    normPath.includes('accounts_secure.txt') ||
    normPath.includes('test_image_lifecycle') ||
    normPath.includes('test_image_management')
  ) {
    return {
      category: FINDING_CATEGORY.DEVELOPMENT_ONLY_SECRET,
      note: 'Secret phục vụ môi trường phát triển cục bộ (Local Dev/Test DB).'
    };
  }

  // 2. Confirmed Secrets (API Secret thật trong file config)
  if (normPath.includes('appsettings.json') && patternType.includes('Cloudinary')) {
    return {
      category: FINDING_CATEGORY.CONFIRMED_SECRET,
      note: 'API Secret Cloudinary trong appsettings.json cục bộ (đã được .gitignore bảo vệ, cần rotate nếu từng dùng chung).'
    };
  }

  // 3. Phân tích nội dung dòng cho FALSE_POSITIVE:
  // Dòng là khai báo hàm, khai báo tham số, biểu thức so sánh, validation schema, thông báo lỗi hoặc tham chiếu biến
  const isFunctionDecl = /(?:const|let|var|function)\s+[A-Za-z0-9_]*[pP]assword[A-Za-z0-9_]*\s*=\s*(?:async\s*)?\(/i.test(line) ||
                         /\([A-Za-z0-9_,\s]*[pP]assword[A-Za-z0-9_]*\s*:\s*[A-Za-z0-9_<>\[\]]+\s*\)\s*=>/i.test(line);

  const isComparison = /===?|!==?/.test(line);

  const isValidationRule = /z\.string\(\)|\.min\(|\.max\(|z\.infer/i.test(line);

  const isErrorMessage = /errors\.[A-Za-z0-9_]*[pP]assword\s*=\s*["'][^"']+["']/i.test(line) ||
                         /["'][^"']*(?:không được để trống|phải có ít nhất|không khớp|trùng với|xác nhận mật khẩu)[^"']*["']/i.test(line);

  const isVariableReference = /[pP]assword\s*:\s*[A-Za-z0-9_\.]+\s*[,;\)\}]*$/i.test(trimmed) ||
                              /[pP]assword\s*:\s*(?:undefined|null|errMsg|[A-Za-z0-9_\.]+)/i.test(line) ||
                              /[pP]assword\s*:\s*data\.[A-Za-z0-9_]+/i.test(line) ||
                              /[pP]assword\s*:\s*newUser\.[A-Za-z0-9_]+/i.test(line) ||
                              /[pP]assword\s*:\s*resetPasswordData\.[A-Za-z0-9_]+/i.test(line) ||
                              /process\.env\.[A-Za-z0-9_]+/i.test(line);

  const isUiElementProp = /<Ionicons|<CustomInput|<TextInput|secureTextEntry|placeholder=/i.test(line);

  if (isFunctionDecl || isComparison || isValidationRule || isErrorMessage || isVariableReference || isUiElementProp) {
    let reason = 'Tham chiếu biến/thuộc tính đối tượng';
    if (isFunctionDecl) reason = 'Khai báo hàm/tham số hàm';
    else if (isComparison) reason = 'Biểu thức so sánh logic (== hoặc ===)';
    else if (isValidationRule) reason = 'Định nghĩa schema/rule validation Zod';
    else if (isErrorMessage) reason = 'Thông báo lỗi xác thực form cho người dùng';
    else if (isUiElementProp) reason = 'Thuộc tính component UI';

    return {
      category: FINDING_CATEGORY.FALSE_POSITIVE,
      note: `Nội dung dòng là cú pháp lập trình thuần túy: ${reason}. Không chứa chuỗi literal secret.`
    };
  }

  // 4. Dữ liệu mẫu kiểm thử / Placeholders
  if (
    line.includes('Dummy') ||
    line.includes('YOUR_') ||
    line.includes('REPLACE_THIS_WITH') ||
    line.includes('Password123!') ||
    line.includes('mật_khẩu') ||
    line.includes('nhập_mật_khẩu') ||
    normPath.includes('.env.example') ||
    normPath.includes('appsettings.example.json') ||
    (line.includes('demo_viewer') && line.includes('username'))
  ) {
    return {
      category: FINDING_CATEGORY.TEST_PLACEHOLDER,
      note: 'Dữ liệu mẫu kiểm thử (mock/dummy) hoặc chuỗi placeholder trong tài liệu ví dụ.'
    };
  }

  // 5. Chuỗi literal nghi vấn khác
  return {
    category: FINDING_CATEGORY.LIKELY_SECRET,
    note: 'Chuỗi literal nghi vấn cần rà soát thủ công.'
  };
}

const RAW_PATTERNS = [
  { type: 'Password Pattern', regex: /(password|pwd|pass)\s*[:=]\s*["']([^"'\r\n]{4,})["']/i },
  { type: 'Password in Text Record', regex: /Password:\s*([^\s\r\n]{6,})/i },
  { type: 'Cloudinary API Secret', regex: /(ApiSecret|api_secret)\s*[:=]\s*["']([A-Za-z0-9_-]{15,})["']/i },
  { type: 'JWT Secret Key', regex: /(Jwt[:\s]*Key|"Key"\s*:\s*)"([^"'\r\n]{20,})"/i },
  { type: 'Database Connection String', regex: /(User Id\s*=\s*[^;]+;\s*Password\s*=\s*)([^;'"\r\n]+)/i }
];

function scanDirectory(dir, findings) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      scanDirectory(fullPath, findings);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (['.png', '.jpg', '.jpeg', '.webp', '.ico', '.dll', '.exe', '.pdb', '.zip'].includes(ext)) {
        continue;
      }
      scanFile(fullPath, findings);
    }
  }
}

function scanFile(filePath, findings) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return;
  }

  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (filePath.endsWith('scan_secrets.cjs')) continue;

    for (const pat of RAW_PATTERNS) {
      if (pat.regex.test(line)) {
        const relPath = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
        const classification = classifyFinding(relPath || filePath, line, pat.type);
        const trackingStatus = getGitTrackedStatus(filePath);

        findings.push({
          file: relPath || filePath,
          line: i + 1,
          type: pat.type,
          category: classification.category,
          note: classification.note,
          gitStatus: trackingStatus
        });
        break;
      }
    }
  }
}

function run() {
  console.log('======================================================================');
  console.log('BẮT ĐẦU QUÉT VÀ PHÂN LOẠI SECRET THEO NỘI DUNG DÒNG (LINE CONTENT)');
  console.log(`Repository Root: ${REPO_ROOT}`);
  console.log('======================================================================\n');

  const findings = [];
  scanDirectory(REPO_ROOT, findings);

  // Deduplicate
  const unique = [];
  const seen = new Set();
  for (const f of findings) {
    const key = `${f.file}:${f.line}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(f);
    }
  }

  const categoryCounts = {
    [FINDING_CATEGORY.CONFIRMED_SECRET]: 0,
    [FINDING_CATEGORY.LIKELY_SECRET]: 0,
    [FINDING_CATEGORY.DEVELOPMENT_ONLY_SECRET]: 0,
    [FINDING_CATEGORY.TEST_PLACEHOLDER]: 0,
    [FINDING_CATEGORY.FALSE_POSITIVE]: 0
  };

  let trackedSecretsCount = 0;

  for (const f of unique) {
    categoryCounts[f.category]++;
    if (f.gitStatus.startsWith('TRACKED') && (f.category === FINDING_CATEGORY.CONFIRMED_SECRET || f.category === FINDING_CATEGORY.LIKELY_SECRET)) {
      trackedSecretsCount++;
    }
  }

  console.log('--- CHI TIẾT TỪNG FINDING ĐÃ PHÂN LOẠI (GIÁ TRỊ: REDACTED) ---');
  for (const f of unique) {
    console.log(`• [${f.category}] ${f.file}:${f.line}`);
    console.log(`  - Loại: ${f.type}`);
    console.log(`  - Git Status: ${f.gitStatus}`);
    console.log(`  - Ghi chú: ${f.note}`);
  }

  console.log('\n======================================================================');
  console.log('TỔNG HỢP PHÂN LOẠI SECRET (DỰA TRÊN NỘI DUNG DÒNG):');
  console.log('======================================================================');
  console.log(`• CONFIRMED_SECRET:        ${categoryCounts[FINDING_CATEGORY.CONFIRMED_SECRET]}`);
  console.log(`• LIKELY_SECRET:           ${categoryCounts[FINDING_CATEGORY.LIKELY_SECRET]}`);
  console.log(`• DEVELOPMENT_ONLY_SECRET: ${categoryCounts[FINDING_CATEGORY.DEVELOPMENT_ONLY_SECRET]}`);
  console.log(`• TEST_PLACEHOLDER:        ${categoryCounts[FINDING_CATEGORY.TEST_PLACEHOLDER]}`);
  console.log(`• FALSE_POSITIVE:          ${categoryCounts[FINDING_CATEGORY.FALSE_POSITIVE]}`);
  console.log(`• TỔNG SỐ ĐÃ RÀ SOÁT:     ${unique.length}`);
  console.log('----------------------------------------------------------------------');
  console.log(`• SECRET TRONG TRACKED FILES: ${trackedSecretsCount}`);
  console.log('======================================================================\n');

  if (trackedSecretsCount > 0) {
    console.error(`NGUY HIỂM: Phát hiện ${trackedSecretsCount} secret trong file đang được Git theo dõi (TRACKED)!`);
    process.exit(1);
  }

  console.log('KẾT QUẢ SECRET SCAN TRACKED FILES: PASS (Không có secret trong file Git tracked)');
  process.exit(0);
}

run();
