const {
  withInfoPlist,
  withEntitlementsPlist,
  withAndroidManifest,
  withDangerousMod,
  withXcodeProject,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function copyFilesRecursive(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyFilesRecursive(src, dest);
    } else {
      fs.copyFileSync(src, dest);
    }
  }
}

// ---------------------------------------------------------------------------
// iOS – Info.plist entries
// ---------------------------------------------------------------------------

function withIOSInfoPlist(config) {
  return withInfoPlist(config, (mod) => {
    mod.modResults.NSBluetoothAlwaysUsageDescription =
      mod.modResults.NSBluetoothAlwaysUsageDescription ||
      'Vela Wallet uses Bluetooth to securely connect with the Vela Connect browser extension.';

    mod.modResults.NSBluetoothPeripheralUsageDescription =
      mod.modResults.NSBluetoothPeripheralUsageDescription ||
      'Vela Wallet uses Bluetooth to securely connect with the Vela Connect browser extension.';

    mod.modResults.NSCameraUsageDescription =
      mod.modResults.NSCameraUsageDescription ||
      'Vela Wallet uses the camera to scan QR codes for wallet addresses.';

    if (!Array.isArray(mod.modResults.UIBackgroundModes)) {
      mod.modResults.UIBackgroundModes = [];
    }
    if (!mod.modResults.UIBackgroundModes.includes('bluetooth-peripheral')) {
      mod.modResults.UIBackgroundModes.push('bluetooth-peripheral');
    }

    return mod;
  });
}

// ---------------------------------------------------------------------------
// iOS – Entitlements (iCloud KV Store + Associated Domains for passkeys)
// ---------------------------------------------------------------------------

function withIOSEntitlements(config) {
  return withEntitlementsPlist(config, (mod) => {
    // iCloud KV Store
    mod.modResults['com.apple.developer.ubiquity-kvstore-identifier'] =
      '$(TeamIdentifierPrefix)$(CFBundleIdentifier)';

    // Associated Domains for passkeys
    if (!Array.isArray(mod.modResults['com.apple.developer.associated-domains'])) {
      mod.modResults['com.apple.developer.associated-domains'] = [];
    }
    const domains = mod.modResults['com.apple.developer.associated-domains'];
    if (!domains.includes('webcredentials:getvela.app')) {
      domains.push('webcredentials:getvela.app');
    }

    return mod;
  });
}

// ---------------------------------------------------------------------------
// iOS – Copy Swift / ObjC source files into the Xcode project
// ---------------------------------------------------------------------------

function withIOSSourceFiles(config) {
  return withDangerousMod(config, [
    'ios',
    (mod) => {
      const projectRoot = mod.modRequest.projectRoot;
      const projectName = mod.modRequest.projectName || 'velawallet';
      // Copy directly into the project root so Xcode compiles them automatically.
      // Subdirectories under ios/<project>/ are NOT auto-included in the build.
      const destDir = path.join(projectRoot, 'ios', projectName);

      const modules = ['vela-ble', 'vela-passkey', 'vela-cloud-sync'];
      for (const moduleName of modules) {
        const srcDir = path.join(projectRoot, 'modules', moduleName, 'ios');
        if (!fs.existsSync(srcDir)) continue;
        for (const file of fs.readdirSync(srcDir)) {
          fs.copyFileSync(
            path.join(srcDir, file),
            path.join(destDir, file),
          );
        }
      }

      // Patch the bridging header so Swift can see React Native types
      const bridgingHeader = path.join(destDir, `${projectName}-Bridging-Header.h`);
      if (fs.existsSync(bridgingHeader)) {
        let content = fs.readFileSync(bridgingHeader, 'utf8');
        const requiredImports = [
          '#import <React/RCTBridgeModule.h>',
          '#import <React/RCTEventEmitter.h>',
          '#import <React/RCTViewManager.h>',
        ];
        for (const imp of requiredImports) {
          if (!content.includes(imp)) {
            content += `\n${imp}`;
          }
        }
        fs.writeFileSync(bridgingHeader, content, 'utf8');
      }

      return mod;
    },
  ]);
}

// ---------------------------------------------------------------------------
// Android – Permissions in AndroidManifest.xml
// ---------------------------------------------------------------------------

function withAndroidPermissions(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;

    const requiredPermissions = [
      'android.permission.BLUETOOTH',
      'android.permission.BLUETOOTH_ADMIN',
      'android.permission.BLUETOOTH_ADVERTISE',
      'android.permission.BLUETOOTH_CONNECT',
      'android.permission.CAMERA',
    ];

    if (!Array.isArray(manifest['uses-permission'])) {
      manifest['uses-permission'] = [];
    }

    const existing = new Set(
      manifest['uses-permission'].map((p) => p.$?.['android:name'])
    );

    for (const perm of requiredPermissions) {
      if (!existing.has(perm)) {
        manifest['uses-permission'].push({
          $: { 'android:name': perm },
        });
      }
    }

    // Set android:allowBackup="true" on the <application> element
    const app = manifest.application?.[0];
    if (app) {
      app.$['android:allowBackup'] = 'true';
    }

    return mod;
  });
}

// ---------------------------------------------------------------------------
// Android – Copy Kotlin source files and register ReactPackages
// ---------------------------------------------------------------------------

