// jsdom's Blob lacks the promise readers every supported browser has; fill them in with its FileReader.
function read<T>(blob: Blob, method: 'readAsArrayBuffer' | 'readAsText') {
  return new Promise<T>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as T)
    reader.onerror = () => reject(reader.error)
    reader[method](blob)
  })
}

if (typeof Blob !== 'undefined' && typeof FileReader !== 'undefined') {
  if (!Blob.prototype.arrayBuffer) Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob) { return read<ArrayBuffer>(this, 'readAsArrayBuffer') }
  if (!Blob.prototype.text) Blob.prototype.text = function text(this: Blob) { return read<string>(this, 'readAsText') }
}
