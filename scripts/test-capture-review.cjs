// Execute the real Chat camera-return and library-picker callbacks with mocked
// device/network boundaries. A media selection must never send or upload.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = ts.createSourceFile('note.tsx', fs.readFileSync(
  path.join(__dirname, '../app/(app)/(tabs)/note.tsx'), 'utf8'),
ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let cameraReturn;
let libraryPicker;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'pickMedia') {
    libraryPicker = node.initializer;
  }
  if (ts.isCallExpression(node) && node.expression.getText(source) === 'useFocusEffect') {
    const callback = node.arguments[0]?.arguments?.[0];
    if (callback?.getText(source).includes('consumeCameraCaptureResult()')) cameraReturn = callback;
  }
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(cameraReturn, 'Find the actual camera-return callback');
assert.ok(libraryPicker, 'Find the actual library-picker callback');

function compile(callback, context) {
  const js = ts.transpileModule(`const callback = ${callback.getText(source)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return vm.runInNewContext(`${js}\ncallback`, context);
}

async function main() {
  let cases = 0;
  for (const text of ['', '   ', 'Caption']) {
    for (const mediaType of ['photo', 'video']) {
      const capture = { uri: `file:///capture.${mediaType === 'photo' ? 'jpg' : 'mov'}`,
        mediaType, mimeType: mediaType === 'photo' ? 'image/jpeg' : 'video/quicktime' };
      for (const origin of ['camera', 'library']) {
        const staged = [];
        let sends = 0;
        const context = {
          text, editingState: null, couple: { id: 'couple' }, user: { id: 'sender' }, hasPartner: true,
          cameraActiveRef: { current: true }, consumeCameraCaptureResult: () => capture,
          logDebugEvent() {}, mimeToExtension: () => 'test',
          setAttachedMedia: media => staged.push(media),
          sendMediaMessage: () => { sends++; },
          Platform: { OS: 'ios' }, PICKER_OPTIONS: {},
          resolveAssetMimeType: () => capture.mimeType,
          Alert: { alert: (...args) => assert.fail(`Unexpected alert: ${args}`) },
          require: name => {
            assert.equal(name, 'expo-image-picker');
            return {
              requestMediaLibraryPermissionsAsync: async () => ({ granted: true }),
              launchImageLibraryAsync: async () => ({ canceled: false,
                assets: [{ uri: capture.uri, type: mediaType === 'photo' ? 'image' : 'video' }] }),
            };
          },
        };
        await compile(origin === 'camera' ? cameraReturn : libraryPicker, context)(origin === 'library' ? 'library' : undefined);
        assert.equal(sends, 0, `${origin}/${mediaType}/${JSON.stringify(text)} must wait for Send`);
        assert.equal(staged.length, 1);
        assert.equal(staged[0].uri, capture.uri);
        assert.equal(staged[0].type, mediaType);
        assert.equal(staged[0].mimeType, capture.mimeType);
        if (origin === 'camera') assert.equal(context.cameraActiveRef.current, false);
        cases++;
      }
    }
  }
  const staged = [];
  compile(cameraReturn, { cameraActiveRef: { current: true },
    consumeCameraCaptureResult: () => null, setAttachedMedia: media => staged.push(media) })();
  assert.equal(staged.length, 0, 'Discarding/retaking must not stage or send media');
  console.log(`Capture review passed: ${cases} attachment cases plus canceled capture.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