function withAndroidSourceFiles(config) {
  return withDangerousMod(config, [
    'android',
    (mod) => {
      const projectRoot = mod.modRequest.projectRoot;
      const androidJavaDir = path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'java',
        'com',
        'velawallet'
      );

      // Copy Kotlin files for each module
      const moduleMappings = [
        { name: 'vela-ble', subdir: 'ble' },
        { name: 'vela-passkey', subdir: 'passkey' },
        { name: 'vela-cloud-sync', subdir: 'cloudsync' },
      ];

      for (const { name, subdir } of moduleMappings) {
        const srcDir = path.join(
          projectRoot,
          'modules',
          name,
          'android',
          'src',
          'main',
          'java',
          'com',
          'velawallet',
          subdir
        );
        const destDir = path.join(androidJavaDir, subdir);
        copyFilesRecursive(srcDir, destDir);
      }

      // Register ReactPackages in MainApplication
      registerAndroidPackages(projectRoot);

      return mod;
    },
  ]);
}

function registerAndroidPackages(projectRoot) {
  const mainAppDir = path.join(
    projectRoot,
    'android',
    'app',
    'src',
    'main',
    'java',
    'com',
    'velawallet',
    'wallet'
  );

  // Try both .kt and .java
  const ktPath = path.join(mainAppDir, 'MainApplication.kt');
  const javaPath = path.join(mainAppDir, 'MainApplication.java');

  // Also check the root package directory
  const altDir = path.join(
    projectRoot,
    'android',
    'app',
    'src',
    'main',
    'java',
    'app',
    'getvela',
    'wallet'
  );
  const altKtPath = path.join(altDir, 'MainApplication.kt');
  const altJavaPath = path.join(altDir, 'MainApplication.java');

  let mainAppPath = null;
  for (const candidate of [ktPath, javaPath, altKtPath, altJavaPath]) {
    if (fs.existsSync(candidate)) {
      mainAppPath = candidate;
      break;
    }
  }

  if (!mainAppPath) {
    console.warn(
      '[with-native-modules] MainApplication not found – skipping package registration. ' +
      'You may need to register the packages manually.'
    );
    return;
  }

  let content = fs.readFileSync(mainAppPath, 'utf8');

  const imports = [
    'import com.velawallet.ble.VelaBLEPackage',
    'import com.velawallet.passkey.VelaPasskeyPackage',
    'import com.velawallet.cloudsync.VelaCloudSyncPackage',
  ];

  const packageRegistrations = [
    'packages.add(VelaBLEPackage())',
    'packages.add(VelaPasskeyPackage())',
    'packages.add(VelaCloudSyncPackage())',
  ];

  // Add imports (after the last existing import line)
  for (const imp of imports) {
    if (!content.includes(imp)) {
      // Insert after the last import statement
      const lastImportIdx = content.lastIndexOf('\nimport ');
      if (lastImportIdx !== -1) {
        const endOfLine = content.indexOf('\n', lastImportIdx + 1);
        content =
          content.slice(0, endOfLine + 1) +
          imp +
          '\n' +
          content.slice(endOfLine + 1);
      }
    }
  }

  // Add package registrations inside getPackages()
  for (const reg of packageRegistrations) {
    if (!content.includes(reg)) {
      // Look for the getPackages method and add after "val packages = ..." or
      // after "PackageList(this).packages" pattern
      const packagesPattern = /PackageList\(this\)\.packages/;
      const match = content.match(packagesPattern);
      if (match) {
        const insertIdx = content.indexOf('\n', match.index) + 1;
        content =
          content.slice(0, insertIdx) +
          '            ' +
          reg +
          '\n' +
          content.slice(insertIdx);
      }
    }
  }

  fs.writeFileSync(mainAppPath, content, 'utf8');
}

// ---------------------------------------------------------------------------
// iOS – Add native module files to Xcode project (pbxproj)
// ---------------------------------------------------------------------------

function withXcodeProjectFiles(config) {
  return withXcodeProject(config, (mod) => {
    const project = mod.modResults;
    const projectName = mod.modRequest.projectName || 'velawallet';

    // Find the main group for the app target
    const mainGroup = project.getFirstProject().firstProject.mainGroup;
    const appGroupKey = Object.keys(project.hash.project.objects.PBXGroup)
      .find((key) => {
        const group = project.hash.project.objects.PBXGroup[key];
        return typeof group === 'object' && group.name === projectName;
      });

    // Native module files to add
    const nativeFiles = [
      'VelaBLEModule.swift',
      'VelaBLEModule.m',
      'VelaPasskeyModule.swift',
      'VelaPasskeyModule.m',
      'VelaCloudSyncModule.swift',
      'VelaCloudSyncModule.m',
    ];

    for (const fileName of nativeFiles) {
      // Skip if already in project
      const alreadyAdded = Object.values(project.hash.project.objects.PBXFileReference || {})
        .some((ref) => typeof ref === 'object' && ref.name === fileName);

      if (alreadyAdded) continue;

      const filePath = fileName;
      if (fileName.endsWith('.swift')) {
        project.addSourceFile(filePath, { target: project.getFirstTarget().uuid }, appGroupKey);
      } else if (fileName.endsWith('.m')) {
        project.addSourceFile(filePath, { target: project.getFirstTarget().uuid }, appGroupKey);
      }
    }

    return mod;
  });
}

// ---------------------------------------------------------------------------
// Main plugin – composes all sub-plugins
// ---------------------------------------------------------------------------

function withNativeModules(config) {
  // iOS
  config = withIOSInfoPlist(config);
  config = withIOSEntitlements(config);
  config = withIOSSourceFiles(config);
  config = withXcodeProjectFiles(config);

  // Android
  config = withAndroidPermissions(config);
  config = withAndroidSourceFiles(config);

  return config;
}

module.exports = withNativeModules;
