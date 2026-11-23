const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(__dirname + '/../dist/asset-studio/app.js', 'utf8');
const start = source.indexOf('function optimizeColorsBalanced(');
const end = source.indexOf('async function processFavicon(', start);
assert.ok(start >= 0 && end > start);
let size;
let draw;
const context = {
  blobToImage: async file => ({ image: file, width: file.width, height: file.height, close() {} }),
  document: { createElement() { return { width: 0, height: 0, getContext() { return { drawImage(...args) { draw = args; }, getImageData(x, y, w, h) { size = [w, h]; return { data: new Uint8Array(4) }; }, putImageData() {} }; }, toBlob(callback) { callback({ type: 'image/png' }); } }; } }
};
vm.createContext(context);
vm.runInContext(source.slice(start, end) + '\nthis.process = processBackground;', context);
(async () => {
  for (const [input, spec, expected] of [
    [{ width: 1200, height: 800 }, { width: 1892, brightness: .72 }, [1892, 1261]],
    [{ width: 400, height: 1000 }, { width: 393, brightness: .72 }, [393, 983]],
    [{ width: 1892, height: 908 }, { width: 1892, brightness: .72 }, [1892, 908]]
  ]) {
    const output = await context.process(input, spec);
    assert.deepEqual([output.width, output.height], expected);
    assert.deepEqual(size, expected);
    assert.equal(draw.length, 5);
    assert.equal(draw[0], input);
  }
  console.log('Processamento proporcional: 3 cenários aprovados.');
})().catch(error => { console.error(error); process.exitCode = 1; });
