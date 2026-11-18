/**
 * Copies `native/android/VulcanAuthPlugin.java` into the Capacitor Android
 * project (once `npx cap add android` has been run) and registers
 * `VulcanAuthPlugin.class` inside `MainActivity.java`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const androidJavaDir = path.join(
  rootDir,
  'android',
  'app',
  'src',
  'main',
  'java',
  'io',
  'github',
  'openedu',
  'app',
);

const pluginSrc = path.join(rootDir, 'native', 'android', 'VulcanAuthPlugin.java');
const pluginDest = path.join(androidJavaDir, 'VulcanAuthPlugin.java');
const mainActivityPath = path.join(androidJavaDir, 'MainActivity.java');

if (!fs.existsSync(androidJavaDir)) {
  console.log(
    '[setup-android-plugin] Folder android/ jeszcze nie istnieje (uruchom `npx cap add android`, aby go utworzyć). Pomijam.',
  );
  process.exit(0);
}

fs.copyFileSync(pluginSrc, pluginDest);
console.log('[setup-android-plugin] Skopiowano VulcanAuthPlugin.java do projektu Android.');

if (fs.existsSync(mainActivityPath)) {
  let content = fs.readFileSync(mainActivityPath, 'utf8');
  if (!content.includes('VulcanAuthPlugin')) {
    content = content.replace(
      /public class MainActivity extends BridgeActivity\s*\{/,
      `import android.os.Bundle;\n\npublic class MainActivity extends BridgeActivity {\n    @Override\n    public void onCreate(Bundle savedInstanceState) {\n        registerPlugin(VulcanAuthPlugin.class);\n        super.onCreate(savedInstanceState);\n    }`,
    );
    // Clean up duplicate import if Bundle was already imported
    const lines = content.split('\n');
    const seenImports = new Set();
    const deduped = lines.filter((line) => {
      if (line.trim().startsWith('import ')) {
        if (seenImports.has(line.trim())) return false;
        seenImports.add(line.trim());
      }
      return true;
    });
    fs.writeFileSync(mainActivityPath, deduped.join('\n'), 'utf8');
    console.log('[setup-android-plugin] Zarejestrowano VulcanAuthPlugin w MainActivity.java.');
  }
}
