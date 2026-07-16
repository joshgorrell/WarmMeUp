const { withXcodeProject } = require('expo/config-plugins');
const path = require('path');
const fs = require('fs');

const PRIVACY_MANIFEST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSPrivacyTracking</key>
  <false/>
  <key>NSPrivacyTrackingDomains</key>
  <array/>
  <key>NSPrivacyCollectedDataTypes</key>
  <array>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypeEmailAddress</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <true/>
      <key>NSPrivacyCollectedDataTypeTracking</key>
      <false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array>
        <string>NSPrivacyCollectedDataTypePurposeAccountManagement</string>
      </array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypeName</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <true/>
      <key>NSPrivacyCollectedDataTypeTracking</key>
      <false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array>
        <string>NSPrivacyCollectedDataTypePurposeAccountManagement</string>
      </array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypePhototosorVideos</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <true/>
      <key>NSPrivacyCollectedDataTypeTracking</key>
      <false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array>
        <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
      </array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypeOtherUserContent</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <true/>
      <key>NSPrivacyCollectedDataTypeTracking</key>
      <false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array>
        <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
      </array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypePreciseLocation</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <false/>
      <key>NSPrivacyCollectedDataTypeTracking</key>
      <false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array>
        <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
      </array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypeUserID</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <true/>
      <key>NSPrivacyCollectedDataTypeTracking</key>
      <false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array>
        <string>NSPrivacyCollectedDataTypePurposeAccountManagement</string>
        <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
      </array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypePurchaseHistory</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <true/>
      <key>NSPrivacyCollectedDataTypeTracking</key>
      <false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array>
        <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
      </array>
    </dict>
  </array>
  <key>NSPrivacyAccessedAPITypes</key>
  <array>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array>
        <string>CA92.1</string>
      </array>
    </dict>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryFileTimestamp</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array>
        <string>C617.1</string>
      </array>
    </dict>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategorySystemBootTime</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array>
        <string>35F9.1</string>
      </array>
    </dict>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryDiskSpace</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array>
        <string>E174.1</string>
      </array>
    </dict>
  </array>
</dict>
</plist>
`;

function withPrivacyManifest(config) {
  return withXcodeProject(config, (modConfig) => {
    const manifestPath = path.join(
      modConfig.modRequest.platformProjectRoot,
      'PrivacyInfo.xcprivacy'
    );
    fs.writeFileSync(manifestPath, PRIVACY_MANIFEST);

    const project = modConfig.modResults;
    const target = project.getFirstTarget().firstTarget;

    // Check if already added
    const fileRefSection = project.pbxFileReferenceSection();
    const alreadyExists = Object.values(fileRefSection).some(
      (ref) => ref && ref.path === 'PrivacyInfo.xcprivacy'
    );
    if (alreadyExists) return modConfig;

    // Generate UUIDs for the file reference and build file
    const fileRefUuid = project.generateUuid();
    const buildFileUuid = project.generateUuid();

    // Add PBXFileReference
    fileRefSection[fileRefUuid] = {
      isa: 'PBXFileReference',
      lastKnownFileType: 'text.xml',
      path: 'PrivacyInfo.xcprivacy',
      sourceTree: '"<group>"',
      uuid: fileRefUuid,
    };

    // Add PBXBuildFile
    const buildFileSection = project.pbxBuildFileSection();
    buildFileSection[buildFileUuid] = {
      isa: 'PBXBuildFile',
      fileRef: fileRefUuid,
      fileRef_comment: 'PrivacyInfo.xcprivacy',
      uuid: buildFileUuid,
    };

    // Add to the target's resources build phase
    const resourcesPhases = project.hash.project.objects.PBXResourcesBuildPhase;
    if (resourcesPhases) {
      for (const key of Object.keys(resourcesPhases)) {
        if (key.startsWith('_')) continue;
        const phase = resourcesPhases[key];
        if (phase && phase.isa === 'PBXResourcesBuildPhase') {
          phase.files = phase.files || [];
          phase.files.push({
            value: buildFileUuid,
            comment: 'PrivacyInfo.xcprivacy in Resources',
          });
        }
      }
    }

    // Add to the main group so it appears in Xcode's project navigator
    const groups = project.hash.project.objects.PBXGroup;
    const mainGroupKey = project.hash.project.mainGroup;
    if (groups && mainGroupKey && groups[mainGroupKey]) {
      groups[mainGroupKey].children = groups[mainGroupKey].children || [];
      groups[mainGroupKey].children.push({
        value: fileRefUuid,
        comment: 'PrivacyInfo.xcprivacy',
      });
    }

    return modConfig;
  });
}

module.exports = withPrivacyManifest;
