const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const EXTENSION_DIR = __dirname;
const OUTPUT_DIR = path.join(__dirname, 'dist');
const OUTPUT_FILE = 'cargoreimaged-helper.zip';

// Files and folders to include in the build
const INCLUDE_PATTERNS = [
  'manifest.json',
  'popup.html',
  'popup.js',
  'src/**/*',
  'assets/**/*'
];

// Files to exclude
const EXCLUDE_PATTERNS = [
  'node_modules',
  'dist',
  'test',
  '*.log',
  '.DS_Store',
  'build.js'
];

async function build() {
  console.log('🚀 Building CargoReimagined Helper extension...');
  
  // Create dist directory if it doesn't exist
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR);
  }
  
  // Create output stream
  const outputPath = path.join(OUTPUT_DIR, OUTPUT_FILE);
  const output = fs.createWriteStream(outputPath);
  const archive = archiver('zip', {
    zlib: { level: 9 } // Maximum compression
  });
  
  // Handle archive events
  output.on('close', () => {
    const size = (archive.pointer() / 1024).toFixed(2);
    console.log(`✅ Extension built successfully!`);
    console.log(`📦 Output: ${outputPath}`);
    console.log(`📏 Size: ${size} KB`);
    console.log(`\n📝 Next steps:`);
    console.log(`1. Go to chrome://extensions/`);
    console.log(`2. Enable "Developer mode"`);
    console.log(`3. Click "Load unpacked" and select the extension folder`);
    console.log(`   OR`);
    console.log(`   Drag and drop ${OUTPUT_FILE} to install`);
  });
  
  archive.on('error', (err) => {
    console.error('❌ Build failed:', err);
    process.exit(1);
  });
  
  archive.on('warning', (err) => {
    if (err.code === 'ENOENT') {
      console.warn('⚠️  Warning:', err);
    } else {
      throw err;
    }
  });
  
  // Pipe archive data to the file
  archive.pipe(output);
  
  // Add files to archive
  INCLUDE_PATTERNS.forEach(pattern => {
    if (pattern.includes('**')) {
      // Handle glob patterns
      const baseDir = pattern.split('**')[0];
      archive.directory(baseDir, baseDir, {
        filter: (entryData) => {
          // Check if file should be excluded
          return !EXCLUDE_PATTERNS.some(exclude => 
            entryData.name.includes(exclude)
          );
        }
      });
    } else {
      // Handle individual files
      const filePath = path.join(EXTENSION_DIR, pattern);
      if (fs.existsSync(filePath)) {
        archive.file(filePath, { name: pattern });
      }
    }
  });
  
  // Validate manifest.json
  try {
    const manifestPath = path.join(EXTENSION_DIR, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    console.log(`📋 Extension: ${manifest.name} v${manifest.version}`);
  } catch (err) {
    console.error('❌ Invalid manifest.json:', err.message);
    process.exit(1);
  }
  
  // Finalize the archive
  await archive.finalize();
}

// Run build
build().catch(err => {
  console.error('❌ Build error:', err);
  process.exit(1);
});